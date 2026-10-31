import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { load } from 'cheerio';
import type { HistoryEvent } from '../types';

const USER_AGENT = 'WorldHistoryAtlas/1.0 (local educational history archive; Wikimedia Commons attribution retained)';
const MAX_DOWNLOAD = 8 * 1024 * 1024;
const TIMEOUT = 25_000;

export interface MediaRecord {
  file: string;
  imageUrl: string;
  imageCredit: string;
  sourceUrl: string;
  downloadUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  bytes: number;
  width: number;
  height: number;
  cachedAt: string;
}
export interface MediaSeed { key: string; month: string; dates?: string[]; match: RegExp; exclude?: RegExp; file: string; caption: string }

/** These mappings identify the pictured event explicitly; no unrelated search result is attached. */
export const mediaSeeds: MediaSeed[] = [
  { key: 'apollo-11', month: '1969-07', dates: ['1969-07-20', '1969-07-21'], match: /Apollo[\s-]*11|阿波[罗羅][\s-]*(?:11|十一)|Armstrong|Aldrin|阿姆斯[特壯壮]?朗|阿姆斯特朗|奧爾德林|奥尔德林|首次[^\n]{0,12}(?:登[上陸陆]?月|踏上月球)|first human[^\n]{0,30}moon/i, exclude: /Luna\s*15|月球\s*(?:15|十五)/i, file: 'Aldrin Apollo 11 original.jpg', caption: '阿波罗 11 号任务期间，宇航员在月球表面；NASA 历史照片，1969 年。' },
  { key: 'wright-first-flight', month: '1903-12', dates: ['1903-12-17'], match: /Wright|莱特|萊特/i, file: 'First flight2.jpg', caption: '莱特兄弟的首次动力飞行，1903 年 12 月 17 日；历史档案照片。' },
  { key: 'titanic', month: '1912-04', match: /Titanic|泰坦尼克|鐵達尼|铁达尼/i, file: 'RMS Titanic 3.jpg', caption: '泰坦尼克号于 1912 年 4 月离开南安普敦，照片摄于沉没前。' },
  { key: 'hiroshima', month: '1945-08', dates: ['1945-08-06'], match: /Hiroshima|广岛|廣島/i, file: 'Atomic cloud over Hiroshima.jpg', caption: '1945 年 8 月 6 日广岛原子弹爆炸后的蘑菇云；美国军方历史照片。' },
  { key: 'berlin-wall', month: '1989-11', match: /Berlin Wall|柏林[圍围]?[墙牆]/i, file: 'Thefalloftheberlinwall1989.JPG', caption: '1989 年 11 月柏林墙开放后的历史现场。' },
];

function cleanHtml(value = '') { return load(`<body>${value}</body>`)('body').text().replace(/\s+/g, ' ').trim(); }
export function isAllowedLicense(shortName: string, licenseUrl: string) {
  const name = cleanHtml(shortName).toLowerCase();
  if (name === 'public domain' || name === 'cc0' || name.startsWith('cc0 ')) return true;
  if (/^cc by(?:-sa)? [1-4]\.0(?: [a-z-]+)?$/i.test(name)) {
    try { const url = new URL(licenseUrl); return url.protocol === 'https:' && url.hostname === 'creativecommons.org' && /^\/licenses\/by(?:-sa)?\//.test(url.pathname); } catch { return false; }
  }
  return false;
}

export function safeUploadUrl(raw: string) {
  const url = new URL(raw);
  // Commons uses its new thumbnail alias in imageinfo responses; fetch the same path on its original image host.
  if (url.hostname === 'thumb.wikimedia.org') url.hostname = 'upload.wikimedia.org';
  if (url.protocol !== 'https:' || url.hostname !== 'upload.wikimedia.org' || url.username || url.password || url.port || !url.pathname.startsWith('/wikipedia/commons/')) throw new Error('拒绝非 Wikimedia Commons 图片地址');
  url.search = ''; url.hash = '';
  return url.toString();
}

async function downloadImage(rawUrl: string): Promise<Buffer> {
  let url = safeUploadUrl(rawUrl);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location'); await response.body?.cancel(); if (!next) throw new Error('图片跳转没有目标地址'); url = safeUploadUrl(new URL(next, url).toString()); continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`图片下载 HTTP ${response.status}`); }
    const mime = response.headers.get('content-type')?.split(';')[0];
    if (!mime || !['image/jpeg', 'image/png', 'image/webp', 'image/tiff'].includes(mime)) { await response.body?.cancel(); throw new Error(`拒绝图片格式 ${mime}`); }
    if (Number(response.headers.get('content-length') || 0) > MAX_DOWNLOAD) { await response.body?.cancel(); throw new Error('图片超过 8 MB 限制'); }
    if (!response.body) throw new Error('图片响应没有内容');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > MAX_DOWNLOAD) { await reader.cancel(); throw new Error('图片下载超过 8 MB 限制'); } chunks.push(chunk.value); }
    return Buffer.concat(chunks);
  }
  throw new Error('图片跳转次数过多');
}

