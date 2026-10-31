import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { HistoryEvent } from "../src/lib/types";
import { canonicalEventId, splitTranslationText, localizeEvents, drainTranslations } from "../src/lib/server/translations";
import { getDb, queryEvents, saveYear, todayShanghai } from "../src/lib/server/db";

const directory=mkdtempSync(join(tmpdir(),"epoch-translation-test-"));
process.env.HISTORY_DB_PATH=join(directory,"test.sqlite");
const event:HistoryEvent={id:"aabbccddeeff001122334455",title:"Apollo 11 landed on the Moon.",summary:"Apollo 11 landed on the Moon.",date:"1969-07-20",month:"1969-07",countryCodes:["US"],lat:38,lng:-97,category:"science",score:99,sourceUrl:"https://en.wikipedia.org/wiki/1969",sourceTitle:"1969",imageUrl:null,imageCredit:null};

test("translation chunks respect provider UTF-8 byte limits without corrupting Unicode",()=>{
  const text="这是历史🌍。".repeat(100);const chunks=splitTranslationText(text);
  assert.equal(chunks.join(""),text);assert.ok(chunks.every(part=>Buffer.byteLength(part)<=480));
  assert.equal(canonicalEventId(event.id+"-map-US"),event.id);
});

test("translations preserve original source, deduplicate map clones, invalidate changed text and expose failure",async()=>{
  let calls=0;
  const translator=async()=>{calls++;return {text:"阿波罗11号登陆月球。",provider:"test-provider"};};
  const pending=await localizeEvents([event,{...event,id:event.id+"-map-US"}],"zh-CN",{waitMs:0,translator});
  assert.ok(pending.translation.pending>0);
  await drainTranslations();
  const result=await localizeEvents([event],"zh-CN",{translator});
  assert.equal(calls,1);assert.equal(result.events[0].title,"阿波罗11号登陆月球");assert.equal(result.events[0].originalSummary,event.summary);assert.equal(result.events[0].translationStatus,"translated");
  assert.equal(event.summary,"Apollo 11 landed on the Moon.");
  saveYear(1969,[event],{},todayShanghai(),null,[event]);
  assert.equal(queryEvents({month:"1969-07",q:"阿波罗11号",locale:"zh-CN"}).events[0].id,event.id);
  getDb().prepare('UPDATE candidates SET title=?,summary=? WHERE id=?').run('Updated source','A completely updated account.',event.id);
  assert.equal(queryEvents({month:"1969-07",q:"阿波罗11号",locale:"zh-CN"}).total,0,"stale translated keywords must not match changed source text");
  const changed={...event,summary:"A different source account of Apollo 11."};
  await localizeEvents([changed],"zh-CN",{translator});await drainTranslations();assert.equal(calls,2);
  const failure={...event,id:"11223344556677889900aabb"};
  await localizeEvents([failure],"zh-CN",{translator:async()=>{throw new Error("quota unavailable");}});await drainTranslations();
  const failed=await localizeEvents([failure],"zh-CN",{enqueue:false});assert.equal(failed.translation.pending,0);assert.equal(failed.events[0].translationStatus,"unavailable");assert.equal(failed.events[0].summary,event.summary);
  const native=await localizeEvents([{...event,sourceUrl:"https://zh.wikipedia.org/wiki/1969年",title:"臺灣歷史",summary:"臺灣的歷史與發展。"}],"zh-CN",{translator});assert.equal(native.events[0].summary,"台湾的历史与发展。");assert.equal(native.events[0].translationStatus,"original");
  getDb().close();rmSync(directory,{recursive:true,force:true});
});
