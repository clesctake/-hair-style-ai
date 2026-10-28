# DEV-01 / Codex migration — 5-step audit, 2026-10-28

**State: PARTIAL. This branch does not yet contain the recovered application source.**

## Step 1 — recovered archive integrity (REAL)
- Recovered archive: `DEV01_FINAL_SOURCE_FOR_CODEX.zip`.
- SHA-256: `c6079ec3846c838686038c8f8a9eb15838fe5721fada315cd6a027cb2dcd9cb6`.
- Non-directory entries: **2,525**.
- ZIP CRC validation: **PASS** (no failing member).
- Candidate source snapshot: `sources/SITES_LATEST_9fa7694/`, **757 files**.

## Step 2 — approved design assets (REAL for byte integrity; UNVERIFIED for runtime UI)
- **12/12** approved asset manifest entries matched byte size and SHA-256 against archive contents.
- Page 3 master: `docs/visual-master/page3/AFTER_SUPPORT_VISUAL_MASTER.jpeg`, SHA-256 `7e08f5b3d4e5fea609e299818ba767e07cd3421a56d207ef9ee177907260e2b1`.
- Master resolution 1024×1536 and expected PNG export 2048×3072 are documented; actual rendering/export not re-tested.

## Step 3 — public security scan (PARTIAL)
- Examined 757 candidate source files with basic token/email/phone detectors.
- One OpenAI-key-pattern match: `tests/auth-recovery-v22.test.mjs` (previously reported as a test placeholder; not independently proven harmless here).
- One email-pattern match: `tests/after-support.test.mjs`.
- One phone-pattern match: `docs/page3-audit/baseline-hashes.json` (could be a numerical hash fragment).
- No sensitive file paths matching .env, .pem, .key, .sqlite, .db in the candidate snapshot.
- **Automated scanning is not proof of absence of secrets, customer data, or image-use restrictions. Do not publicly upload unchecked images.**

## Step 4 — build/test environment (BLOCKED)
- `package.json` requires Node >=24; local runtime Node v22.16.0.
- Previous test failure: `ERR_MODULE_NOT_FOUND` for `esbuild` in `tests/after-review.test.mjs`.
- The recovered bundle's dependency-restore log reports `ENOTCACHED` for npm package `yocto-queue`.
- Full clean install, typecheck, build, tests and actual image generation remain UNVERIFIED.

## Step 5 — GitHub staging and handoff (PARTIAL)
- Branch: `dev01/codex-migration-staging-20261028`.
- Prior audit doc committed as `dfd12bae5825569b7d03948ef5779c593bb8f977`.
- This document records additional verified evidence only. **Application source is NOT yet uploaded.**
- Keep `main`, existing branches, Vercel production, DEV-02 and DEV-03 unchanged.
- Next blocker: secure bulk transfer from the recovered archive into GitHub plus public-asset rights review. Do not claim migration complete.

## Handoff verdict
**PARTIAL / not yet safe to hand over as a complete runnable Codex source.**