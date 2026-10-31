"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Compass, Database, ExternalLink, Globe2, Layers3, LoaderCircle, MapPin, Maximize, Pause, Play, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { countries } from "@/lib/countries";
import { getMapEra } from "@/lib/map-eras";
import type { AtlasStatus, EventCategory, HistoryEvent } from "@/lib/types";

const HistoryGlobe = dynamic(() => import("./history-globe"), { ssr: false, loading: () => <div className="globe-loading"><LoaderCircle size={25} className="spin" /><span>正在构建地球</span></div> });
const categories: { id: EventCategory; name: string; color: string }[] = [
  { id: "politics", name: "政治与国际", color: "#9de4d1" },
  { id: "conflict", name: "战争与冲突", color: "#efb181" },
  { id: "science", name: "科技与探索", color: "#a3bbf5" },
  { id: "economy", name: "经济与发展", color: "#e4d29b" },
  { id: "culture", name: "文化与艺术", color: "#d2ade7" },
  { id: "society", name: "社会与变革", color: "#9acddc" },
  { id: "disaster", name: "灾难与环境", color: "#d9998c" },
];
const countryName = (code: string) => countries.find(c => c.code === code)?.name ?? code;
const monthIndex = (month: string) => (Number(month.slice(0, 4)) - 1800) * 12 + Number(month.slice(5, 7)) - 1;
const indexMonth = (index: number) => `${1800 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
const monthLabel = (month: string) => `${month.slice(0, 4)} 年 ${Number(month.slice(5, 7))} 月`;
const number = (value: number) => new Intl.NumberFormat("en-US").format(value);
function prettyDate(date: string) { const [y, m, d] = date.split("-"); return `${y} 年 ${Number(m)} 月${d ? ` ${Number(d)} 日` : ""}`; }

function Modal({ title, children, onClose, className = "" }: { title: string; children: React.ReactNode; onClose: () => void; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  return <dialog ref={dialog} className={`modal ${className}`} aria-label={title} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-inner"><button className="icon-button modal-close" onClick={onClose} aria-label="关闭"><X size={19} /></button>{children}</div></dialog>;
}

export default function HistoryAtlas({ today }: { today: string }) {
  const latestMonth = today.slice(0, 7);
  const lastIndex = monthIndex(latestMonth);
  const [month, setMonth] = useState("1969-07");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [category, setCategory] = useState<EventCategory | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [allTime, setAllTime] = useState(false);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [mapEvents, setMapEvents] = useState<HistoryEvent[]>([]);
  const [monthScope, setMonthScope] = useState<"countries" | "highlights">("countries");
  const [countryFrom, setCountryFrom] = useState("");
  const [countryTo, setCountryTo] = useState("");
  const [territory, setTerritory] = useState<{name:string;subject:string|null;year:number;countryCode:string|null}|null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState<AtlasStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<HistoryEvent | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [historicalBorders, setHistoricalBorders] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const countryRef = useRef<HTMLDivElement>(null);

  const navigateMonth = useCallback((index: number) => { setMonth(indexMonth(Math.min(lastIndex, Math.max(0, index)))); setAllTime(false); setPage(1); setTerritory(null); }, [lastIndex]);
  const selectCountry = useCallback((code: string | null) => { setSelectedCountry(code); setCountryOpen(false); setPage(1); setAllTime(!!code); setQuery(""); setCountryFrom(""); setCountryTo(""); setTerritory(null); setSearchFocused(false); }, []);
  useEffect(() => { const timer = setTimeout(() => setDebouncedQuery(query.trim()), 320); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { setPage(1); }, [month, selectedCountry, category, debouncedQuery, allTime, monthScope, countryFrom, countryTo]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const response = await fetch("/api/status", { signal: controller.signal }); if (!response.ok) throw new Error("读取数据状态失败"); const nextStatus: AtlasStatus = await response.json(); setStatus(nextStatus); timer = setTimeout(poll, nextStatus.sync.running ? 5000 : 30000); }
      catch { if (!controller.signal.aborted) timer = setTimeout(poll, 10000); }
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refreshToken]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "15" });
    if (!allTime) { params.set("month", month); if (monthScope === "countries") params.set("scope", "countries"); }
    if (allTime && selectedCountry && countryFrom) params.set("from", countryFrom);
    if (allTime && selectedCountry && countryTo) params.set("to", countryTo);
    if (selectedCountry) params.set("country", selectedCountry);
    if (category) params.set("category", category);
    if (debouncedQuery) params.set("q", debouncedQuery);
    setLoading(true); setError(null);
    fetch(`/api/events?${params}`, { signal: controller.signal }).then(async response => { if (!response.ok) throw new Error("事件暂时无法加载，请稍后重试。"); return response.json(); }).then(data => { setEvents(data.events); setTotal(data.total); setPages(data.pages || 1); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [month, selectedCountry, category, debouncedQuery, allTime, page, status?.eventCount, status?.lastSyncAt, refreshToken, monthScope, countryFrom, countryTo]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/map-events?month=${month}`, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => setMapEvents(data.events)).catch(() => { if (!controller.signal.aborted) setMapEvents([]); });
    return () => controller.abort();
  }, [month, status?.eventCount, status?.lastSyncAt, refreshToken]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => { setMonth(current => { const next = monthIndex(current) + 1; if (next > lastIndex) { setPlaying(false); return current; } return indexMonth(next); }); setAllTime(false); }, 3500);
    return () => clearInterval(timer);
  }, [playing, lastIndex]);
  useEffect(() => { const listener = (e: KeyboardEvent) => { if ((e.target as HTMLElement).matches("input,textarea,select") || !!(e.target as HTMLElement).closest("dialog")) return; if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); } if (e.key === "ArrowLeft") navigateMonth(monthIndex(month) - 1); if (e.key === "ArrowRight") navigateMonth(monthIndex(month) + 1); }; document.addEventListener("keydown", listener); return () => document.removeEventListener("keydown", listener); }, [month, navigateMonth]);
  useEffect(() => { if (!countryOpen) return; const listener = (e: PointerEvent) => { if (!countryRef.current?.contains(e.target as Node)) setCountryOpen(false); }; const key = (e: KeyboardEvent) => { if (e.key === "Escape") setCountryOpen(false); }; document.addEventListener("pointerdown", listener); document.addEventListener("keydown", key); return () => { document.removeEventListener("pointerdown", listener); document.removeEventListener("keydown", key); }; }, [countryOpen]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 4000); return () => clearTimeout(timer); }, [toast]);

  const mapEra = getMapEra(Number(month.slice(0, 4)));
  const currentCoverage = status?.coverage.find(c => c.month === month)?.count ?? 0;
  const filteredCountries = useMemo(() => countries.filter(c => `${c.name}${c.nameEn}${c.code}`.toLowerCase().includes(countryQuery.toLowerCase())), [countryQuery]);
  const decades = useMemo(() => Array.from({ length: 114 }, (_, i) => { const year = 1800 + i * 2; const count = status?.coverage.filter(c => Number(c.month.slice(0, 4)) >= year && Number(c.month.slice(0, 4)) < year + 2).reduce((sum, c) => sum + c.count, 0) ?? 0; return { year, count }; }), [status]);
  const maxCoverage = Math.max(...decades.map(d => d.count), 1);
  const totalCountries = countries.length;
  const countrySuggestions = query.trim() ? countries.filter(c => `${c.name}${c.nameEn}${c.code}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5) : [];
  const visibleMapEvents = (allTime ? events : mapEvents).filter(event => !category || event.category === category);

  async function syncNow() {
    try { const response = await fetch("/api/sync", { method: "POST" }); if (!response.ok) throw new Error("同步请求失败"); setRefreshToken(v => v + 1); setToast("已启动数据补齐，可在同步面板查看进度"); }
    catch { setToast("暂时无法启动同步，请检查服务日志"); }
  }
  async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { setToast("当前浏览器暂不支持全屏模式"); } }

  return <div className="atlas-app">
    <header className="topbar">
      <a href="/" className="brand" aria-label="纪元首页"><span className="brand-mark"><Globe2 size={25} strokeWidth={1.25} /><span /></span><span className="brand-cn">纪元<span className="brand-en">EPOCH</span></span><span className="brand-divider" /><span className="brand-subtitle">世界历史地球仪</span></a>
      <nav className="topnav" aria-label="主导航"><button className="nav-item active" onClick={() => { selectCountry(null); }}><Compass size={15} />探索历史</button><button className={`nav-item ${allTime ? "selected" : ""}`} onClick={() => { setAllTime(true); setPage(1); }}><Layers3 size={15} />事件档案</button></nav>
      <div className="header-search"><Search size={15} /><input ref={searchRef} aria-label="搜索国家或历史事件" placeholder="搜索国家、事件、关键词…" onFocus={() => setSearchFocused(true)} onBlur={() => setTimeout(() => setSearchFocused(false), 180)} value={query} onChange={e => { setQuery(e.target.value); setAllTime(!!e.target.value.trim()); }} />{query ? <button className="search-clear" aria-label="清空搜索" onClick={() => setQuery("")}><X size={14} /></button> : <kbd>/</kbd>}{searchFocused && countrySuggestions.length > 0 && <div className="global-country-results"><span>国家与地区 · 进入历史档案</span>{countrySuggestions.map(c => <button key={c.code} onMouseDown={e => e.preventDefault()} onClick={() => selectCountry(c.code)}><span className="iso-code">{c.code}</span><span>{c.name}<small>{c.nameEn}</small></span><ArrowUpRight size={13} /></button>)}</div>}</div>
      <button className="help-button" onClick={() => setInfoOpen(true)} aria-label="了解纪元"><CircleHelp size={19} /></button>
    </header>

    <main className="explorer">
      <div className="space-background" aria-hidden="true" />
      <aside className="explore-sidebar">
        <div className="eyebrow"><span className="tiny-cross">+</span> A JOURNEY THROUGH TIME</div>
        <h1>转动地球，<br />回望<span>世界。</span></h1>
        <p className="intro">两个世纪的波澜壮阔，<br />都藏在一个个改变世界的瞬间。</p>
        <div className="sidebar-rule" />
        <div className="section-label">探索范围 <span>01 — WORLD</span></div>
        <div className="country-picker" ref={countryRef}>
          <button className={`country-trigger ${selectedCountry ? "has-country" : ""}`} onClick={() => { setCountryOpen(!countryOpen); setCountryQuery(""); }} aria-expanded={countryOpen}><Globe2 size={17} /><span>{selectedCountry ? countryName(selectedCountry) : "全球视野"}</span><ChevronDown size={14} /></button>
          {countryOpen && <div className="country-popover"><div className="country-search"><Search size={14} /><input autoFocus placeholder="查找国家或地区" aria-label="查找国家或地区" value={countryQuery} onChange={e => setCountryQuery(e.target.value)} /></div><div className="country-options"><button onClick={() => selectCountry(null)}><Globe2 size={14} />全部国家与地区{!selectedCountry && <Check size={13} />}</button>{filteredCountries.map(c => <button key={c.code} onClick={() => selectCountry(c.code)}><span className="iso-code">{c.code}</span>{c.name}{selectedCountry === c.code && <Check size={13} />}</button>)}{!filteredCountries.length && <p className="no-country">没有匹配的国家或地区</p>}</div></div>}
        </div>
        <div className="quick-countries">{["CN", "US", "GB", "FR", "RU", "JP"].map(code => <button key={code} className={selectedCountry === code ? "active" : ""} onClick={() => selectCountry(selectedCountry === code ? null : code)}>{countryName(code)}</button>)}</div>
        <div className="section-label category-label">历史切面 <span>02 — TOPICS</span></div>
        <div className="category-list"><button className={!category ? "active" : ""} onClick={() => setCategory(null)}><span className="category-dot all-dot" />全部事件<span className="category-check">{!category ? "●" : ""}</span></button>{categories.map(c => <button key={c.id} className={category === c.id ? "active" : ""} onClick={() => setCategory(category === c.id ? null : c.id)}><span className="category-dot" style={{ background: c.color }} />{c.name}<span className="category-check">{category === c.id ? "●" : ""}</span></button>)}</div>
        <div className="archive-stats"><span className="stat-number">{status ? number(status.candidateCount ?? status.eventCount) : "—"}<span>条历史记录</span></span><div><span>始于 <b>1800</b></span><span>探索 <b>{totalCountries}</b> 个地区</span></div></div>
        <button className="data-indicator" onClick={() => setSyncOpen(true)}><span className={`status-dot ${status?.sync.running ? "pulsing" : ""}`} /><span>{status?.sync.running ? `正在补齐历史 · ${status.sync.processed}/${status.sync.total}` : status?.sync.error ? "同步待重试 · 查看状态" : "本地历史数据库"}</span><ArrowUpRight size={12} /></button>
      </aside>

      <section className="globe-section" aria-label="交互式世界地球仪">
        <div className="globe-heading"><span className="eyebrow">{selectedCountry ? `${selectedCountry} / ${countryName(selectedCountry)}` : `EARTH / ${monthLabel(month)}`}</span><div className="map-era-control"><button className={historicalBorders ? "active" : ""} onClick={() => { setHistoricalBorders(true); setTerritory(null); }}>历史疆界</button><button className={!historicalBorders ? "active" : ""} onClick={() => { setHistoricalBorders(false); setTerritory(null); }}>当代地图</button></div></div>
        <div className="year-watermark" aria-hidden="true">{month.slice(0, 4)}<span>{month.slice(5, 7)}</span></div>
        <div className="globe-canvas"><HistoryGlobe events={visibleMapEvents} selectedCountry={selectedCountry} onCountrySelect={selectCountry} onEventSelect={setActiveEvent} onTerritorySelect={value => { setTerritory(value); if (!value.countryCode) { setSelectedCountry(null); setQuery(({USSR:"Soviet", "Ottoman Empire":"Ottoman", "Austro-Hungarian Empire":"Austria", "Austrian Empire":"Austria", "Kingdom of Prussia":"Prussia"} as Record<string,string>)[value.name] || value.name); setAllTime(true); setPage(1); } }} activeEventId={activeEvent?.id ?? null} mapYear={Number(month.slice(0, 4))} historicalBorders={historicalBorders} autoRotate={autoRotate} resetToken={resetToken} /></div>
        <div className="globe-orbit-label"><span className="orbit-label-line" />{historicalBorders ? `${mapEra.year} 年疆界重建快照` : "当代地理边界"}</div>
        <div className="map-event-legend"><span className="map-legend-dot" />{allTime ? "历史事件" : `${monthLabel(month)} · 各国要闻`}<span>{visibleMapEvents.length} 个标记</span></div>{territory && <div className="territory-card"><button className="territory-close" onClick={() => setTerritory(null)} aria-label="关闭版图信息"><X size={12} /></button><span className="eyebrow">TERRITORY / 版图档案</span><h3>{territory.name}</h3>{territory.subject && <p>所属 / {territory.subject}</p>}<p>{territory.year} 年重建快照 · {territory.countryCode ? `事件按${countryName(territory.countryCode)}归类` : "历史政体 · 按名称搜索事件"}</p><a href={historicalBorders ? mapEra.source : "https://www.naturalearthdata.com/"} target="_blank" rel="noreferrer">查看地图来源 <ExternalLink size={10} /></a></div>}<div className="globe-controls"><button className={autoRotate ? "active" : ""} onClick={() => setAutoRotate(!autoRotate)} title={autoRotate ? "暂停自转" : "自动旋转"} aria-label={autoRotate ? "暂停自转" : "自动旋转"}><RotateCcw size={16} /></button><button onClick={() => { setResetToken(v => v + 1); selectCountry(null); }} title="重置地球视角" aria-label="重置地球视角"><Compass size={16} /></button><span /><button onClick={fullscreen} title="全屏" aria-label="全屏"><Maximize size={15} /></button></div>
        <div className="globe-hint"><span className="mouse-icon" /><span>拖动旋转</span><span className="hint-dot">·</span><span>滚动缩放</span><span className="hint-dot">·</span><span>点击国家探索</span></div>
        {selectedCountry && <button className="selected-country-pill" onClick={() => selectCountry(null)}><MapPin size={13} />{countryName(selectedCountry)}<X size={12} /></button>}
      </section>

      <section className="event-panel" aria-label="历史事件列表">{loading && <div className="fetch-progress" role="status" aria-label="正在加载历史事件"><span /></div>}
        <div className="panel-overline"><span className="small-square" /> {allTime ? "THE HISTORICAL ARCHIVE" : "MOMENTS THAT MATTER"}<span className="live-label">ARCHIVE</span></div>
        <div className="event-heading" key={`${selectedCountry ?? "world"}-${allTime}-${month}`}><div><p>{selectedCountry ? `${countryName(selectedCountry)} / ${allTime ? "跨越时间" : monthLabel(month)}` : allTime ? "跨越时间，寻找答案" : monthLabel(month)}</p><h2>{query ? "历史搜索" : selectedCountry ? "国家历史变迁" : allTime ? "事件档案" : "世界此刻，正在发生"}<span className="heading-dot">.</span></h2></div><span className="event-count">{String(total).padStart(2, "0")}<span>{allTime ? "RESULTS" : "EVENTS"}</span></span></div>
        {selectedCountry && allTime && <div className="country-date-range"><label>从<input type="month" min="1800-01" max={countryTo || latestMonth} value={countryFrom} onInput={e => setCountryFrom(e.currentTarget.value)} onChange={e => setCountryFrom(e.target.value)} aria-label="国家历史起始月份" /></label><span>—</span><label>至<input type="month" min={countryFrom || "1800-01"} max={latestMonth} value={countryTo} onInput={e => setCountryTo(e.currentTarget.value)} onChange={e => setCountryTo(e.target.value)} aria-label="国家历史结束月份" /></label>{(countryFrom || countryTo) && <button aria-label="重置时间范围" onClick={() => { setCountryFrom(""); setCountryTo(""); }}><X size={12} /></button>}</div>}
        {!selectedCountry && !allTime && !query && <div className="monthly-scope"><button className={monthScope === "countries" ? "active" : ""} onClick={() => setMonthScope("countries")}>各国要闻</button><button className={monthScope === "highlights" ? "active" : ""} onClick={() => setMonthScope("highlights")}>全球精选</button><span>点击地球上的国家查看历史</span></div>}
        <div className="event-scope"><span>{selectedCountry ? countryName(selectedCountry) : "全球"}{category ? ` / ${categories.find(c => c.id === category)?.name}` : " / 所有主题"}</span><button onClick={() => { setAllTime(!allTime); setPage(1); }}><SlidersHorizontal size={12} />{allTime ? "按月浏览" : "全部时间"}</button></div>
        <div className={`event-list ${loading ? "is-loading" : ""}`} aria-live="polite" aria-busy={loading}>
          {loading && !events.length ? <div className="events-skeleton" role="status" aria-label="正在翻阅历史档案">{[0,1,2,3].map(i => <div className="skeleton-card" key={i}><span /><b /><p /><p /></div>)}</div> : error ? <div className="event-empty"><Database size={24} /><p>{error}</p><button onClick={() => setRefreshToken(v => v + 1)}>重新加载 <ArrowRight size={13} /></button></div> : !events.length ? <div className="event-empty"><Search size={28} strokeWidth={1} /><h3>这一页，等待被发现</h3><p>{query ? "换一个关键词，或试着使用来源中的英文名称。" : selectedCountry || category ? "这个时间范围暂未找到匹配记录，可清除主题筛选或查看全部时间。" : "该月暂未收录事件。可以尝试相邻月份，或从全部时间中寻找。"}</p><button onClick={() => { setAllTime(true); setCategory(null); if (query) setQuery(""); }}>探索全部时间 <ArrowRight size={13} /></button></div> : events.map((event, i) => { const cat = categories.find(c => c.id === event.category) ?? categories[0]; return <button style={{ animationDelay: `${Math.min(i, 5) * 35}ms` }} className={`event-card ${activeEvent?.id === event.id ? "selected" : ""}`} key={event.id} onClick={() => setActiveEvent(event)}><span className="event-index">{String((page - 1) * 15 + i + 1).padStart(2, "0")}</span><div className="event-body"><div className="event-meta"><span style={{ color: cat.color }}>{cat.name}</span><span>{allTime ? event.date.replaceAll("-", ".") : event.date.slice(5).replace("-", ".")}</span></div><h3>{event.title}</h3><p>{event.summary}</p><div className="event-footer"><span><MapPin size={10} />{event.countryCodes.length ? event.countryCodes.slice(0, 2).map(countryName).join(" · ") : "全球 / 地区待核实"}</span><ArrowUpRight size={14} /></div></div></button>; })}
        </div>
        {pages > 1 && <div className="pagination"><button disabled={page === 1} aria-label="上一页" onClick={() => setPage(v => v - 1)}><ChevronLeft size={14} /></button><span>{page} / {pages}</span><button disabled={page >= pages} aria-label="下一页" onClick={() => setPage(v => v + 1)}><ChevronRight size={14} /></button></div>}
        <div className="panel-footnote"><span className="footnote-line" />{allTime ? "循着线索，与历史相遇" : `按月精选 · ${currentCoverage === 0 ? "本月暂缺记录" : "数量随史料与重要事件变化"}`}<button onClick={() => setInfoOpen(true)} aria-label="了解精选规则"><CircleHelp size={12} /></button></div>
      </section>
    </main>

    <footer className="timeline">
      <div className="timeline-top"><div className="timeline-title"><span className="eyebrow">TIME EXPLORER</span><span>历史时间轴</span></div><div className="date-navigation"><button className="icon-button" disabled={monthIndex(month) <= 0} aria-label="上个月" onClick={() => navigateMonth(monthIndex(month) - 1)}><ChevronLeft size={16} /></button><label className="month-input"><input type="month" min="1800-01" max={latestMonth} value={month} aria-label="选择历史月份" onInput={e => { if (/^\d{4}-\d{2}$/.test(e.currentTarget.value)) navigateMonth(monthIndex(e.currentTarget.value)); }} onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) navigateMonth(monthIndex(e.target.value)); }} /><ChevronDown size={12} /></label><button className="icon-button" disabled={monthIndex(month) >= lastIndex} aria-label="下个月" onClick={() => navigateMonth(monthIndex(month) + 1)}><ChevronRight size={16} /></button></div><button className="today-button" onClick={() => navigateMonth(lastIndex)}>回到当下 <ArrowUpRight size={12} /></button></div>
      <div className="timeline-track-row"><button className={`play-button ${playing ? "playing" : ""}`} onClick={() => setPlaying(!playing)} aria-label={playing ? "暂停时间播放" : "播放历史时间轴"}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button><div className="timeline-track"><div className="timeline-histogram" aria-hidden="true">{decades.map(d => <span key={d.year} style={{ height: `${8 + (d.count / maxCoverage) * 22}px` }} className={d.year <= Number(month.slice(0, 4)) ? "past" : ""} />)}</div><div className="timeline-progress" style={{ width: `${monthIndex(month) / lastIndex * 100}%` }} /><input type="range" min={0} max={lastIndex} value={monthIndex(month)} onChange={e => navigateMonth(Number(e.target.value))} aria-label="历史月份时间轴" aria-valuetext={monthLabel(month)} /><div className="timeline-ticks">{[1800, 1850, 1900, 1950, 2000, Number(today.slice(0, 4))].map(year => <button key={year} style={{ left: `${Math.min((year - 1800) * 12 / lastIndex * 100, 100)}%` }} onClick={() => navigateMonth(Math.min((year - 1800) * 12, lastIndex))}>{year}</button>)}</div></div></div>
      <div className="timeline-bottom"><span>过去并未远去，它构成了我们所处的世界。</span><span>1800.01 <ArrowRight size={11} /> {latestMonth.replace("-", ".")}<span className="footer-dot" /> {historicalBorders ? `${mapEra.year} 年边界快照 · 非逐月精确疆界` : "当代地理边界"}</span></div>
    </footer>

    {activeEvent && <Modal title={activeEvent.title} onClose={() => setActiveEvent(null)} className="event-modal">{activeEvent.imageUrl && <div className="detail-image"><img src={activeEvent.imageUrl} alt={activeEvent.title} loading="lazy" /><span>历史资料照片 · 已压缩为 WebP</span></div>}<div className="detail-content"><span className="eyebrow">A MOMENT IN HISTORY</span><div className="detail-meta"><span>{prettyDate(activeEvent.date)}</span><span>{categories.find(c => c.id === activeEvent.category)?.name}</span></div><h2>{activeEvent.title}</h2><p className="detail-summary">{activeEvent.summary}</p>{activeEvent.imageCredit && <details className="image-attribution"><summary>图片来源与授权</summary><p>{activeEvent.imageCredit}</p>{activeEvent.imageCredit.match(/https:\/\/commons\.wikimedia\.org\/wiki\/File:[^\s]+/)?.[0] && <a href={activeEvent.imageCredit.match(/https:\/\/commons\.wikimedia\.org\/wiki\/File:[^\s]+/)![0]} target="_blank" rel="noreferrer">原始文件与作者信息 <ExternalLink size={11} /></a>}</details>}<div className="detail-countries">{activeEvent.countryCodes.map(code => <button key={code} onClick={() => { selectCountry(code); setAllTime(true); setActiveEvent(null); }}><MapPin size={12} />{countryName(code)}<ArrowUpRight size={11} /></button>)}</div><div className="source-block"><span>史料出处</span><a href={activeEvent.sourceUrl} target="_blank" rel="noopener noreferrer">{activeEvent.sourceTitle || "Wikipedia 历史年表"}<ExternalLink size={13} /></a><p>摘要摘录自公开年表，标题可能由摘要截取。事件国家归类与坐标按现代地理映射；历史边界以地图上标注的快照年份为准。</p></div><button className="detail-back" onClick={() => setActiveEvent(null)}><ArrowLeft size={14} />继续探索</button></div></Modal>}
    {infoOpen && <Modal title="关于纪元与数据来源" onClose={() => setInfoOpen(false)}><div className="info-content"><span className="eyebrow">ABOUT THE ATLAS</span><h2>把世界，放回时间里。</h2><p>纪元是一座从 1800 年起的本地历史档案。以月份为切片，从可追溯的公开历史年表中精选重要事件，在不断演变的地球上寻找它们留下的坐标。</p><div className="info-grid"><div><span>01 / 精选规则</span><p>“重要”没有唯一答案。程序按事件主题、影响关键词和来源信息评分；通常精选五件，重大事件密集的月份扩展收录。它是探索入口，仍值得人工编辑校订。</p></div><div><span>02 / 真实覆盖</span><p>早期年表的部分月份少于五件，保留实际数量，不强行凑足。中文资料不足时保留英文原文。国家由地名匹配辅助识别，可能存在遗漏。</p></div><div><span>03 / 本地优先</span><p>历史事件保存在 SQLite。启动后后台检查缺失年月，并刷新当前月份；网络失败保留已有数据，下次启动继续补齐。</p></div><div><span>04 / 来源与地图</span><p>事件摘要来自 <a href="https://zh.wikipedia.org/wiki/1800%E5%B9%B4" target="_blank" rel="noreferrer">Wikipedia 年表</a>，遵循 <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>。每条事件保留原始链接。地图事件位置以国家中心作近似定位。历史地图采用 <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noreferrer">Historical Basemaps</a> 的年代快照，以最近的过去年份展示，不对中间年月的疆界作插值。社区重建数据可能存在年代及边界误差，可切换当代地图。国家筛选仍按现代地区索引。</p></div></div><div className="info-signature"><Globe2 size={18} /><span>纪元 EPOCH</span><span>理解过去，发现当下。</span></div></div></Modal>}
    {syncOpen && <Modal title="本地数据库与同步状态" onClose={() => setSyncOpen(false)}><div className="info-content"><span className="eyebrow">LOCAL KNOWLEDGE BASE</span><h2>历史，有据可循。</h2><p>数据保存在这台设备的 SQLite 数据库中。项目启动后会自动检查日期与缺失记录。</p><div className="sync-stats"><div><b>{status ? number(status.candidateCount ?? status.eventCount) : "—"}</b><span>已保存来源记录</span></div><div><b>{status ? number(status.completedMonths) : "—"}</b><span>至少五件的月份</span></div><div><b>{status ? number(status.pendingMonths) : "—"}</b><span>少于五件的月份</span></div></div><div className="sync-status-line"><span className={`status-dot ${status?.sync.running ? "pulsing" : ""}`} />{status?.sync.running ? `正在同步 ${status.sync.processed} / ${status.sync.total}` : "当前同步已停止"}</div>{status?.sync.error && <p className="sync-error">{status.sync.error}</p>}<p className="sync-note">{status?.sourceNote || "正在检查本地数据库…"}</p><p className="sync-note">目标日期：{today}（Asia/Shanghai）<br />最近同步：{status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "尚未完成首次同步"}</p><button className="primary-button" disabled={status?.sync.running} onClick={syncNow}>{status?.sync.running ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}{status?.sync.running ? "后台补齐中" : "检查并补齐数据"}<ArrowUpRight size={14} /></button></div></Modal>}
    {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
  </div>;
}
