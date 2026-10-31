import OpenCC from "opencc-js/t2cn";
import { load } from "cheerio";
import type { Locale } from "../locale";
import type { HistoryEvent } from "../types";
import { getDb } from "./db";
import { contentHash } from "./content-hash";

export interface StoredTranslation { eventId: string; locale: Locale; sourceHash: string; title: string; summary: string; provider: string; createdAt: string }
export type TranslateText = (text: string, source: Locale, target: Locale) => Promise<{ text: string; provider: string }>;
const simplified = OpenCC.Converter({ from: "tw", to: "cn" });
const pending = new Map<string, Promise<void>>();
const failures = new Map<string, { at: number; message: string }>();
const jobs: (() => void)[] = [];
let active = 0;
let nextRequestAt = 0;
let providerBlockedUntil = 0;

export function canonicalEventId(id: string) { return id.replace(/-map-[A-Z]{2}$/, ""); }
export function sourceHash(event: Pick<HistoryEvent, "title" | "summary">) { return contentHash(event.title,event.summary); }
export function sourceLocale(event: Pick<HistoryEvent, "sourceUrl" | "summary">): Locale {
  if (event.sourceUrl.startsWith("https://zh.wikipedia.org/")) return "zh-CN";
  if (event.sourceUrl.startsWith("https://en.wikipedia.org/")) return "en";
  return (event.summary.match(/[\u3400-\u9fff]/g)?.length || 0) > event.summary.length / 5 ? "zh-CN" : "en";
}
export function splitTranslationText(text: string, maxBytes = 480): string[] {
  const pieces: string[] = []; let current = "";
  for (const character of text) {
    if (current && Buffer.byteLength(current + character, "utf8") > maxBytes) { pieces.push(current); current = ""; }
    current += character;
  }
  if (current.trim()) pieces.push(current);
  return pieces;
}
function cacheKey(event: HistoryEvent, locale: Locale) { return `${canonicalEventId(event.id)}:${locale}:${sourceHash(event)}`; }
function cached(event: HistoryEvent, locale: Locale): StoredTranslation | undefined {
  return getDb().prepare("SELECT event_id AS eventId,target_locale AS locale,source_hash AS sourceHash,title,summary,provider,created_at AS createdAt FROM event_translations WHERE event_id=? AND target_locale=? AND source_hash=?").get(canonicalEventId(event.id), locale, sourceHash(event)) as unknown as StoredTranslation | undefined;
}
function cleaned(value: string) { return load(`<body>${value}</body>`)('body').text().trim(); }
function validateTranslation(value: string, target: Locale) {
  const text = cleaned(value);
  if (!text || /MYMEMORY WARNING|YOU USED ALL AVAILABLE|INVALID LANGUAGE|QUERY LENGTH LIMIT|NO QUERY SPECIFIED/i.test(text)) throw new Error("翻译服务暂不可用或免费额度已用完");
  if (target === "zh-CN" && !/[\u3400-\u9fff]/.test(text)) throw new Error("翻译服务未返回中文内容");
  return target === "zh-CN" ? simplified(text) : text;
}

