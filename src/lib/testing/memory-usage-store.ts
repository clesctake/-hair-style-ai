import type {
  AttemptIdentity, IssueUsageGrant, ReserveUsage, RetryUsage, ServerUsageStore,
  UsageAttempt, UsageDecision, UsageDenialCode, UsageDenied, UsageEvent,
  UsageGrant, UsageGrantDecision, UsageJob, UsageJobDecision, UsageOwner, UsagePolicy,
} from '../server-usage.ts';

/**
 * TEST ONLY: process-local serialized reference implementation. Never import this
 * from a route, Worker, dispatcher or production adapter. Restart loses its data;
 * it cannot coordinate multiple processes and is NOT a spending authorization.
 */
export class MemoryUsageStore implements ServerUsageStore {
  readonly mode = 'TEST_ONLY' as const;
  readonly #policy: UsagePolicy;
  readonly #configured: boolean;
  readonly #clock: () => number;
  readonly #id: (prefix: string) => string;
  #tail: Promise<void> = Promise.resolve();
  #lastTime = 0;
  readonly #grants = new Map<string, UsageGrant>();
  readonly #approvalDedup = new Map<string, string>();
  readonly #jobs = new Map<string, UsageJob>();
  readonly #dedup = new Map<string, string>();
  readonly #inputDedup = new Map<string, string>();
  readonly #retryDedup = new Map<string, { fromAttemptId: string; toAttemptId: string }>();
  readonly #userAttempts = new Map<string, number>();
  readonly #sessionAttempts = new Map<string, number>();
  #totalAttempts = 0;

  constructor(policy: UsagePolicy, options: { clock?: () => number; testIdFactory?: (prefix: string) => string } = {}) {
    const policySnapshot = snapshot(policy);
    this.#configured = !!policySnapshot && validPolicy(policySnapshot);
    this.#policy = policySnapshot ?? {} as UsagePolicy;
    this.#clock = options.clock ?? Date.now;
    this.#id = options.testIdFactory ?? id;
  }

