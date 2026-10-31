import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { allTranslations, eventById, getDb } from "../src/lib/server/db";
import { localizeEvents, sourceHash, type StoredTranslation } from "../src/lib/server/translations";

test("a clean checkout restores bundled translations without any external requests",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"epoch-locale-restore-"));
  process.env.HISTORY_DB_PATH=join(directory,"fresh.sqlite");
  const bundled=JSON.parse(gunzipSync(readFileSync("data/translations.json.gz")).toString()) as StoredTranslation[];
  assert.ok(bundled.some(row=>row.locale==="zh-CN"));assert.ok(bundled.some(row=>row.locale==="en"));
  assert.equal(allTranslations().length,bundled.length);
  const row=bundled.find(item=>{const event=eventById(item.eventId);return event&&sourceHash(event)===item.sourceHash;});
  assert.ok(row);const event=eventById(row.eventId);assert.ok(event);
  const result=await localizeEvents([event],row.locale,{enqueue:false,waitMs:0});
  assert.equal(result.events[0].title,row.title);assert.equal(result.events[0].translationStatus,"translated");assert.equal(result.translation.pending,0);
  getDb().close();rmSync(directory,{recursive:true,force:true});
});
