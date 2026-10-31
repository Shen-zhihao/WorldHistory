import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYear, parseCurrentMonth, selectMonthly, inferCountries, classify, enrich, stripPublisherCitations } from '../src/lib/server/source';

test('year parser ignores births and undated notes, inherits nested English dates',()=>{
 const html='<div class="mw-parser-output"><h2>Events</h2><ul><li>January 2<ul><li>The French army signs a major international treaty in Paris.</li><li>A new scientific discovery is announced in Britain.</li></ul></li><li>February 30 – Invalid historical date.</li><li>Year-long undated notes do not get a false January date.</li></ul><h2>Births</h2><ul><li>January 4 – A fictional actor is born.</li></ul></div>';
 const rows=parseYear(html,1800,'en');assert.equal(rows.length,2);assert.equal(rows[0].month,1);assert.equal(rows[0].day,2);assert.ok(!rows.some(r=>r.summary.includes('fictional')));
});
test('Chinese parser strips date, skips references and accepts genuine date',()=>{
 const rows=parseYear('<div class="mw-parser-output"><h2>大事记</h2><ul><li>7月20日——美国阿波罗11号首次登月。<sup>[1]</sup></li><li>2月29日——非闰年的错误日期。</li></ul><h2>出生</h2><ul><li>7月21日——某人出生。</li></ul></div>',1969,'zh');
 assert.equal(rows.length,1);assert.equal(rows[0].summary,'美国阿波罗11号首次登月。');assert.equal(rows[0].day,20);
});
test('ranking caps each month, deduplicates equivalent events and respects startup cutoff',()=>{
 const raw=Array.from({length:12},(_,i)=>({year:1969,month:7,day:i+1,summary:`Independent historical occurrence number ${i} in France changed society.`,language:'en' as const,sourceUrl:'https://en.wikipedia.org/wiki/1969',sourceTitle:'1969'}));
 const chosen=selectMonthly([...raw,raw[0],{...raw[0],year:2027}], '1969-07-10');assert.equal(chosen.length,5);assert.equal(new Set(chosen.map(e=>e.id)).size,5);assert.ok(chosen.every(e=>e.date<='1969-07-10'));assert.ok(chosen.every(e=>e.countryCodes.includes('FR')));
});
test('unrelated events sharing a date are not discarded as duplicates',()=>{
 const raw=[{year:1969,month:7,day:20,summary:'美国阿波罗11号首次登月。',language:'zh' as const,sourceUrl:'https://zh.wikipedia.org/wiki/1969年',sourceTitle:'1969'}, {year:1969,month:7,day:20,summary:'An independent earthquake strikes a remote region in Japan.',language:'en' as const,sourceUrl:'https://en.wikipedia.org/wiki/1969',sourceTitle:'1969'}];assert.equal(selectMonthly(raw,'1969-07-31').length,2);
});
test('country aliases map historical states onto disclosed present-day geography',()=>{
 assert.ok(inferCountries('Qing dynasty in China').includes('CN'));assert.ok(inferCountries('The Soviet Union signs a treaty.').includes('RU'));assert.ok(!inferCountries('A British scientific report.').includes('US'));
});

test('daily current-events portal retains each day and its exact archive source',()=>{
 const html='<div class="current-events-main"><div class="current-events-title"><span class="dtstart">2026-10-12</span></div><div class="current-events-content"><ul><li>Politics<ul><li>A major international treaty is signed by France and Germany. (Reuters)</li></ul></li></ul></div></div>';
 const events=parseCurrentMonth(html,2026,10);assert.equal(events.length,1);assert.equal(events[0].day,12);assert.ok(events[0].sourceUrl.includes('October_2026#2026_October_12'));
});
test('information-dense months may include eight significant independent events',()=>{
 const raws=Array.from({length:12},(_,i)=>({year:2000,month:1,day:i+1,summary:`The first independent scientific discovery ${i} follows a major international treaty in France and Germany.`,language:'en' as const,sourceUrl:'https://en.wikipedia.org/wiki/2000',sourceTitle:'2000',links:['science','treaty','France','Germany']}));
 assert.equal(selectMonthly(raws,'2000-01-31').length,8);
});

test('year parser chooses actual article when template emits an empty parser-output first',()=>{
 const rows=parseYear('<div class="mw-parser-output"></div><div class="mw-parser-output"><h2>大事记</h2><ul><li>7月20日——美国阿波罗11号首次登月。</li></ul><h2>出生</h2></div>',1969,'zh');assert.equal(rows.length,1);assert.equal(rows[0].day,20);
});

test('country names avoid endonym false positives and prefer longer country-name spans',()=>{
 assert.ok(!inferCountries('A US Senator is involved in an incident on Chappaquiddick Island.').includes('IS'));
 assert.ok(inferCountries('A US Senator visits the island.').includes('US'));
 assert.ok(!inferCountries('West Irian in Indonesia on the island of New Guinea.').includes('GN'));
 assert.ok(inferCountries('Papua New Guinea signs a treaty.').includes('PG'));
 assert.ok(!inferCountries('Papua New Guinea signs a treaty.').includes('GN'));
 assert.ok(inferCountries('Equatorial Guinea holds elections.').includes('GQ'));
 assert.ok(!inferCountries('Equatorial Guinea holds elections.').includes('GN'));
 assert.ok(inferCountries('Guinea Bissau holds elections.').includes('GW'));
 assert.ok(!inferCountries('Guinea Bissau holds elections.').includes('GN'));
 assert.ok(!inferCountries('The South Korean government visits South Korea.').includes('KP'));
 assert.ok(inferCountries('Guinea and Papua New Guinea sign a treaty.').includes('GN'));
 assert.ok(inferCountries('The Democratic Republic of the Congo holds elections.').includes('CD'));
 assert.ok(!inferCountries('The Democratic Republic of the Congo holds elections.').includes('CG'));
});
test('typhoons and cyclones are disasters, while Tour de France is culture and sport',()=>{
 assert.equal(classify('A typhoon strikes China.'),'disaster');assert.equal(classify('A cyclone strikes India.'),'disaster');assert.equal(classify('Typhoon Viola is a storm.'),'disaster');assert.equal(classify('Tour de France concludes in Paris.'),'culture');
});

test('news publishers are not treated as event countries and US Georgia is contextual',()=>{
 const raw={year:2026,month:10,day:12,summary:'A typhoon strikes Taiwan. (AFP via France24)',language:'en' as const,sourceUrl:'https://en.wikipedia.org/wiki/Portal:Current_events/October_2026',sourceTitle:'Current events',links:['Taiwan','France24','Agence France-Presse']};
 const event=enrich(raw);assert.ok(event.countryCodes.includes('TW'));assert.ok(!event.countryCodes.includes('FR'));assert.equal(event.category,'disaster');assert.equal(event.summary,raw.summary);
 assert.equal(stripPublisherCitations('The US and France sign a treaty. (Reuters)'),'The US and France sign a treaty.');
 assert.ok(!inferCountries('Zoo Atlanta, Georgia, U.S.').includes('GE'));assert.ok(inferCountries('The Georgian government in Tbilisi meets US officials.').includes('GE'));assert.ok(inferCountries('Georgia signs a treaty.').includes('GE'));
});
