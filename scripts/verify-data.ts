import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import type { DataManifest } from "../src/lib/server/snapshot";

async function main() {
  const manifest: DataManifest = JSON.parse(await readFile("data/manifest.json", "utf8"));
  for (const file of manifest.files) {
    const bytes = await readFile(file.path);
    if (bytes.byteLength !== file.bytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
      throw new Error(`数据校验失败：${file.path}。更新快照后请使用 npm run sync 或 npm run media 重新生成清单。`);
    }
  }
  const snapshot = JSON.parse(gunzipSync(await readFile("data/events.json.gz")).toString());
  if (snapshot.events.length !== manifest.selectedEvents || snapshot.candidates.length !== manifest.archiveRecords || snapshot.months.length !== manifest.months) {
    throw new Error("数据快照记录数与清单不一致");
  }
  if (manifest.translations !== undefined) {
    const translations = JSON.parse(gunzipSync(await readFile("data/translations.json.gz")).toString());
    if (translations.length !== manifest.translations) throw new Error("翻译快照记录数与清单不一致");
  }
  console.log(`数据完整：${manifest.files.length} 个分发文件，${manifest.archiveRecords} 条来源记录，${manifest.selectedEvents} 条精选，${manifest.months} 个月份。`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