  async issueGrant(input: IssueUsageGrant): Promise<UsageGrantDecision> {
    // Snapshot before awaiting the mutex: caller mutation cannot change a command.
    const command = snapshot(input);
    return this.#atomic(() => {
      const now = this.#now();
      if (now === null) return deny('CONFIGURATION_UNAVAILABLE');
      this.#expire(now);
      if (!command || !validOwner(command.owner) || !opaque(command.approvalId)
        || !positive(command.maxAttempts) || command.maxAttempts > this.#policy.maxAttemptsPerGrant
        || !Number.isSafeInteger(command.expiresAt) || command.expiresAt <= now
        || command.expiresAt - now > this.#policy.maxGrantTtlMs
        || !Array.isArray(command.operations) || command.operations.length < 1 || command.operations.length > 2
        || command.operations.some(operation => !validOperation(operation))
        || new Set(command.operations).size !== command.operations.length) return deny('INVALID_INPUT');
      const existing = this.#grants.get(this.#approvalDedup.get(command.approvalId) ?? '');
      if (existing) {
        if (!sameOwner(existing.owner, command.owner)) return deny('NOT_AUTHORIZED');
        if (existing.maxAttempts !== command.maxAttempts || existing.expiresAt !== command.expiresAt
          || JSON.stringify([...existing.operations].sort()) !== JSON.stringify([...command.operations].sort())) return deny('IDEMPOTENCY_CONFLICT');
        return { ok: true, grant: structuredClone(existing) };
      }
      const grant: UsageGrant = { ...command, grantId: this.#id('grant'), issuedAt: now, consumedAttempts: 0 };
      this.#grants.set(grant.grantId, grant);
      this.#approvalDedup.set(command.approvalId, grant.grantId);
      return { ok: true, grant: structuredClone(grant) };
    });
  }

  async reserve(input: ReserveUsage): Promise<UsageDecision> {
    const command = snapshot(input);
    return this.#atomic(() => {
      const now = this.#now();
      if (now === null) return deny('CONFIGURATION_UNAVAILABLE');
      this.#expire(now);
      if (!command || !validOwner(command.owner) || !opaque(command.grantId)
        || !validOperation(command.operation) || !opaque(command.requestKey)
        || !validHash(command.inputSha256)) return deny('INVALID_INPUT');
      const grant = this.#ownedGrant(command.owner, command.grantId);
      if (!grant) return deny('NOT_AUTHORIZED');
      if (grant.expiresAt <= now) return deny('GRANT_EXPIRED');
      if (!grant.operations.includes(command.operation)) return deny('OPERATION_NOT_ALLOWED');
      const dedupKey = JSON.stringify([command.owner.userId, command.owner.sessionId, command.requestKey]);
      const existing = this.#jobs.get(this.#dedup.get(dedupKey) ?? '');
      if (existing) {
        if (existing.inputSha256 !== command.inputSha256 || existing.operation !== command.operation
          || existing.grantId !== command.grantId) return deny('IDEMPOTENCY_CONFLICT');
        return decision(existing, latest(existing), true);
      }
      const signatureKey = JSON.stringify([grant.grantId, command.operation, command.inputSha256]);
      const sameInput = this.#jobs.get(this.#inputDedup.get(signatureKey) ?? '');
      if (sameInput) {
        this.#dedup.set(dedupKey, sameInput.jobId);
        return decision(sameInput, latest(sameInput), true);
      }
      const denied = this.#checkCapacity(grant, now);
      if (denied) return denied;
      const job: UsageJob = {
        jobId: this.#id('job'), owner: structuredClone(command.owner), grantId: grant.grantId,
        operation: command.operation, inputSha256: command.inputSha256, createdAt: now,
        attempts: [], history: [],
      };
      const attempt = this.#reserveAttempt(job, grant, now);
      this.#jobs.set(job.jobId, job);
      this.#dedup.set(dedupKey, job.jobId);
      this.#inputDedup.set(signatureKey, job.jobId);
      return decision(job, attempt, false);
    });
  }

  async markSent(input: AttemptIdentity): Promise<UsageDecision> {
    const command = snapshot(input);
    return this.#atomic(() => {
      const now = this.#now();
      if (now === null) return deny('CONFIGURATION_UNAVAILABLE');
      this.#expire(now);
      const found = this.#find(command);
      if (!found.ok) return found;
      const { job, attempt } = found;
      // A replay may inspect the existing SENT record; it never authorizes a second send.
      if (attempt.state !== 'RESERVED') return deny('INVALID_TRANSITION');
      const grant = this.#ownedGrant(job.owner, job.grantId);
      if (!grant || grant.expiresAt <= now) return deny('GRANT_EXPIRED');
      this.#transition(job, attempt, 'SENT', 'PROVIDER_SEND', now, now + this.#policy.sentTtlMs);
      return decision(job, attempt, false);
    });
  }

  async settle(input: AttemptIdentity & { outcome: 'UNKNOWN' | 'FAILED' | 'SUCCEEDED' }): Promise<UsageDecision> {
    const command = snapshot(input);
    return this.#atomic(() => {
      const now = this.#now();
      if (now === null) return deny('CONFIGURATION_UNAVAILABLE');
      this.#expire(now);
      if (!command || !['UNKNOWN', 'FAILED', 'SUCCEEDED'].includes(command.outcome)) return deny('INVALID_INPUT');
      const found = this.#find(command);
      if (!found.ok) return found;
      const { job, attempt } = found;
      if (attempt.state === command.outcome) return decision(job, attempt, true);
      if (attempt.state !== 'SENT' && attempt.state !== 'UNKNOWN') return deny('INVALID_TRANSITION');
      const reason = command.outcome === 'UNKNOWN' ? 'OUTCOME_UNCERTAIN'
        : command.outcome === 'FAILED' ? 'PROVIDER_FAILURE' : 'PROVIDER_SUCCESS';
      // UNKNOWN can be closed only with a positively established provider outcome,
      // never merely a client timeout. All reserved attempts remain consumed.
      this.#transition(job, attempt, command.outcome, reason, now);
      return decision(job, attempt, false);
    });
  }

  async cancelBeforeSend(input: AttemptIdentity): Promise<UsageDecision> {
    const command = snapshot(input);
    return this.#atomic(() => {
      const now = this.#now();
      if (now === null) return deny('CONFIGURATION_UNAVAILABLE');
      this.#expire(now);
      const found = this.#find(command);
      if (!found.ok) return found;
      if (found.attempt.state !== 'RESERVED') return deny('INVALID_TRANSITION');
      this.#transition(found.job, found.attempt, 'FAILED', 'CANCELLED_BEFORE_SEND', now);
      return decision(found.job, found.attempt, false);
    });
  }

  async retry(input: RetryUsage): Promise<UsageDecision> {
    const command = snapshot(input);
    return this.#atomic(() => {
      const now = this.#now();
      if (now === null) return deny('CONFIGURATION_UNAVAILABLE');
      this.#expire(now);
      if (!command || !opaque(command.retryKey)) return deny('INVALID_INPUT');
      const found = this.#find(command);
      if (!found.ok) return found;
      const { job, attempt } = found;
      const retryKey = JSON.stringify([job.jobId, command.retryKey]);
      const existing = this.#retryDedup.get(retryKey);
      if (existing) {
        if (existing.fromAttemptId !== command.attemptId) return deny('IDEMPOTENCY_CONFLICT');
        const reserved = job.attempts.find(candidate => candidate.attemptId === existing.toAttemptId);
        return reserved ? decision(job, reserved, true) : deny('STORE_UNAVAILABLE');
      }
      if (attempt.state === 'UNKNOWN') return deny('OUTCOME_UNCERTAIN');
      if (attempt.state !== 'FAILED' || latest(job).attemptId !== attempt.attemptId) return deny('INVALID_TRANSITION');
      if (job.attempts.length - 1 >= this.#policy.maxRetriesPerJob) return deny('RETRY_LIMIT');
      const grant = this.#ownedGrant(job.owner, job.grantId);
      if (!grant) return deny('NOT_AUTHORIZED');
      const denied = this.#checkCapacity(grant, now);
      if (denied) return denied;
      const reserved = this.#reserveAttempt(job, grant, now);
      this.#retryDedup.set(retryKey, { fromAttemptId: attempt.attemptId, toAttemptId: reserved.attemptId });
      return decision(job, reserved, false);
    });
  }

  async readJob(input: { owner: UsageOwner; jobId: string }): Promise<UsageJobDecision> {
    const command = snapshot(input);
    return this.#atomic(() => {
      const now = this.#now();
      if (now === null) return deny('CONFIGURATION_UNAVAILABLE');
      this.#expire(now);
      if (!command || !validOwner(command.owner) || !opaque(command.jobId)) return deny('INVALID_INPUT');
      const job = this.#jobs.get(command.jobId);
      if (!job || !sameOwner(command.owner, job.owner)) return deny('NOT_FOUND');
      return { ok: true, job: structuredClone(job) };
    });
  }

  #atomic<T>(action: () => T): Promise<T> {
    const result = this.#tail.then(action);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  #now(): number | null {
    if (!this.#configured) return null;
    try {
      const now = this.#clock();
      // Backwards clocks cannot extend approvals or evade lease expiry.
      if (!Number.isSafeInteger(now) || now < this.#lastTime || now < 0
        || now > Number.MAX_SAFE_INTEGER - Math.max(this.#policy.sentTtlMs, this.#policy.reservationTtlMs)) return null;
      this.#lastTime = now;
      return now;
    } catch { return null; }
  }

  #ownedGrant(owner: UsageOwner, grantId: string): UsageGrant | undefined {
    const grant = this.#grants.get(grantId);
    return grant && sameOwner(owner, grant.owner) ? grant : undefined;
  }

  #find(command: AttemptIdentity | null): { ok: true; job: UsageJob; attempt: UsageAttempt } | UsageDenied {
    if (!command || !validOwner(command.owner) || !opaque(command.jobId) || !opaque(command.attemptId)) return deny('INVALID_INPUT');
    const job = this.#jobs.get(command.jobId);
    if (!job || !sameOwner(command.owner, job.owner)) return deny('NOT_FOUND');
    const attempt = job.attempts.find(candidate => candidate.attemptId === command.attemptId);
    return attempt ? { ok: true, job, attempt } : deny('NOT_FOUND');
  }

  #checkCapacity(grant: UsageGrant, now: number): UsageDenied | undefined {
    if (grant.expiresAt <= now) return deny('GRANT_EXPIRED');
    const userCount = this.#userAttempts.get(grant.owner.userId) ?? 0;
    const sessionCount = this.#sessionAttempts.get(sessionKey(grant.owner)) ?? 0;
    if (grant.consumedAttempts >= grant.maxAttempts || grant.consumedAttempts >= this.#policy.maxAttemptsPerGrant
      || userCount >= this.#policy.maxAttemptsPerUser || sessionCount >= this.#policy.maxAttemptsPerSession
      || this.#totalAttempts >= this.#policy.maxAttemptsTotal) return deny('LIMIT_REACHED');
    let total = 0, perUser = 0, perSession = 0;
    for (const job of this.#jobs.values()) for (const attempt of job.attempts) {
      if (!active(attempt)) continue;
      total++;
      if (job.owner.userId === grant.owner.userId) perUser++;
      if (sameOwner(job.owner, grant.owner)) perSession++;
    }
    return total >= this.#policy.maxConcurrentTotal || perUser >= this.#policy.maxConcurrentPerUser
      || perSession >= this.#policy.maxConcurrentPerSession ? deny('CONCURRENCY_LIMIT') : undefined;
  }

  #reserveAttempt(job: UsageJob, grant: UsageGrant, now: number): UsageAttempt {
    const attempt: UsageAttempt = {
      attemptId: this.#id('attempt'), ordinal: job.attempts.length + 1, state: 'RESERVED',
      reservedAt: now, leaseExpiresAt: Math.min(now + this.#policy.reservationTtlMs, grant.expiresAt),
    };
    job.attempts.push(attempt);
    this.#event(job, attempt, 'RESERVED', now);
    grant.consumedAttempts++;
    this.#totalAttempts++;
    this.#userAttempts.set(job.owner.userId, (this.#userAttempts.get(job.owner.userId) ?? 0) + 1);
    const key = sessionKey(job.owner);
    this.#sessionAttempts.set(key, (this.#sessionAttempts.get(key) ?? 0) + 1);
    return attempt;
  }

  #transition(job: UsageJob, attempt: UsageAttempt, state: UsageAttempt['state'], reason: UsageEvent['reason'], now: number, leaseExpiresAt = attempt.leaseExpiresAt): void {
    attempt.state = state;
    attempt.leaseExpiresAt = leaseExpiresAt;
    this.#event(job, attempt, reason, now);
  }

  #event(job: UsageJob, attempt: UsageAttempt, reason: UsageEvent['reason'], now: number): void {
    job.history.push({ eventId: this.#id('event'), occurredAt: now, jobId: job.jobId, attemptId: attempt.attemptId, state: attempt.state, reason });
  }

  #expire(now: number): void {
    for (const job of this.#jobs.values()) for (const attempt of job.attempts) {
      if (attempt.leaseExpiresAt > now) continue;
      if (attempt.state === 'RESERVED') this.#transition(job, attempt, 'FAILED', 'RESERVATION_EXPIRED', now);
      else if (attempt.state === 'SENT') this.#transition(job, attempt, 'UNKNOWN', 'SEND_TIMEOUT', now);
    }
  }
}

