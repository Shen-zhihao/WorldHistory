import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

type Supplement = {year:number;month:number;day:number;summary:string;sourceUrl:string;sourceTitle:string;language:string};
function readSupplement():Supplement[] {
  const base=join(process.cwd(),'data','supplemental-events.json');
  return JSON.parse(existsSync(base+'.gz')?gunzipSync(readFileSync(base+'.gz')).toString('utf8'):readFileSync(base,'utf8'));
}

test('bundled historical corpus retains valid real dates and direct Wikipedia provenance',()=>{
  const rows=readSupplement();
  assert.ok(rows.length>=15000,'the historical corpus must not silently be replaced with a small demo');
  const months=new Set<string>();
  for(const row of rows){
    const date=new Date(Date.UTC(row.year,row.month-1,row.day));
    assert.equal(date.getUTCFullYear(),row.year);
    assert.equal(date.getUTCMonth()+1,row.month);
    assert.equal(date.getUTCDate(),row.day);
    assert.ok(row.year>=1800);
    assert.ok(date<=new Date('2026-10-31T23:59:59Z'),'the pinned snapshot must exclude future examples');
    const source=new URL(row.sourceUrl);
    assert.equal(source.hostname,'en.wikipedia.org');
    assert.ok(source.pathname.startsWith('/wiki/'));
    assert.ok(row.summary.length>10);
    assert.ok(!/\{\{|\}\}|PERSON_|SECRET_|\[\[|\]\]|synthetic milestone/i.test(row.summary));
    assert.equal(row.language,'en');
    months.add(`${row.year}-${row.month}`);
  }
  assert.ok(months.size>2500,'the shipped dataset should span most of the 1800–2026 monthly timeline');
});

test('corpus includes sourced historical anchors from both centuries',()=>{
  const rows=readSupplement();
  const anchor=(year:number,month:number,day:number,pattern:RegExp)=>assert.ok(rows.some(r=>r.year===year&&r.month===month&&r.day===day&&pattern.test(r.summary)),`missing ${year}-${month}-${day} anchor`);
  anchor(1801,1,1,/Piazzi|Ceres|United Kingdom/);
  anchor(1914,7,28,/war|Austria/i);
  anchor(1969,7,20,/Apollo|Moon|Armstrong/i);
  anchor(1989,11,9,/Berlin/i);
  anchor(2001,9,11,/attack|hijack/i);
});

const snapshotPath=join(process.cwd(),'data','events.json.gz');
test('distributed database snapshot respects monthly caps, dates, and provenance',{skip:!existsSync(snapshotPath)},()=>{
  const snapshot=JSON.parse(gunzipSync(readFileSync(snapshotPath)).toString('utf8')) as {
    events:{id:string;date:string;month:string;summary:string;sourceUrl:string;lat:number;lng:number;countryCodes:string[]}[];
    candidates?:{id:string;date:string;month:string;summary:string;sourceUrl:string;countryCodes:string[]}[];
    months:{month:string}[];
  };
  assert.ok(snapshot.events.length>=9000,'production snapshot should contain broad history, not just demonstration months');
  const ids=new Set<string>();const counts=new Map<string,number>();
  const cutoff=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  for(const event of snapshot.events){
    assert.ok(!ids.has(event.id),'event IDs must be unique');ids.add(event.id);
    assert.equal(new Date(event.date+'T00:00:00Z').toISOString().slice(0,10),event.date);
    assert.equal(event.month,event.date.slice(0,7));
    assert.ok(event.date>='1800-01-01'&&event.date<=cutoff);
    assert.ok(!/\{\{|PERSON_|SECRET_/i.test(event.summary));
    assert.ok(/^https:\/\/(en|zh)\.wikipedia\.org\/wiki\//.test(event.sourceUrl));
    assert.ok(Number.isFinite(event.lat)&&Math.abs(event.lat)<=90);
    assert.ok(Number.isFinite(event.lng)&&Math.abs(event.lng)<=180);
    assert.equal(event.countryCodes.length,new Set(event.countryCodes).size);
    counts.set(event.month,(counts.get(event.month)||0)+1);
  }
  assert.ok([...counts.values()].every(count=>count<=8),'adaptive monthly cap is eight across all sources');
  assert.ok((snapshot.candidates?.length||0)>30000,'country search needs the broader candidate archive, not just global highlights');
  for(const event of snapshot.candidates||[]){
    assert.equal(new Date(event.date+'T00:00:00Z').toISOString().slice(0,10),event.date);
    assert.equal(event.month,event.date.slice(0,7));
    assert.ok(event.date>='1800-01-01'&&event.date<=cutoff);
    assert.ok(!/\{\{|PERSON_|SECRET_/i.test(event.summary));
    assert.ok(event.summary.length<=440);
    assert.ok(/^https:\/\/(en|zh)\.wikipedia\.org\/wiki\//.test(event.sourceUrl));
    assert.ok(event.countryCodes.every(code=>/^[A-Z]{2}$/.test(code)));
  }
  assert.ok(snapshot.months.some(m=>m.month==='1800-01'));
  assert.ok(snapshot.months.some(m=>m.month==='2026-10'));
});
