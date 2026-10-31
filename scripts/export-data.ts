import { writeSnapshot } from "../src/lib/server/snapshot";

writeSnapshot().then(manifest=>{
  console.log(`已导出 ${manifest.archiveRecords} 条来源记录、${manifest.translations ?? 0} 条译文及资源校验清单。`);
}).catch(error=>{console.error(error.message);process.exitCode=1;});