export const translateText: TranslateText = async (text, source, target) => {
  if (Date.now() < providerBlockedUntil) throw new Error("翻译服务额度暂不可用，请稍后重试或配置翻译服务");
  const provider = process.env.HISTORY_TRANSLATION_PROVIDER || "mymemory";
  if (provider === "off") throw new Error("在线翻译已关闭，仍可使用已缓存译文");
  const delay = Math.max(0, nextRequestAt - Date.now()); nextRequestAt = Math.max(Date.now(), nextRequestAt) + 650;
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  const from = source === "zh-CN" ? "zh" : "en";
  const to = target === "zh-CN" ? "zh-CN" : "en";
  let translated: string; let name: string;
  if (provider === "google") {
    const key = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!key) throw new Error("未配置 Google Cloud Translation 密钥");
    const url = new URL("https://translation.googleapis.com/language/translate/v2"); url.searchParams.set("key", key);
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: text, source: from, target: to, format: "text" }), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Google Cloud 翻译请求失败（${response.status}）`);
    const result = await response.json(); translated = result.data?.translations?.[0]?.translatedText; name = "Google Cloud Translation";
  } else if (provider === "libretranslate") {
    const endpoint = process.env.LIBRETRANSLATE_URL;
    if (!endpoint) throw new Error("未配置 LibreTranslate 服务地址");
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("翻译服务需要 HTTPS，或使用本机服务");
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: text, source: from, target: target === "zh-CN" ? "zh" : "en", format: "text", api_key: process.env.LIBRETRANSLATE_API_KEY || undefined }), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`LibreTranslate 请求失败（${response.status}）`);
    const result = await response.json(); translated = result.translatedText; name = "LibreTranslate";
  } else if (provider === "mymemory") {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.search = new URLSearchParams({ q: text, langpair: `${from}|${to}` }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) { if (response.status === 429) providerBlockedUntil = Date.now() + 3600000; throw new Error(`MyMemory 翻译请求失败（${response.status}）`); }
    const result = await response.json();
    if (Number(result.responseStatus) !== 200 || result.quotaFinished) { providerBlockedUntil = Date.now() + 3600000; throw new Error("免费翻译服务额度暂不可用，可配置 Google Cloud 或 LibreTranslate"); }
    translated = result.responseData?.translatedText; name = "MyMemory";
  } else throw new Error("未知翻译服务配置");
  if (typeof translated !== "string") throw new Error("翻译服务响应格式无效");
  return { text: validateTranslation(translated, target), provider: name };
};

function titleFromSummary(summary: string, target: Locale) {
  const first = summary.split(target === "zh-CN" ? /[。！？]/ : /(?<=[.!?])\s/)[0];
  const length = target === "zh-CN" ? 45 : 100;
  return first.length > length ? first.slice(0, length - 1) + "…" : first;
}
function pump() { while (active < 2 && jobs.length) jobs.shift()!(); }
function enqueue(event: HistoryEvent, locale: Locale, translator: TranslateText) {
  const key = cacheKey(event, locale);
  if (pending.has(key) || cached(event, locale)) return;
  const failure = failures.get(key);
  if (failure && Date.now() - failure.at < 5 * 60000) return;
  if (pending.size >= 60) return;
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; }); pending.set(key, promise);
  jobs.push(() => {
    active++;
    void (async () => {
      try {
        const parts: string[] = []; let provider = "";
        for (const segment of splitTranslationText(event.summary)) { const result = await translator(segment, sourceLocale(event), locale); parts.push(result.text); provider = result.provider; }
        const summary = validateTranslation(parts.join(locale === "en" ? " " : ""), locale);
        getDb().prepare("INSERT OR REPLACE INTO event_translations(event_id,target_locale,source_hash,title,summary,provider,created_at) VALUES(?,?,?,?,?,?,?)").run(canonicalEventId(event.id), locale, sourceHash(event), titleFromSummary(summary, locale), summary, provider, new Date().toISOString());
        failures.delete(key);
      } catch (error) { failures.set(key, { at: Date.now(), message: error instanceof Error ? error.message : "翻译暂不可用" }); }
      finally { pending.delete(key); active--; resolve(); pump(); }
    })();
  });
  pump();
}

export async function localizeEvents(events: HistoryEvent[], locale: Locale, options: { waitMs?: number; enqueue?: boolean; translator?: TranslateText } = {}) {
  if (options.enqueue !== false) for (const event of events) if (sourceLocale(event) !== locale) enqueue(event, locale, options.translator || translateText);
  const waits = events.map(event => pending.get(cacheKey(event, locale))).filter((promise): promise is Promise<void> => !!promise);
  if (waits.length && (options.waitMs ?? 1000) > 0) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.all(waits), new Promise(resolve => { timer = setTimeout(resolve, options.waitMs ?? 1000); })]);
    if (timer) clearTimeout(timer);
  }
  let pendingCount = 0; let error: string | null = null;
  const localized = events.map(event => {
    const original = { originalTitle: event.title, originalSummary: event.summary };
    if (sourceLocale(event) === locale) return { ...event, ...original, title: locale === "zh-CN" ? simplified(event.title) : event.title, summary: locale === "zh-CN" ? simplified(event.summary) : event.summary, contentLocale: locale, translationStatus: "original" as const };
    const translation = cached(event, locale);
    if (translation) return { ...event, ...original, title: translation.title, summary: translation.summary, contentLocale: locale, translationStatus: "translated" as const, translatedBy: translation.provider };
    const key = cacheKey(event, locale);
    const running = pending.has(key); if (running) pendingCount++;
    error ||= failures.get(key)?.message || null;
    return { ...event, ...original, contentLocale: sourceLocale(event), translationStatus: running ? "pending" as const : "unavailable" as const };
  });
  return { events: localized, translation: { pending: pendingCount, error } };
}
export async function drainTranslations() { while (pending.size) await Promise.all([...pending.values()]); }
