import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as cheerio from 'cheerio';
import type { EventCategory, HistoryEvent } from '../types';
import { countries } from '../countries';

export const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export type RawEvent = {year:number;month:number;day:number;summary:string;sourceUrl:string;sourceTitle:string;language:'en'|'zh';links?:string[]};
const clean = (s:string) => s.replace(/\[\d+\]|\[citation needed\]|\[需要引用\]/g,'').replace(/\s+/g,' ').trim();
export function parseYear(html:string, year:number, language:'en'|'zh'):RawEvent[] {
 const $=cheerio.load(html); const result:RawEvent[]=[]; let active=false;
 const article=$('.mw-parser-output').filter((_,el)=>$(el).find('h2').length>0).last();const root=article.length?article:$('body');
 root.find('h2,h3,li').each((_,el)=>{
  const n=$(el);const tag=el.tagName;
  if(tag==='h2'){const label=n.clone().children('.mw-editsection').remove().end().text();active=language==='zh'?/大事[记紀記]|重要事件/.test(label):/^Events\b/.test(label);return;}
  if(!active||tag!=='li'||n.closest('table,figure,.navbox,.reflist').length)return;
  if(n.children('ul,ol').length)return;
  const own=n.clone();own.find('sup,.mw-editsection,style,script').remove();let text=clean(own.text());if(text.length<12||/\{\{(?:PERSON|SECRET)_/.test(text))return;
  let prefix=text;let dateMatch:RegExpMatchArray|null=null;let month=0,day=0;
  if(language==='zh'){
   dateMatch=prefix.match(/^(\d{1,2})月(?:(\d{1,2})日)?(?:[—–－\s:：]|$)/);
   if(!dateMatch){const parent=n.parent().closest('li').clone();parent.children('ul,ol').remove();prefix=clean(parent.text());dateMatch=prefix.match(/^(\d{1,2})月(?:(\d{1,2})日)?/);}
   if(dateMatch&&!dateMatch[2])return;
   if(dateMatch){month=+dateMatch[1];day=+dateMatch[2];text=text.replace(/^\d{1,2}月(?:\d{1,2}日)?\s*[—–－:：]*\s*/,'');}
  }else{
   dateMatch=prefix.match(new RegExp('^('+MONTH_NAMES.join('|')+')\\s+(\\d{1,2})(?:[\\s–—,:]|$)'));
   if(!dateMatch){const parent=n.parent().closest('li').clone();parent.children('ul,ol').remove();prefix=clean(parent.text());dateMatch=prefix.match(new RegExp('^('+MONTH_NAMES.join('|')+')\\s+(\\d{1,2})'));}
   if(dateMatch){month=MONTH_NAMES.indexOf(dateMatch[1])+1;day=+dateMatch[2];text=text.replace(new RegExp('^('+MONTH_NAMES.join('|')+')\\s+\\d{1,2}(?:\\s*[–—:-]\\s*)?'),'');}
  }
  if(month<1||month>12||day<1||day>31||text.length<12)return;const actual=new Date(Date.UTC(year,month-1,day));if(actual.getUTCFullYear()!==year||actual.getUTCMonth()!==month-1||actual.getUTCDate()!==day)return;
  const links:string[]=[];n.find('a[title]').each((_,a)=>{const title=$(a).attr('title');if(title&&!/^\d|^File:|^Help:|^Category:/.test(title)&&!MONTH_NAMES.includes(title))links.push(title);});
  result.push({year,month,day,summary:text,sourceUrl:`https://${language}.wikipedia.org/wiki/${language==='zh'?year+'%E5%B9%B4':year}#${language==='zh'?'大事记':'Events'}`,sourceTitle:`${year}${language==='zh'?'年 · 维基百科':' · Wikipedia'}`,language,links});
 });return result;
}
const aliases:Record<string,string[]>={CN:['Qing','Qing Empire','中国','中國','清朝','清廷','中华','中華','北京','上海','南京','China','Chinese','Beijing','Shanghai','Qing dynasty'],US:['USA','U.S','Apollo 11','Apollo11','Cape Kennedy','Cape Canaveral','Florida','美国','美國','美军','美軍','華盛頓','华盛顿','United States','American','Washington','NASA','New York'],GB:['英国','英國','伦敦','倫敦','英军','英軍','British','Britain','United Kingdom','London','England'],FR:['法国','法國','法蘭西','法兰西','巴黎','拿破仑','拿破崙','France','French','Paris','Napoleon'],DE:['德国','德國','普鲁士','普魯士','德意志','柏林','Germany','German','Prussia','Berlin'],RU:['俄罗斯','俄羅斯','苏联','蘇聯','俄国','俄國','Russia','Russian','Soviet','Moscow'],IT:['意大利','義大利','罗马','羅馬','Italy','Italian','Rome'],JP:['日本','东京','東京','Japan','Japanese','Tokyo'],IN:['印度','India','Indian','Delhi'],KR:['韩国','韓國','南韓','South Korea'],KP:['朝鲜','朝鮮','North Korea'],AU:['澳大利亚','澳大利亞','Australia','Australian'],CA:['加拿大','Canada','Canadian'],BR:['巴西','Brazil','Brazilian'],AT:['奥地利','奧地利','Austria','Austrian','Vienna'],ES:['西班牙','Spain','Spanish'],PT:['葡萄牙','Portugal','Portuguese'],NL:['荷兰','荷蘭','尼德兰','尼德蘭','Netherlands','Dutch'],BE:['比利时','比利時','Belgium','Belgian'],PL:['波兰','波蘭','Poland','Polish'],UA:['乌克兰','烏克蘭','Ukraine','Ukrainian'],TR:['土耳其','奥斯曼','鄂圖曼','Ottoman','Turkey','Turkish'],EG:['埃及','Egypt','Egyptian'],ZA:['南非','South Africa'],MX:['墨西哥','Mexico','Mexican'],AR:['阿根廷','Argentina'],CL:['智利','Chile'],IL:['以色列','Israel','Israeli'],PS:['巴勒斯坦','Palestine','Palestinian','Gaza'],IR:['伊朗','波斯','Iran','Iranian','Persia'],IQ:['伊拉克','Iraq'],AF:['阿富汗','Afghanistan'],PK:['巴基斯坦','Pakistan'],BD:['孟加拉','Bangladesh'],VN:['越南','Vietnam'],TH:['泰国','泰國','暹罗','暹羅','Thailand','Siam'],ID:['印度尼西亚','印度尼西亞','印尼','Indonesia'],PH:['菲律宾','菲律賓','Philippines'],MY:['马来西亚','馬來西亞','Malaysia'],SG:['新加坡','Singapore'],NZ:['新西兰','紐西蘭','New Zealand'],GR:['希腊','希臘','Greece','Greek'],CH:['瑞士','Switzerland','Swiss'],SE:['瑞典','Sweden','Swedish'],NO:['挪威','Norway','Norwegian'],DK:['丹麦','丹麥','Denmark','Danish'],FI:['芬兰','芬蘭','Finland','Finnish'],IE:['爱尔兰','愛爾蘭','Ireland','Irish'],HT:['海地','Haiti','Haitian'],CU:['古巴','Cuba','Cuban'],VE:['委内瑞拉','委內瑞拉','Venezuela'],CO:['哥伦比亚','哥倫比亞','Colombia'],PE:['秘鲁','秘魯','Peru'],ET:['埃塞俄比亚','衣索比亞','Ethiopia'],NG:['尼日利亚','奈及利亞','Nigeria'],KE:['肯尼亚','肯亞','Kenya'],SD:['苏丹','蘇丹','Sudan'],SA:['沙特','沙烏地','Saudi Arabia'],SY:['叙利亚','敘利亞','Syria'],LB:['黎巴嫩','Lebanon'],NP:['尼泊尔','尼泊爾','Nepal'],MM:['缅甸','緬甸','Myanmar','Burma']};
// Use curated English/Chinese names, not arbitrary foreign endonyms such as Iceland's "Island".
const extraAliases:Record<string,string[]>={GW:['Guinea Bissau'],CD:['Democratic Republic of the Congo','Democratic Republic of Congo'],CG:['Republic of the Congo'],TL:['East Timor'],CV:['Cape Verde','Cabo Verde'],SZ:['Swaziland'],TW:['Taiwanese','\u53f0\u7063','\u81fa\u7063'],GE:['Georgian']};
const countryPatterns=countries.map(c=>({code:c.code,pattern:new RegExp([...new Set([c.name,c.nameEn,...(aliases[c.code]||[]),...(extraAliases[c.code]||[])])].filter(a=>a&&a.length>=2).sort((a,b)=>b.length-a.length).map(a=>{const escaped=a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return /[\u3400-\u9fff]/.test(a)?escaped:`\\b${escaped}\\b`;}).join('|'),'gi')}));
export function inferCountries(text:string):string[]{
 const hits:{code:string;start:number;end:number}[]=[];
 for(const c of countryPatterns){c.pattern.lastIndex=0;for(const match of text.matchAll(c.pattern)){const start=match.index!;const end=start+match[0].length;
  // New Guinea is an island shared by Indonesia and Papua New Guinea, never Guinea (GN).
  if(c.code==='GE'&&/\bAtlanta\b|\b(?:US|U\.S\.|American)\s+state\s+of\s+Georgia\b|\bGeorgia\s*,\s*(?:US\b|U\.S\.?|United States)|\bstate of Georgia\b/i.test(text)&&!/Tbilisi|Georgian|Caucasus|\u683c\u9c81\u5409\u4e9a|\u683c\u9b6f\u5409\u4e9e/i.test(text))continue;
  if(c.code==='GN'&&/(?:New|Papua)\s+$/i.test(text.slice(Math.max(0,start-20),start)))continue;
  hits.push({code:c.code,start,end});
 }}
 for(const match of text.matchAll(/\bUS\b/g))hits.push({code:'US',start:match.index!,end:match.index!+2});
 // A country name embedded in a longer country's name belongs to that longer name.
 const specific=hits.filter(hit=>!hits.some(other=>other.code!==hit.code&&other.start<=hit.start&&other.end>=hit.end&&(other.start<hit.start||other.end>hit.end)));
 return [...new Set(specific.sort((a,b)=>a.start-b.start||b.end-a.end).map(hit=>hit.code))].slice(0,6);
}
export function classify(text:string):EventCategory {
 if(/战争|戰爭|战役|戰役|軍隊|军队|入侵|侵略|战争|袭击|襲擊|battle|war\b|military|invasion|attack|army|massacre|rebel/i.test(text))return 'conflict';
 if(/地震|海啸|海嘯|洪水|飓风|颶風|台风|颱風|气旋|氣旋|灾难|災難|爆炸|earthquake|tsunami|flood|hurricane|typhoon|cyclone|disaster|killed|explosion/i.test(text))return 'disaster';
 if(/发现|發現|发明|發明|首次|太空|航天|科学|科學|疫苗|衛星|卫星|登月|互联网|discover|invent|space|satellite|vaccine|scientific|moon|internet/i.test(text))return 'science';
 if(/经济|經濟|银行|銀行|金融|贸易|貿易|货币|貨幣|股票|market|bank|econom|financial|trade|currency/i.test(text))return 'economy';
 if(/选举|選舉|总统|總統|独立|獨立|宪法|憲法|条约|條約|革命|成立|签署|簽署|皇帝|国王|國王|election|president|independen|constitution|treaty|revolution|king\b|parliament/i.test(text))return 'politics';
 if(/奥运|奧運|艺术|藝術|文学|文學|电影|電影|出版|音乐|音樂|olympic|sport|Tour de France|art\b|music|film|published|novel|opera/i.test(text))return 'culture';
 return 'society';
}
const publisherPattern=/\b(?:Reuters|Associated Press|Agence France[- ]Presse|AP|AFP|BBC(?: News)?|France\s*24|Al Jazeera|The Guardian|CNN|NBC|CBS|ABC News|NPR|DW|Deutsche Welle|Euronews|Xinhua|Bloomberg|Financial Times|New York Times|Washington Post|South China Morning Post|Kyodo|Yonhap|Anadolu|Times of India|NHK)\b/i;
export function stripPublisherCitations(text:string):string{return text.replace(/\([^()]*\)/g,part=>publisherPattern.test(part)?'':part).replace(/\s+/g,' ').trim();}
export function enrich(raw:RawEvent):HistoryEvent {
 const date=`${raw.year}-${String(raw.month).padStart(2,'0')}-${String(raw.day).padStart(2,'0')}`;
 const semanticText=stripPublisherCitations(raw.summary);const semanticLinks=(raw.links||[]).filter(title=>!publisherPattern.test(title));const countryCodes=inferCountries(semanticText+' '+semanticLinks.join(' '));const c=countries.find(c=>c.code===countryCodes[0]);const category=classify(semanticText);
 const important=/world war|世界大战|世界大戰|independen|独立|獨立|revolution|革命|first\b|首次|第一次|第一个|第一個|人類的一大步|人类的一大步|登月|联合国|聯合國|united nations|abolish|废除|廢除|constitution|宪法|憲法|treaty|条约|條約|discover|发现|發現|moon landing|登月|金融危机|金融危機|pandemic|大流行/gi;
 const iconic=/柏林[围圍]?[墙牆]|Berlin Wall|廣島|广岛|Hiroshima|Nagasaki|長崎|长崎|原子弹|原子彈|atomic bomb|阿波[罗羅].?11|Apollo.?11|Titanic|泰坦尼克|鐵達尼|\bWright\b|莱特|萊特|苏联解体|蘇聯解體|dissolution of the Soviet/i.test(raw.summary)?45:0;
 const score=20+iconic+Math.min(new Set((raw.summary.match(important)||[]).map(s=>s.toLowerCase())).size,4)*12+Math.min((raw.links||[]).length,8)*2+Math.min(countryCodes.length,3)*3+(raw.language==='zh'?18:0)+(category==='conflict'?3:0);
 const sentences=raw.summary.split(raw.language==='zh'?/(?<=[。！？])/u:/(?<=[.!?])\s+(?=[A-Z])/u);const excerpt=sentences.slice(0,2).join(raw.language==='zh'?'':' ').trim();const summary=excerpt.length>440?excerpt.slice(0,437)+'…':excerpt;let title=raw.language==='zh'?summary.split(/[。！？]/)[0]:summary;title=title.length>(raw.language==='zh'?54:100)?title.slice(0,raw.language==='zh'?52:97)+'…':title;
 return {id:createHash('sha256').update(date+'|'+summary).digest('hex').slice(0,24),title,summary,date,month:date.slice(0,7),countryCodes,lat:c?.lat||0,lng:c?.lng||0,category,score,sourceUrl:raw.sourceUrl,sourceTitle:raw.sourceTitle,imageUrl:null,imageCredit:null};
}
export function candidateEvents(raw:RawEvent[],cutoff:string):HistoryEvent[]{
 const seen=new Set<string>();const events:HistoryEvent[]=[];
 for(const r of [...raw].sort((a,b)=>Number(b.language==='zh')-Number(a.language==='zh'))){
  const actual=new Date(Date.UTC(r.year,r.month-1,r.day));if(actual.getUTCFullYear()!==r.year||actual.getUTCMonth()!==r.month-1||actual.getUTCDate()!==r.day)continue;
  const e=enrich(r);if(e.date>cutoff||e.date<'1800-01-01'||/\{\{(?:PERSON|SECRET)_/.test(e.summary))continue;const key=e.date+'|'+e.summary.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');if(seen.has(key))continue;seen.add(key);events.push(e);
 }return events;
}
export function selectMonthly(raw:RawEvent[],cutoff:string):HistoryEvent[]{
 const grouped=new Map<string,HistoryEvent[]>();
 for(const e of candidateEvents(raw,cutoff)){
  const bucket=grouped.get(e.month)||[];
  const tokens=new Set(e.summary.toLowerCase().match(/[a-z]{3,}/g)||[]);
  if(bucket.some(x=>{if(x.date!==e.date)return false;const other=new Set(x.summary.toLowerCase().match(/[a-z]{3,}/g)||[]);const common=[...tokens].filter(t=>other.has(t)).length;return common>=4&&common/Math.min(tokens.size,other.size)>.65;}))continue;
  bucket.push(e);grouped.set(e.month,bucket);
 }
 return [...grouped.values()].flatMap(events=>{
  // Prefer translated records while encouraging different dates to reduce cross-language duplicates.
  const pool=events;const cap=pool.filter(e=>e.score>=50).length>=8?8:5;const chosen:HistoryEvent[]=[];const remaining=[...pool];while(chosen.length<cap&&remaining.length){remaining.sort((a,b)=>{
   const topic=(e:HistoryEvent)=>/Apollo.?11|阿波[罗羅].?11|登月|月球|moon landing/i.test(e.summary)?'apollo11':/Berlin Wall|柏林[圍围]?[墙牆]/i.test(e.summary)?'berlin-wall':null;const adjusted=(e:HistoryEvent)=>e.score*(chosen.some(c=>c.date===e.date)?0.65:1)*(topic(e)&&chosen.some(c=>topic(c)===topic(e))?0.25:1);return adjusted(b)-adjusted(a)||a.date.localeCompare(b.date);
  });chosen.push(remaining.shift()!);}return chosen;
 });
}
let nextRequestAt=0;
let requestQueue=Promise.resolve();
async function requestSlot(){let release!:()=>void;const previous=requestQueue;requestQueue=new Promise<void>(r=>{release=r;});await previous;try {const delay=Math.max(0,nextRequestAt-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));nextRequestAt=Date.now()+1100;}finally{release();}}
async function fetchDocument(url:string,key:string,fresh=false):Promise<string>{
 const dir=join(process.cwd(),'data','source-cache');await mkdir(dir,{recursive:true});const path=join(dir,`${key}.html.gz`);
 if(!fresh){try {const cached=JSON.parse(await readFile(path+'.meta','utf8'));if(Date.now()-cached.savedAt<30*86400000)return gunzipSync(await readFile(path)).toString();}catch{}}
 let last:unknown;
 for(let attempt=0;attempt<3;attempt++)try{
  await requestSlot();const response=await fetch(url,{headers:{'User-Agent':'WorldHistoryLocal/1.0 (educational local timeline; Wikipedia attribution retained)'},signal:AbortSignal.timeout(25000)});if(response.status===429){const retry=response.headers.get('retry-after');const seconds=retry?(Number(retry)||Math.ceil((Date.parse(retry)-Date.now())/1000)):15*(attempt+1);nextRequestAt=Math.max(nextRequestAt,Date.now()+Math.max(15,seconds)*1000);throw new Error(`Wikipedia 429: ${key}; retry after ${Math.max(15,seconds)} seconds`);}if(!response.ok)throw new Error(`Wikipedia ${response.status}: ${key}`);const html=await response.text();if(!html.includes('mw-parser-output'))throw new Error(`Invalid source: ${key}`);await writeFile(path,gzipSync(html));await writeFile(path+'.meta',JSON.stringify({savedAt:Date.now(),url}));return html;
 }catch(error){last=error;await new Promise(r=>setTimeout(r,(attempt+1)*650));}
 throw last;
}

export function fetchYear(year:number,language:'en'|'zh',fresh=false){return fetchDocument(`https://${language}.wikipedia.org/wiki/${language==='zh'?year+'%E5%B9%B4':year}`,`${language}-${year}`,fresh);}
export function fetchCurrentMonth(year:number,month:number,fresh=false){return fetchDocument(`https://en.wikipedia.org/wiki/Portal:Current_events/${MONTH_NAMES[month-1]}_${year}`,`current-${year}-${month}`,fresh);}
export function parseCurrentMonth(html:string,year:number,month:number):RawEvent[]{
 const $=cheerio.load(html);const result:RawEvent[]=[];
 $('.current-events-main').each((_,block)=>{const dayBlock=$(block);const date=dayBlock.find('.dtstart').first().text().trim();if(!new RegExp(`^${year}-${String(month).padStart(2,'0')}-\\d{2}$`).test(date))return;
  dayBlock.find('.current-events-content li').each((_,el)=>{const item=$(el);if(item.children('ul,ol').length)return;const own=item.clone();own.find('sup,style,script').remove();const text=clean(own.text());if(text.length<25||/\{\{(?:PERSON|SECRET)_/.test(text))return;
   const links:string[]=[];item.find('a[title]').each((_,a)=>{const title=$(a).attr('title');if(title)links.push(title);});
   result.push({year,month,day:+date.slice(-2),summary:text,sourceUrl:`https://en.wikipedia.org/wiki/Portal:Current_events/${MONTH_NAMES[month-1]}_${year}#${year}_${MONTH_NAMES[month-1]}_${+date.slice(-2)}`,sourceTitle:`${MONTH_NAMES[month-1]} ${year} · Wikipedia Current events`,language:'en',links});
  });
 });return result;
}
