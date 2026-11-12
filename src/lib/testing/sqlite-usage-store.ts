import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {closeSync,lstatSync,openSync,readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {MemoryUsageStore} from './memory-usage-store.ts';
import type {AttemptIdentity,IssueUsageGrant,ReserveUsage,RetryUsage,ServerUsageStore,UsageDecision,UsageDenied,UsageGrantDecision,UsageJobDecision,UsageOwner,UsagePolicy} from '../server-usage.ts';

/** TEST ONLY. Local replay journal, not a production auth/ownership/spending adapter.
 * Directory must be an explicitly selected empty0700 temp directory or our marked
 * fixture directory. Do not point this at customer data or an application DB.
 * No credentials, images, tokens, request bodies or provider traffic are accepted.
 */
const MARKER='.dev01-test-usage-v1',FILE='usage-test.sqlite',MAGIC='DEV01_TEST_ONLY_USAGE_SQLITE_V1';
const mutexes=new Map<string,Promise<void>>();
type Method='issueGrant'|'reserve'|'markSent'|'settle'|'cancelBeforeSend'|'retry'|'readJob';
type Result=UsageDecision|UsageGrantDecision|UsageJobDecision;
type Command={method:Method;input:unknown;at:number};
type JournalRow={seq:number;command:string;digest:string};
const methods=new Set<Method>(['issueGrant','reserve','markSent','settle','cancelBeforeSend','retry','readJob']);
const denied=(code:UsageDenied['code']):UsageDenied=>({ok:false,code});
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const json=(v:unknown)=>JSON.stringify(v);
const policyFields:(keyof UsagePolicy)[]=['maxAttemptsTotal','maxAttemptsPerUser','maxAttemptsPerSession','maxAttemptsPerGrant','maxConcurrentTotal','maxConcurrentPerUser','maxConcurrentPerSession','maxRetriesPerJob','maxGrantTtlMs','reservationTtlMs','sentTtlMs'];

export class SqliteTestUsageStore implements ServerUsageStore{
 readonly mode='TEST_ONLY' as const;
 readonly #policy:UsagePolicy;
 readonly #clock:()=>number;
 readonly #fault:(()=>void)|undefined;
 #db:DatabaseSync|null=null;
 #key='';
 #closed=false;
 #configured=false;
 constructor(policy:UsagePolicy,options:{directory:string;testOnly:true;clock?:()=>number;beforeCommit?:()=>void}){
  this.#policy=Object.fromEntries(policyFields.map(k=>[k,policy?.[k]])) as unknown as UsagePolicy;
  this.#clock=options?.clock??Date.now;this.#fault=options?.beforeCommit;
  try{
   if(policyFields.some(k=>!Number.isSafeInteger(this.#policy[k])))return;
   if(options?.testOnly!==true||typeof options.directory!=='string')return;
   const info=lstatSync(options.directory);if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0)return;
   const directory=realpathSync(options.directory),allowed=new Set([MARKER,FILE,FILE+'-wal',FILE+'-shm']);
   const entries=readdirSync(directory);if(entries.some(name=>!allowed.has(name)))return;
   if(entries.some(name=>{const entry=lstatSync(join(directory,name));return !entry.isFile()||entry.isSymbolicLink()||entry.nlink!==1||(entry.mode&0o077)!==0;}))return;
   if(!entries.length)writeFileSync(join(directory,MARKER),MAGIC,{flag:'wx',mode:0o600});
   const marker=lstatSync(join(directory,MARKER));if(!marker.isFile()||marker.isSymbolicLink()||(marker.mode&0o077)!==0||readFileSync(join(directory,MARKER),'utf8')!==MAGIC)return;
   const path=join(directory,FILE);this.#key=path;
   if(!readdirSync(directory).includes(FILE)){const fd=openSync(path,'wx',0o600);closeSync(fd);}
   const file=lstatSync(path);if(!file.isFile()||file.isSymbolicLink()||file.nlink!==1||(file.mode&0o077)!==0)return;
   this.#db=new DatabaseSync(path);this.#db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
   // Reopening an initialized fixture must not take a synchronous writer lock:
   // an existing same-event-loop transaction can currently be awaiting replay.
   const initialized=this.#db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fixture_meta'").get();
   if(initialized){
    const meta=new Map((this.#db.prepare('SELECT key,value FROM fixture_meta').all() as {key:string;value:string}[]).map(row=>[row.key,row.value]));
    const journal=this.#db.prepare('PRAGMA journal_mode').get() as {journal_mode:string};
    if(meta.get('schema')!==MAGIC||meta.get('policy')!==json(this.#policy)||journal.journal_mode!=='wal')throw Error('Fixture configuration mismatch');
    this.#configured=true;return;
   }
   this.#db.exec('PRAGMA journal_mode=WAL;');
   this.#db.exec('BEGIN IMMEDIATE');
   try{
    this.#db.exec('CREATE TABLE IF NOT EXISTS fixture_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS fixture_journal (seq INTEGER PRIMARY KEY AUTOINCREMENT,command TEXT NOT NULL,digest TEXT NOT NULL);');
    const get=this.#db.prepare('SELECT value FROM fixture_meta WHERE key=?'),set=this.#db.prepare('INSERT INTO fixture_meta(key,value) VALUES (?,?)');
    const schema=get.get('schema') as {value:string}|undefined;
    if(!schema){set.run('schema',MAGIC);set.run('seed',randomUUID());set.run('policy',json(this.#policy));}
    else if(schema.value!==MAGIC||(get.get('policy') as {value:string}|undefined)?.value!==json(this.#policy))throw Error('Fixture configuration mismatch');
    this.#db.exec('COMMIT');this.#configured=true;
   }catch{this.#db.exec('ROLLBACK');throw Error('Fixture unavailable');}
  }catch{this.#configured=false;try{this.#db?.close();}catch{/* no error detail is exposed */}this.#db=null;}
 }
 issueGrant(input:IssueUsageGrant):Promise<UsageGrantDecision>{return this.#run('issueGrant',input) as Promise<UsageGrantDecision>;}
 reserve(input:ReserveUsage):Promise<UsageDecision>{return this.#run('reserve',input) as Promise<UsageDecision>;}
 markSent(input:AttemptIdentity):Promise<UsageDecision>{return this.#run('markSent',input) as Promise<UsageDecision>;}
 settle(input:AttemptIdentity&{outcome:'UNKNOWN'|'FAILED'|'SUCCEEDED'}):Promise<UsageDecision>{return this.#run('settle',input) as Promise<UsageDecision>;}
 cancelBeforeSend(input:AttemptIdentity):Promise<UsageDecision>{return this.#run('cancelBeforeSend',input) as Promise<UsageDecision>;}
 retry(input:RetryUsage):Promise<UsageDecision>{return this.#run('retry',input) as Promise<UsageDecision>;}
 readJob(input:{owner:UsageOwner;jobId:string}):Promise<UsageJobDecision>{return this.#run('readJob',input) as Promise<UsageJobDecision>;}
 async close():Promise<void>{await this.#serial(()=>{this.#closed=true;this.#db?.close();this.#db=null;});}

 #run(method:Method,input:unknown):Promise<Result>{
  let command:unknown;
  try{command=allowlisted(method,structuredClone(input));}catch{return Promise.resolve(denied('INVALID_INPUT'));}
  return this.#serial(async()=>{
   if(!this.#configured||!this.#db||this.#closed)return denied('STORE_UNAVAILABLE');
   const db=this.#db;let transaction=false;
   try{
    db.exec('BEGIN IMMEDIATE');transaction=true;
    const rows=db.prepare('SELECT seq,command,digest FROM fixture_journal ORDER BY seq').all() as JournalRow[];
    if(rows.length>=10_000)throw Error('Fixture journal limit');
    const meta=new Map((db.prepare('SELECT key,value FROM fixture_meta').all() as {key:string;value:string}[]).map(row=>[row.key,row.value]));
    if(meta.get('schema')!==MAGIC||meta.get('policy')!==json(this.#policy))throw Error('Fixture configuration mismatch');
    const seed=meta.get('seed');
    if(!seed||!/^[0-9a-f-]{36}$/.test(seed))throw Error('Invalid fixture');
    let at=0,sequence=0;
    const machine=new MemoryUsageStore(this.#policy,{clock:()=>at,testIdFactory:prefix=>{
     const raw=sha(seed+':'+sequence++).slice(0,32);return prefix+'_'+raw.slice(0,8)+'-'+raw.slice(8,12)+'-'+raw.slice(12,16)+'-'+raw.slice(16,20)+'-'+raw.slice(20);
    }});
    for(let i=0;i<rows.length;i++){
     const row=rows[i],stored=JSON.parse(row.command) as Command;
     if(row.seq!==i+1||!methods.has(stored.method)||!Number.isSafeInteger(stored.at)||stored.at<at||json(allowlisted(stored.method,stored.input))!==json(stored.input))throw Error('Invalid journal');
     at=stored.at;const result=await invoke(machine,stored.method,stored.input);
     if(sha(json(result))!==row.digest)throw Error('Journal replay mismatch');
    }
    const now=this.#clock();
    if(!Number.isSafeInteger(now)||now<at||now<0){db.exec('ROLLBACK');transaction=false;return denied('CONFIGURATION_UNAVAILABLE');}
    at=now;const result=await invoke(machine,method,command);
    if(!result.ok&&result.code==='CONFIGURATION_UNAVAILABLE'){db.exec('ROLLBACK');transaction=false;return result;}
    db.prepare('INSERT INTO fixture_journal(command,digest) VALUES (?,?)').run(json({method,input:command,at}),sha(json(result)));
    this.#fault?.();db.exec('COMMIT');transaction=false;return result;
   }catch{if(transaction)try{db.exec('ROLLBACK');}catch{/* closed/corrupt store remains denied */}return denied('STORE_UNAVAILABLE');}
  });
 }
 async #serial<T>(action:()=>T|Promise<T>):Promise<T>{
  const key=this.#key||'unconfigured-fixture';const previous=mutexes.get(key)??Promise.resolve();
  const result=previous.then(action);const tail=result.then(()=>undefined,()=>undefined);mutexes.set(key,tail);
  try{return await result;}finally{if(mutexes.get(key)===tail)mutexes.delete(key);}
 }
}

function allowlisted(method:Method,value:unknown):unknown{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>,o=v.owner as Record<string,unknown>|null|undefined;
 const owner=o&&typeof o==='object'?{userId:o.userId,sessionId:o.sessionId}:null;
 if(!owner||typeof owner.userId!=='string'||typeof owner.sessionId!=='string'||owner.userId.length>256||owner.sessionId.length>256)return null;
 const keys=method==='issueGrant'?['approvalId','expiresAt','maxAttempts','operations']:method==='reserve'?['grantId','operation','requestKey','inputSha256']:method==='readJob'?['jobId']:method==='retry'?['jobId','attemptId','retryKey']:method==='settle'?['jobId','attemptId','outcome']:['jobId','attemptId'];
 for(const k of keys){if(k==='expiresAt'||k==='maxAttempts'){if(typeof v[k]!=='number'||!Number.isFinite(v[k]))return null;}else if(k==='operations'){if(!Array.isArray(v[k])||v[k].length>2||v[k].some(x=>typeof x!=='string'||x.length>32))return null;}else if(typeof v[k]!=='string'||v[k].length>256)return null;}
 return JSON.parse(json({owner,...Object.fromEntries(keys.map(k=>[k,v[k]]))}));
}
async function invoke(store:MemoryUsageStore,method:Method,input:unknown):Promise<Result>{
 // The method allowlist is closed; no arbitrary object method or provider is callable.
 switch(method){
  case 'issueGrant':return store.issueGrant(input as IssueUsageGrant);
  case 'reserve':return store.reserve(input as ReserveUsage);
  case 'markSent':return store.markSent(input as AttemptIdentity);
  case 'settle':return store.settle(input as AttemptIdentity&{outcome:'UNKNOWN'|'FAILED'|'SUCCEEDED'});
  case 'cancelBeforeSend':return store.cancelBeforeSend(input as AttemptIdentity);
  case 'retry':return store.retry(input as RetryUsage);
  case 'readJob':return store.readJob(input as {owner:UsageOwner;jobId:string});
 }
}
