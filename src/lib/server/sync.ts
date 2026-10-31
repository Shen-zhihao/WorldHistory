import { randomUUID } from 'node:crypto';
import { planSyncYears } from './sync-plan';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { getDb, getMeta, setMeta, todayShanghai, saveYear, monthRange } from './db';
import { fetchYear, parseYear, fetchCurrentMonth, parseCurrentMonth, selectMonthly, candidateEvents, type RawEvent } from './source';
let inFlight:Promise<void>|undefined;
let lockRetry:ReturnType<typeof setTimeout>|undefined;
function supplements():RawEvent[]{const compressed=join(process.cwd(),'data','supplemental-events.json.gz');const plain=join(process.cwd(),'data','supplemental-events.json');try{return JSON.parse(existsSync(compressed)?gunzipSync(readFileSync(compressed)).toString():readFileSync(plain,'utf8'));}catch{return [];}}
export function startSync(options:{force?:boolean;years?:number[];concurrency?:number;currentArchiveBackfill?:boolean}={}):Promise<void>{
 if(inFlight)return inFlight;inFlight=runSync(options).finally(()=>{inFlight=undefined;});return inFlight;
}
async function runSync(options:{force?:boolean;years?:number[];concurrency?:number;currentArchiveBackfill?:boolean}){
 const db=getDb();const owner=randomUUID();const lease=Date.now()+90000;
 const acquired=db.prepare('INSERT INTO sync_lock(id,owner,expires) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE sync_lock.expires < ?').run(owner,lease,Date.now()).changes;if(!acquired){const existing=db.prepare('SELECT expires FROM sync_lock WHERE id=1').get() as {expires:number}|undefined;if(!lockRetry){lockRetry=setTimeout(()=>{lockRetry=undefined;void startSync(options).catch(error=>console.error('[history] lease retry failed',error instanceof Error?error.message:'unknown error'));},Math.max(1000,(existing?.expires||Date.now()+1000)-Date.now()+100));lockRetry.unref();}return;}
 const cutoff=todayShanghai();const year=+cutoff.slice(0,4);const checked=new Map((db.prepare('SELECT month,checked_at,error FROM months').all() as {month:string;checked_at:string|null;error:string|null}[]).map(r=>[r.month,r]));
 const last=getMeta('lastSyncAt');
 const years=options.years||planSyncYears(cutoff,last,checked,Boolean(options.force));
 const rawSupplement=supplements();let processed=0;const errors:string[]=[];
 const update=()=>{setMeta('sync',JSON.stringify({running:true,processed,total:years.length,error:errors.length?errors.slice(-2).join('; '):null}));db.prepare('UPDATE sync_lock SET expires=? WHERE owner=?').run(Date.now()+90000,owner);};update();
 const heartbeat=setInterval(update,20000);heartbeat.unref();
 try{
  let index=0;await Promise.all(Array.from({length:Math.min(options.concurrency||3,years.length)},async()=>{while(index<years.length){const y=years[index++];let raw=rawSupplement.filter(r=>r.year===y);const failed:string[]=[];let success=0;
   for(const language of ['zh','en'] as const)try{const html=await fetchYear(y,language,Boolean(options.force)||y===year||Boolean(last&&y>=+last.slice(0,4)));raw.push(...parseYear(html,y,language));success++;}catch(error){failed.push(error instanceof Error?error.message:String(error));}
   // Annual archives cover history; daily current-event archives bridge every new month since the previous successful sync.
   if(y===year||(last&&y>=+last.slice(0,4))||existsSync(join(process.cwd(),'data','source-cache',`current-${y}-1.html.gz`)))for(let m=1;m<=12;m++){const key=`${y}-${String(m).padStart(2,'0')}`;if(key>cutoff.slice(0,7))continue;try {raw.push(...parseCurrentMonth(await fetchCurrentMonth(y,m,key===cutoff.slice(0,7)||Boolean(last&&key>=last.slice(0,7))),y,m));}catch(error){failed.push(error instanceof Error?error.message:String(error));}}
   const counts:Record<string,number>={};for(const r of raw){const m=`${r.year}-${String(r.month).padStart(2,'0')}`;if(m<=cutoff.slice(0,7))counts[m]=(counts[m]||0)+1;}
   if(success||raw.length){saveYear(y,selectMonthly(raw,cutoff),counts,cutoff,failed.length?failed.join('; '):null,candidateEvents(raw,cutoff));}else saveYear(y,[],{},cutoff,failed.join('; '));
   if(failed.length)errors.push(...failed);processed++;update();if(process.env.HISTORY_SYNC_LOG==='1')console.log(`[history] ${y}: ${raw.length} candidates (${processed}/${years.length})`);
  }}));
  if(!errors.length)setMeta('lastSyncAt',new Date().toISOString());
 }catch(error){errors.push(error instanceof Error?error.message:String(error));throw error;}finally{clearInterval(heartbeat);db.prepare('DELETE FROM sync_lock WHERE owner=?').run(owner);setMeta('sync',JSON.stringify({running:false,processed,total:years.length,error:errors.length?errors.slice(-3).join('; '):null}));}
}
