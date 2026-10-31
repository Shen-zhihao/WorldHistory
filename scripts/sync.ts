import { writeSnapshot } from '../src/lib/server/snapshot';
import { startSync } from '../src/lib/server/sync';
import { getStatus } from '../src/lib/server/db';
async function main(){
process.env.HISTORY_SYNC_LOG='1';
await startSync({force:process.argv.includes('--force'),concurrency:4,currentArchiveBackfill:process.argv.includes('--all-current'),years:process.argv.some(a=>a.startsWith('--year='))?[Number(process.argv.find(a=>a.startsWith('--year='))!.split('=')[1])]:process.argv.includes('--rerank')?Array.from({length:new Date().getUTCFullYear()-1799},(_,i)=>1800+i):undefined});
if(getStatus().sync.running)throw new Error('Another history sync owns the lease; retry after it completes.');
await writeSnapshot();
const s=getStatus();console.log(JSON.stringify({events:s.eventCount,months:s.monthCount,complete:s.completedMonths,gaps:s.pendingMonths,sync:s.sync},null,2));if(s.sync.error)process.exitCode=1;

}
main().catch(error=>{console.error(error);process.exitCode=1;});
