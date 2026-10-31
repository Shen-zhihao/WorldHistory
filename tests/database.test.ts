import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HistoryEvent } from '../src/lib/types';
const directory=mkdtempSync(join(tmpdir(),'history-db-test-'));process.env.HISTORY_DB_PATH=join(directory,'test.sqlite');
import { getDb, saveYear, queryEvents, todayShanghai } from '../src/lib/server/db';
const sample=(id:string,summary:string):HistoryEvent=>({id,title:summary,summary,date:'1800-01-02',month:'1800-01',countryCodes:['FR'],lat:46,lng:2,category:'politics',score:42,sourceUrl:'https://en.wikipedia.org/wiki/1800',sourceTitle:'1800',imageUrl:null,imageCredit:null});

test('SQLite filters are parameterized, wildcard search literal, pagination integral, outages preserve rows',()=>{
 const db=getDb();const e=sample('test-a','Historical search 100% literal_ [A]');saveYear(1800,[e],{'1800-01':1},todayShanghai());
 const found=queryEvents({month:'1800-01',country:'FR',q:'100% literal_',page:1.4,limit:1.5});assert.equal(found.events.length,1);assert.equal(found.events[0].id,'test-a');assert.equal(found.page,1);assert.equal(queryEvents({country:'FR',from:'1800-02',to:'1800-12'}).total,0);assert.equal(queryEvents({country:'FR',from:'1800-01',to:'1800-01'}).total,1);
 assert.equal(queryEvents({month:'1800-01',q:"' OR 1=1 --"}).total,0);assert.equal(queryEvents({month:'1800-01',country:'US'}).total,0);assert.equal(queryEvents({month:'1800-01',category:'science'}).total,0);
 db.prepare('UPDATE events SET image_url=?,image_credit=? WHERE id=?').run('/images/example.webp','public domain','test-a');saveYear(1800,[e],{'1800-01':1},todayShanghai());assert.equal(queryEvents({month:'1800-01'}).events[0].imageUrl,'/images/example.webp');
 saveYear(1800,[],{},todayShanghai(),'source unavailable');assert.equal(queryEvents({month:'1800-01'}).events[0].id,'test-a');
 saveYear(1800,[sample('test-b','Independent supplemental verified event')],{'1800-01':1},todayShanghai(),'source unavailable');assert.equal(queryEvents({month:'1800-01'}).total,2);
 const local={...sample('test-local-jp','A unique Japanese scientific milestone outside the global selection'),countryCodes:['JP'],date:'1800-01-03',score:35};saveYear(1800,[e],{'1800-01':2},todayShanghai(),null,[e,local]);
 assert.equal(queryEvents({month:'1800-01'}).total,1);assert.equal(queryEvents({month:'1800-01',country:'JP'}).events[0].id,'test-local-jp');assert.equal(queryEvents({q:'unique Japanese'}).events[0].id,'test-local-jp');assert.equal(queryEvents({month:'1800-01',scope:'countries'}).total,2);
 db.prepare('UPDATE candidates SET image_url=?,image_credit=? WHERE id=?').run('/images/candidate.webp','public domain','test-local-jp');saveYear(1800,[e],{'1800-01':2},todayShanghai(),null,[e,local]);assert.equal(queryEvents({month:'1800-01',country:'JP'}).events[0].imageUrl,'/images/candidate.webp');
 db.close();rmSync(directory,{recursive:true,force:true});
});