function deny(code: UsageDenialCode): UsageDenied { return { ok: false, code }; }
function id(prefix: string): string { return `${prefix}_${crypto.randomUUID()}`; }
function opaque(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}
function validOwner(owner: UsageOwner | undefined): owner is UsageOwner { return !!owner && opaque(owner.userId) && opaque(owner.sessionId); }
function sameOwner(left: UsageOwner, right: UsageOwner): boolean { return left.userId === right.userId && left.sessionId === right.sessionId; }
function sessionKey(owner: UsageOwner): string { return JSON.stringify([owner.userId, owner.sessionId]); }
function validOperation(operation: unknown): operation is 'MAIN' | 'FRINGE_A_TO_E' { return operation === 'MAIN' || operation === 'FRINGE_A_TO_E'; }
function validHash(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function active(attempt: UsageAttempt): boolean { return ['RESERVED', 'SENT', 'UNKNOWN'].includes(attempt.state); }
function latest(job: UsageJob): UsageAttempt { return job.attempts[job.attempts.length - 1]; }
function snapshot<T>(value: T): T | null { try { return structuredClone(value); } catch { return null; } }
function decision(job: UsageJob, attempt: UsageAttempt, deduplicated: boolean): UsageDecision {
  return { ok: true, job: structuredClone(job), attempt: structuredClone(attempt), deduplicated };
}
function validPolicy(policy: UsagePolicy): boolean {
  if (!policy || typeof policy !== 'object') return false;
  const positiveFields: (keyof UsagePolicy)[] = ['maxAttemptsTotal', 'maxAttemptsPerUser', 'maxAttemptsPerSession',
    'maxAttemptsPerGrant', 'maxConcurrentTotal', 'maxConcurrentPerUser', 'maxConcurrentPerSession',
    'maxGrantTtlMs', 'reservationTtlMs', 'sentTtlMs'];
  return positiveFields.every(key => positive(policy[key]))
    && Number.isSafeInteger(policy.maxRetriesPerJob) && policy.maxRetriesPerJob >= 0
    && policy.maxAttemptsTotal <= 1_000_000 && policy.maxAttemptsPerUser <= policy.maxAttemptsTotal
    && policy.maxAttemptsPerSession <= policy.maxAttemptsPerUser && policy.maxAttemptsPerGrant <= policy.maxAttemptsPerSession
    && policy.maxConcurrentTotal <= policy.maxAttemptsTotal && policy.maxConcurrentPerUser <= policy.maxConcurrentTotal
    && policy.maxConcurrentPerSession <= policy.maxConcurrentPerUser && policy.maxRetriesPerJob <= 100
    && policy.maxGrantTtlMs <= 86_400_000 && policy.reservationTtlMs <= policy.maxGrantTtlMs
    && policy.sentTtlMs <= 3_600_000;
}
