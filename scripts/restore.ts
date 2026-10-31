import { existsSync } from "node:fs";
import { getDb, getStatus } from "../src/lib/server/db";

if (!existsSync("data/events.json.gz")) throw new Error("缺少随 Git 分发的数据快照 data/events.json.gz");
const status = getStatus();
console.log(`本地 SQLite 已就绪：${status.candidateCount} 条来源记录，${status.eventCount} 条精选。已有数据库会原样保留。`);
getDb().close();
