import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { contentHash } from './content-hash';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { AtlasStatus, HistoryEvent } from '../types';
import { countryByCode } from '../countries';

let database:DatabaseSync|undefined;
export function todayShanghai():string{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function monthRange(end=todayShanghai().slice(0,7)):string[]{const result:string[]=[];for(let y=1800;y<=+end.slice(0,4);y++)for(let m=1;m<=12;m++){const month=`${y}-${String(m).padStart(2,'0')}`;if(month<=end)result.push(month);}return result;}
export function getDb():DatabaseSync {
 if(database)return database;
 const path=process.env.HISTORY_DB_PATH||join(process.cwd(),'data','history.sqlite');mkdirSync(dirname(path),{recursive:true});database=new DatabaseSync(path);
 database.function('event_source_hash',{deterministic:true},(title,summary)=>contentHash(String(title),String(summary)));
 database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,title TEXT NOT NULL,summary TEXT NOT NULL,date TEXT NOT NULL,month TEXT NOT NULL,country_codes TEXT NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,category TEXT NOT NULL,score REAL NOT NULL,source_url TEXT NOT NULL,source_title TEXT NOT NULL,image_url TEXT,image_credit TEXT);
 CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY,title TEXT NOT NULL,summary TEXT NOT NULL,date TEXT NOT NULL,month TEXT NOT NULL,country_codes TEXT NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,category TEXT NOT NULL,score REAL NOT NULL,source_url TEXT NOT NULL,source_title TEXT NOT NULL,image_url TEXT,image_credit TEXT);
 CREATE INDEX IF NOT EXISTS candidates_month ON candidates(month,score DESC); CREATE INDEX IF NOT EXISTS candidates_date ON candidates(date);
 CREATE INDEX IF NOT EXISTS events_month ON events(month,score DESC); CREATE INDEX IF NOT EXISTS events_date ON events(date);
 CREATE TABLE IF NOT EXISTS months(month TEXT PRIMARY KEY,candidate_count INTEGER NOT NULL DEFAULT 0,event_count INTEGER NOT NULL DEFAULT 0,checked_at TEXT,error TEXT);
 CREATE TABLE IF NOT EXISTS event_translations(event_id TEXT NOT NULL,target_locale TEXT NOT NULL,source_hash TEXT NOT NULL,title TEXT NOT NULL,summary TEXT NOT NULL,provider TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(event_id,target_locale,source_hash));
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sync_lock(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires INTEGER NOT NULL);`);
 if((database.prepare('SELECT COUNT(*) AS n FROM events').get() as {n:number}).n===0){
  const seed=join(process.cwd(),'data','events.json.gz');if(existsSync(seed)){
   const snapshot=JSON.parse(gunzipSync(readFileSync(seed)).toString()) as {events:HistoryEvent[];candidates?:HistoryEvent[];months:{month:string;candidateCount:number;checkedAt:string|null}[];lastSyncAt?:string};
   database.exec('BEGIN');try {for(const e of snapshot.events)insertEvent(database,e);for(const e of snapshot.candidates||snapshot.events)insertEvent(database,e,'candidates');for(const m of snapshot.months)database.prepare('INSERT OR REPLACE INTO months(month,candidate_count,event_count,checked_at) VALUES(?,?,?,?)').run(m.month,m.candidateCount,snapshot.events.filter(e=>e.month===m.month).length,m.checkedAt);if(snapshot.lastSyncAt)setMeta('lastSyncAt',snapshot.lastSyncAt);database.exec('COMMIT');}catch(error){database.exec('ROLLBACK');throw error;}
  }
 }
 const translationSeed=join(process.cwd(),'data','translations.json.gz');
 if(existsSync(translationSeed)){
  const bytes=readFileSync(translationSeed);const hash=createHash('sha256').update(bytes).digest('hex');
  const previous=database.prepare('SELECT value FROM metadata WHERE key=?').get('translationSeedHash') as {value:string}|undefined;
  if(previous?.value!==hash){
   const translations=JSON.parse(gunzipSync(bytes).toString()) as {eventId:string;locale:string;sourceHash:string;title:string;summary:string;provider:string;createdAt:string}[];
   database.exec('BEGIN');try{const insert=database.prepare('INSERT OR IGNORE INTO event_translations VALUES(?,?,?,?,?,?,?)');for(const row of translations)insert.run(row.eventId,row.locale,row.sourceHash,row.title,row.summary,row.provider,row.createdAt);database.prepare('INSERT OR REPLACE INTO metadata VALUES(?,?)').run('translationSeedHash',hash);database.exec('COMMIT');}catch(error){database.exec('ROLLBACK');throw error;}
  }
 }
 return database;
}
function insertEvent(db:DatabaseSync,e:HistoryEvent,table:'events'|'candidates'='events'){db.prepare(`INSERT OR REPLACE INTO ${table} VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(e.id,e.title,e.summary,e.date,e.month,JSON.stringify(e.countryCodes),e.lat,e.lng,e.category,e.score,e.sourceUrl,e.sourceTitle,e.imageUrl,e.imageCredit);}
export function setMeta(key:string,value:string){getDb().prepare('INSERT OR REPLACE INTO metadata VALUES(?,?)').run(key,value);}
export function getMeta(key:string):string|null{return (getDb().prepare('SELECT value FROM metadata WHERE key=?').get(key) as {value:string}|undefined)?.value||null;}
export function saveYear(year:number,events:HistoryEvent[],candidateCounts:Record<string,number>,cutoff:string,error:string|null=null,candidates:HistoryEvent[]=events){
 const db=getDb();const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try {
  for(const month of monthRange(cutoff.slice(0,7)).filter(m=>m.startsWith(String(year)))){
   // Keep usable verified history during outages; preserve cached media on unchanged events.
   const previous=(db.prepare('SELECT * FROM events WHERE month=?').all(month) as Record<string,unknown>[]).map(fromRow);
   const previousMedia=new Map([...(db.prepare('SELECT * FROM candidates WHERE month=?').all(month) as Record<string,unknown>[]).map(fromRow),...previous].map(e=>[e.id,e]));
   const incoming=events.filter(e=>e.month===month).map(e=>{const old=previousMedia.get(e.id);return old?{...e,imageUrl:old.imageUrl,imageCredit:old.imageCredit}:e;});
   const selected=error?[...new Map([...previous,...incoming].map(e=>[e.id,e])).values()].sort((a,b)=>b.score-a.score).slice(0,8):incoming;
   if(!error||incoming.length){db.prepare('DELETE FROM events WHERE month=?').run(month);for(const e of selected)insertEvent(db,e);}
   if(!error)db.prepare('DELETE FROM candidates WHERE month=?').run(month);
   for(const e of candidates.filter(e=>e.month===month)){const old=previousMedia.get(e.id);insertEvent(db,old?{...e,imageUrl:old.imageUrl,imageCredit:old.imageCredit}:e,'candidates');}
   const count=(db.prepare('SELECT COUNT(*) AS n FROM events WHERE month=?').get(month) as {n:number}).n;
   db.prepare('INSERT OR REPLACE INTO months(month,candidate_count,event_count,checked_at,error) VALUES(?,?,?,?,?)').run(month,candidateCounts[month]||0,count,now,error);
  }db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
function fromRow(row:Record<string,unknown>):HistoryEvent{return {id:String(row.id),title:String(row.title),summary:String(row.summary),date:String(row.date),month:String(row.month),countryCodes:JSON.parse(String(row.country_codes)),lat:Number(row.lat),lng:Number(row.lng),category:row.category as HistoryEvent['category'],score:Number(row.score),sourceUrl:String(row.source_url),sourceTitle:String(row.source_title),imageUrl:row.image_url as string|null,imageCredit:row.image_credit as string|null};}
export function queryEvents(input:{month?:string;country?:string;q?:string;category?:string;page?:number;limit?:number;scope?:string;from?:string;to?:string;locale?:string}={}){
 if(input.scope==='countries'&&input.month&&!input.country&&!input.q){
  const unique=new Map<string,HistoryEvent>();for(const e of queryMapEvents(input.month).events){const key=e.date+'|'+e.title;if(!unique.has(key)&&(!input.category||e.category===input.category))unique.set(key,e);}
  const events=[...unique.values()].filter(e=>(!input.from||e.month>=input.from)&&(!input.to||e.month<=input.to)).sort((a,b)=>b.score-a.score||a.date.localeCompare(b.date));const total=events.length;const limit=Math.min(100,Math.max(1,Math.floor(Number.isFinite(input.limit)?input.limit!:15)));const pages=Math.max(1,Math.ceil(total/limit));const page=Math.min(pages,Math.max(1,Math.floor(Number.isFinite(input.page)?input.page!:1)));return {events:events.slice((page-1)*limit,page*limit),total,page,pages};
 }
 const table=input.country||input.q||input.scope==='countries'?'candidates':'events';
 const clauses=['date <= ?'];const values:(string|number)[]=[todayShanghai()];
 if(input.month){clauses.push('month=?');values.push(input.month);}if(input.from){clauses.push('month>=?');values.push(input.from);}if(input.to){clauses.push('month<=?');values.push(input.to);}if(input.country){clauses.push('country_codes LIKE ?');values.push(`%"${input.country}"%`);}
 if(input.q){clauses.push(`(title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM event_translations tr WHERE tr.event_id=${table}.id AND tr.source_hash=event_source_hash(${table}.title,${table}.summary) AND tr.target_locale=? AND (tr.title LIKE ? ESCAPE '\\' OR tr.summary LIKE ? ESCAPE '\\')))`);const q='%'+input.q.replace(/[\\%_]/g,'\\$&')+'%';values.push(q,q,input.locale||'zh-CN',q,q);}
 if(input.category){clauses.push('category=?');values.push(input.category);}const where=clauses.join(' AND ');const db=getDb();const total=(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...values) as {n:number}).n;
 const limit=Math.min(100,Math.max(1,Math.floor(Number.isFinite(input.limit)?input.limit!:20)));const pages=Math.max(1,Math.ceil(total/limit));const page=Math.min(pages,Math.max(1,Math.floor(Number.isFinite(input.page)?input.page!:1)));
 const events=(db.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY ${input.month?'score DESC, date ASC':input.q?'score DESC, date DESC':'date DESC, score DESC'} LIMIT ? OFFSET ?`).all(...values,limit,(page-1)*limit) as Record<string,unknown>[]).map(fromRow);return {events,total,page,pages};
}
export function allEvents():HistoryEvent[]{return (getDb().prepare('SELECT * FROM events ORDER BY date').all() as Record<string,unknown>[]).map(fromRow);}
export function getStatus():AtlasStatus {
 const db=getDb();const months=monthRange();const counts=new Map((db.prepare('SELECT month,COUNT(*) AS n FROM events WHERE date<=? GROUP BY month').all(todayShanghai()) as {month:string;n:number}[]).map(r=>[r.month,r.n]));const coverage=months.map(month=>({month,count:counts.get(month)||0}));
 const sync=JSON.parse(getMeta('sync')||'{"running":false,"processed":0,"total":0,"error":null}');const lock=db.prepare('SELECT expires FROM sync_lock WHERE id=1').get() as {expires:number}|undefined;if(!lock||lock.expires<Date.now())sync.running=false;
 return {candidateCount:(db.prepare('SELECT COUNT(*) AS n FROM candidates WHERE date<=?').get(todayShanghai()) as {n:number}).n,startMonth:'1800-01',latestMonth:todayShanghai().slice(0,7),eventCount:coverage.reduce((a,b)=>a+b.count,0),monthCount:months.length,completedMonths:coverage.filter(c=>c.count>=5).length,pendingMonths:coverage.filter(c=>c.count<5).length,lastSyncAt:getMeta('lastSyncAt'),sync,coverage,sourceNote:'来源：维基百科年度大事记、每日时事与历史纪念日（CC BY-SA）。检索与国家视图使用完整候选档案，各国要闻按国家选取当月代表事件；全球精选按影响关键词、跨国关联、条目链接数和主题多样性排序，通常每月最多 5 项，重大事件密集月份最多 8 项，不代表权威排名。中文优先，缺少中文时保留英文原文；早期资料可能不足。事件国家为启发式的现代地理关联，不能作为当时国界或精确发生地点。'};
}
export function allCandidates():HistoryEvent[]{return (getDb().prepare('SELECT * FROM candidates ORDER BY date').all() as Record<string,unknown>[]).map(fromRow);}
export function queryMapEvents(month:string):{events:HistoryEvent[];total:number}{
 const rows=(getDb().prepare('SELECT * FROM candidates WHERE month=? AND date<=? ORDER BY score DESC,date ASC').all(month,todayShanghai()) as Record<string,unknown>[]).map(fromRow);const represented=new Set<string>();const events:HistoryEvent[]=[];for(const e of rows)for(const code of e.countryCodes){if(represented.has(code))continue;const country=countryByCode[code];if(!country)continue;represented.add(code);events.push({...e,id:e.id+'-map-'+code,countryCodes:[code,...e.countryCodes.filter(c=>c!==code)],lat:country.lat,lng:country.lng});}
 const global=queryEvents({month,limit:8}).events.filter(e=>!e.countryCodes.length);return {events:[...events,...global],total:represented.size};
}
export function seedSnapshot(){const db=getDb();return {events:allEvents(),candidates:allCandidates(),months:(db.prepare('SELECT month,candidate_count AS candidateCount,checked_at AS checkedAt FROM months').all()),lastSyncAt:getMeta('lastSyncAt')};}

export function eventById(id:string):HistoryEvent|null{const canonical=id.replace(/-map-[A-Z]{2}$/,'');const row=getDb().prepare('SELECT * FROM candidates WHERE id=?').get(canonical)||getDb().prepare('SELECT * FROM events WHERE id=?').get(canonical);return row?fromRow(row as Record<string,unknown>):null;}
export function allTranslations(){return getDb().prepare('SELECT event_id AS eventId,target_locale AS locale,source_hash AS sourceHash,title,summary,provider,created_at AS createdAt FROM event_translations ORDER BY event_id,target_locale').all();}