/** Only public-domain / CC0 / CC BY / CC BY-SA media is cached, with original metadata retained. */
export async function cacheCommonsFile(seed: MediaSeed): Promise<MediaRecord> {
  const directory = join(process.cwd(), 'public', 'images', 'events'); await mkdir(directory, { recursive: true });
  const stem = `${seed.key}-${createHash('sha256').update(seed.file).digest('hex').slice(0, 8)}`;
  const output = join(directory, `${stem}.webp`); const sidecar = join(directory, `${stem}.json`);
  try { const previous = JSON.parse(await readFile(sidecar, 'utf8')) as MediaRecord; if ((await stat(output)).size > 0) return previous; } catch { /* A missing or interrupted cache is rebuilt from its licensed source. */ }
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({ action: 'query', format: 'json', titles: `File:${seed.file}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '960' }).toString();
  const response = await fetch(api, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error(`Commons 元数据 HTTP ${response.status}`);
  const result = await response.json() as { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; url: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }> } };
  const info = Object.values(result.query?.pages || {})[0]?.imageinfo?.[0]; if (!info) throw new Error(`Commons 图片不存在：${seed.file}`);
  const metadata = info.extmetadata || {};
  const license = cleanHtml(metadata.LicenseShortName?.value || metadata.UsageTerms?.value); const licenseUrl = (metadata.LicenseUrl?.value || '').replace(/^http:/, 'https:');
  if (!isAllowedLicense(license, licenseUrl)) throw new Error(`图片许可不在允许列表：${license}`);
  const author = cleanHtml(metadata.Artist?.value || metadata.Credit?.value) || '作者见 Wikimedia Commons 原始文件页';
  let downloadUrl = safeUploadUrl(info.thumburl || info.url);
  let input: Buffer;
  try { input = await downloadImage(downloadUrl); }
  catch (error) {
    // Thumbnail generation can be rate-limited while an already-existing small original remains available.
    if (!info.thumburl || !/HTTP (404|429)/.test(error instanceof Error ? error.message : '')) throw error;
    downloadUrl = safeUploadUrl(info.url); input = await downloadImage(downloadUrl);
  }
  const { data, info: dimensions } = await sharp(input, { limitInputPixels: 40_000_000, animated: false }).rotate().resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75, effort: 5 }).toBuffer({ resolveWithObject: true });
  const sourceUrl = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(seed.file.replaceAll(' ', '_'))}`;
  const imageCredit = `${seed.caption} 图片：${author} · ${license}${licenseUrl ? ` (${licenseUrl})` : ''} · 来源：${sourceUrl} · 已缩放并转为 WebP。`;
  const record: MediaRecord = { file: seed.file, imageUrl: `/images/events/${stem}.webp`, imageCredit, sourceUrl, downloadUrl, author, license, licenseUrl, bytes: data.byteLength, width: dimensions.width, height: dimensions.height, cachedAt: new Date().toISOString() };
  await writeFile(output, data); await writeFile(sidecar, JSON.stringify(record, null, 2) + '\n');
  return record;
}

export function findMediaSeed(event: Pick<HistoryEvent, 'month' | 'title' | 'summary'> & Partial<Pick<HistoryEvent, 'date'>>) {
  const text = `${event.title} ${event.summary}`;
  return mediaSeeds.find(seed => seed.month === event.month && (!seed.dates || !event.date || seed.dates.includes(event.date)) && seed.match.test(text) && !seed.exclude?.test(text));
}

export async function cacheEventMedia(event: HistoryEvent): Promise<MediaRecord | null> {
  const seed = findMediaSeed(event); return seed ? cacheCommonsFile(seed) : null;
}
