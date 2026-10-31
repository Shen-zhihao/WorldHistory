"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Compass, Database, ExternalLink, Globe2, Layers3, LoaderCircle, MapPin, Maximize, Moon, Pause, Play, RotateCcw, Search, SlidersHorizontal, Sun, X } from "lucide-react";
import { countries } from "@/lib/countries";
import { getMapEra } from "@/lib/map-eras";
import { createTranslator, countryDisplayName, formatMonth, formatHistoryDate } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import type { Theme } from "@/lib/theme";
import type { AtlasStatus, EventCategory, HistoryEvent } from "@/lib/types";
const LocaleContext = createContext<Locale>("zh-CN");
function GlobeLoading() {
  const locale = useContext(LocaleContext);
  const t = createTranslator(locale);
  return <div className="globe-loading"><LoaderCircle size={25} className="spin" /><span>{t("正在构建地球")}</span></div>;
}
const HistoryGlobe = dynamic(() => import("./history-globe"), {
  ssr: false,
  loading: () => <GlobeLoading />
});
const categories: {
  id: EventCategory;
  name: string;
  color: string;
}[] = [{
  id: "politics",
  name: "政治与国际",
  color: "var(--category-politics)"
}, {
  id: "conflict",
  name: "战争与冲突",
  color: "var(--category-conflict)"
}, {
  id: "science",
  name: "科技与探索",
  color: "var(--category-science)"
}, {
  id: "economy",
  name: "经济与发展",
  color: "var(--category-economy)"
}, {
  id: "culture",
  name: "文化与艺术",
  color: "var(--category-culture)"
}, {
  id: "society",
  name: "社会与变革",
  color: "var(--category-society)"
}, {
  id: "disaster",
  name: "灾难与环境",
  color: "var(--category-disaster)"
}];
const monthIndex = (month: string) => (Number(month.slice(0, 4)) - 1800) * 12 + Number(month.slice(5, 7)) - 1;
const indexMonth = (index: number) => `${1800 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
function Modal({
  title,
  children,
  onClose,
  className = ""
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const t = createTranslator(useContext(LocaleContext));
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return <dialog ref={dialog} className={`modal ${className}`} aria-label={title} onCancel={onClose} onClick={e => {
    if (e.target === e.currentTarget) onClose();
  }}><div className="modal-inner"><button className="icon-button modal-close" onClick={onClose} aria-label={t("关闭")}><X size={19} /></button>{children}</div></dialog>;
}
export default function HistoryAtlas({
  today,
  initialLocale = "zh-CN",
  initialTheme = "light"
}: {
  today: string;
  initialLocale?: Locale;
  initialTheme?: Theme;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [localeReady, setLocaleReady] = useState(false);
  const t = createTranslator(locale);
  const countryName = (code: string) => countryDisplayName(code, locale);
  const monthLabel = (value: string) => formatMonth(value, locale);
  const prettyDate = (value: string) => formatHistoryDate(value, locale);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    document.cookie = `epoch-theme=${nextTheme};path=/;max-age=31536000;SameSite=Lax`;
    setTheme(nextTheme);
  };
  useEffect(() => {
    try {
      const cookie = document.cookie.match(/(?:^|;\s*)epoch-locale=(zh-CN|en)(?:;|$)/)?.[1];
      const saved = cookie || localStorage.getItem("epoch-locale");
      if (saved === "zh-CN" || saved === "en") setLocale(saved);
    } catch {}
    setLocaleReady(true);
  }, []);
  useEffect(() => {
    if (!localeReady) return;
    document.documentElement.lang = locale;
    document.title = locale === "en" ? "EPOCH · World History Atlas" : "纪元 EPOCH · 世界历史地球仪";
    document.cookie = `epoch-locale=${locale};path=/;max-age=31536000;SameSite=Lax`;
    try {
      localStorage.setItem("epoch-locale", locale);
    } catch {}
  }, [locale, localeReady]);
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
  const [translationRefresh, setTranslationRefresh] = useState(0);
  const [eventTranslationPending, setEventTranslationPending] = useState(0);
  const [mapTranslationPending, setMapTranslationPending] = useState(0);
  const [detailTranslationPending, setDetailTranslationPending] = useState(0);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [monthScope, setMonthScope] = useState<"countries" | "highlights">("countries");
  const [countryFrom, setCountryFrom] = useState("");
  const [countryTo, setCountryTo] = useState("");
  const [territory, setTerritory] = useState<{
    name: string;
    subject: string | null;
    year: number;
    countryCode: string | null;
  } | null>(null);
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
  const lastEventRequestKey = useRef("");
  const navigateMonth = useCallback((index: number) => {
    setMonth(indexMonth(Math.min(lastIndex, Math.max(0, index))));
    setAllTime(false);
    setPage(1);
    setTerritory(null);
  }, [lastIndex]);
  const selectCountry = useCallback((code: string | null) => {
    setSelectedCountry(code);
    setCountryOpen(false);
    setPage(1);
    setAllTime(!!code);
    setQuery("");
    setCountryFrom("");
    setCountryTo("");
    setTerritory(null);
    setSearchFocused(false);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 320);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setPage(1);
  }, [month, selectedCountry, category, debouncedQuery, allTime, monthScope, countryFrom, countryTo]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/status", {
          signal: controller.signal
        });
        if (!response.ok) throw new Error(t("读取数据状态失败"));
        const nextStatus: AtlasStatus = await response.json();
        setStatus(nextStatus);
        timer = setTimeout(poll, nextStatus.sync.running ? 5000 : 30000);
      } catch {
        if (!controller.signal.aborted) timer = setTimeout(poll, 10000);
      }
    }
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [refreshToken]);
  useEffect(() => {
    const controller = new AbortController();
    if (!localeReady) return;
    const params = new URLSearchParams({
      page: String(page),
      limit: "15",
      locale
    });
    if (!allTime) {
      params.set("month", month);
      if (monthScope === "countries") params.set("scope", "countries");
    }
    if (allTime && selectedCountry && countryFrom) params.set("from", countryFrom);
    if (allTime && selectedCountry && countryTo) params.set("to", countryTo);
    if (selectedCountry) params.set("country", selectedCountry);
    if (category) params.set("category", category);
    if (debouncedQuery) params.set("q", debouncedQuery);
    const requestKey = params.toString();
    if (lastEventRequestKey.current !== requestKey) setLoading(true);
    lastEventRequestKey.current = requestKey;
    setError(null);
    fetch(`/api/events?${params}`, {
      signal: controller.signal
    }).then(async response => {
      if (!response.ok) throw new Error(t("事件暂时无法加载，请稍后重试。"));
      return response.json();
    }).then(data => {
      setEvents(data.events);
      setEventTranslationPending(data.translation?.pending ?? 0);
      setTranslationError(data.translation?.error ?? null);
      setActiveEvent(current => current ? data.events.find((event: HistoryEvent) => event.id === current.id) ?? current : null);
      setTotal(data.total);
      setPages(data.pages || 1);
    }).catch(e => {
      if (!controller.signal.aborted) setError(e.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [month, selectedCountry, category, debouncedQuery, allTime, page, status?.eventCount, status?.lastSyncAt, refreshToken, monthScope, countryFrom, countryTo, locale, localeReady, translationRefresh]);
  useEffect(() => {
    const controller = new AbortController();
    if (!localeReady) return;
    fetch(`/api/map-events?month=${month}&locale=${locale}`, {
      signal: controller.signal
    }).then(r => {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(data => {
      setMapEvents(data.events);
      setMapTranslationPending(data.translation?.pending ?? 0);
      setActiveEvent(current => current ? data.events.find((event: HistoryEvent) => event.id === current.id) ?? current : null);
    }).catch(() => {
      if (!controller.signal.aborted) {
        setMapEvents([]);
        setMapTranslationPending(0);
      }
    });
    return () => controller.abort();
  }, [month, status?.eventCount, status?.lastSyncAt, refreshToken, locale, localeReady, translationRefresh]);
  useEffect(() => {
    if (!activeEvent?.id || !localeReady) { setDetailTranslationPending(0); return; }
    const controller = new AbortController();
    const id = activeEvent.id;
    fetch(`/api/events/${encodeURIComponent(id)}?locale=${locale}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(data => {
      if (data.event) setActiveEvent(current => current?.id === id ? { ...data.event, id } : current);
      setDetailTranslationPending(data.translation?.pending ?? 0);
    }).catch(() => { if (!controller.signal.aborted) setDetailTranslationPending(0); });
    return () => controller.abort();
  }, [activeEvent?.id, locale, localeReady, translationRefresh]);
  useEffect(() => {
    if (!eventTranslationPending && !mapTranslationPending && !detailTranslationPending) return;
    const timer = setTimeout(() => setTranslationRefresh(value => value + 1), 3000);
    return () => clearTimeout(timer);
  }, [eventTranslationPending, mapTranslationPending, detailTranslationPending, translationRefresh, locale, month, selectedCountry, category, debouncedQuery, allTime, page, monthScope, countryFrom, countryTo]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setMonth(current => {
        const next = monthIndex(current) + 1;
        if (next > lastIndex) {
          setPlaying(false);
          return current;
        }
        return indexMonth(next);
      });
      setAllTime(false);
    }, 3500);
    return () => clearInterval(timer);
  }, [playing, lastIndex]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select") || !!(e.target as HTMLElement).closest("dialog")) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "ArrowLeft") navigateMonth(monthIndex(month) - 1);
      if (e.key === "ArrowRight") navigateMonth(monthIndex(month) + 1);
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [month, navigateMonth]);
  useEffect(() => {
    if (!countryOpen) return;
    const listener = (e: PointerEvent) => {
      if (!countryRef.current?.contains(e.target as Node)) setCountryOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCountryOpen(false);
    };
    document.addEventListener("pointerdown", listener);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", listener);
      document.removeEventListener("keydown", key);
    };
  }, [countryOpen]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  const mapEra = getMapEra(Number(month.slice(0, 4)));
  const currentCoverage = status?.coverage.find(c => c.month === month)?.count ?? 0;
  const filteredCountries = useMemo(() => countries.filter(c => `${c.name}${c.nameEn}${c.code}`.toLowerCase().includes(countryQuery.toLowerCase())), [countryQuery]);
  const decades = useMemo(() => Array.from({
    length: 114
  }, (_, i) => {
    const year = 1800 + i * 2;
    const count = status?.coverage.filter(c => Number(c.month.slice(0, 4)) >= year && Number(c.month.slice(0, 4)) < year + 2).reduce((sum, c) => sum + c.count, 0) ?? 0;
    return {
      year,
      count
    };
  }), [status]);
  const maxCoverage = Math.max(...decades.map(d => d.count), 1);
  const totalCountries = countries.length;
  const countrySuggestions = query.trim() ? countries.filter(c => `${c.name}${c.nameEn}${c.code}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5) : [];
  const visibleMapEvents = (allTime ? events : mapEvents).filter(event => !category || event.category === category);
  async function syncNow() {
    try {
      const response = await fetch("/api/sync", {
        method: "POST"
      });
      if (!response.ok) throw new Error(t("同步请求失败"));
      setRefreshToken(v => v + 1);
      setToast(t("已启动数据补齐，可在同步面板查看进度"));
    } catch {
      setToast(t("暂时无法启动同步，请检查服务日志"));
    }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();else await document.documentElement.requestFullscreen();
    } catch {
      setToast(t("当前浏览器暂不支持全屏模式"));
    }
  }
  return <LocaleContext.Provider value={locale}><div className="atlas-app" data-locale={locale}>
    <header className="topbar">
      <a href="/" className="brand" aria-label={t("纪元首页")}><span className="brand-mark"><Globe2 size={25} strokeWidth={1.25} /><span /></span><span className="brand-cn">{t("纪元")}<span className="brand-en">EPOCH</span></span><span className="brand-divider" /><span className="brand-subtitle">{t("世界历史地球仪")}</span></a>
      <nav className="topnav" aria-label={t("主导航")}><button className="nav-item active" onClick={() => {
            selectCountry(null);
          }}><Compass size={15} />{t("探索历史")}</button><button className={`nav-item ${allTime ? "selected" : ""}`} onClick={() => {
            setAllTime(true);
            setPage(1);
          }}><Layers3 size={15} />{t("事件档案")}</button></nav>
      <div className="header-search"><Search size={15} /><input ref={searchRef} aria-label={t("搜索国家或历史事件")} placeholder={t("搜索国家、事件、关键词…")} onFocus={() => setSearchFocused(true)} onBlur={() => setTimeout(() => setSearchFocused(false), 180)} value={query} onChange={e => {
            setQuery(e.target.value);
            setAllTime(!!e.target.value.trim());
          }} />{query ? <button className="search-clear" aria-label={t("清空搜索")} onClick={() => setQuery("")}><X size={14} /></button> : <kbd>/</kbd>}{searchFocused && countrySuggestions.length > 0 && <div className="global-country-results"><span>{t("国家与地区 · 进入历史档案")}</span>{countrySuggestions.map(c => <button key={c.code} onMouseDown={e => e.preventDefault()} onClick={() => selectCountry(c.code)}><span className="iso-code">{c.code}</span><span>{countryName(c.code)}<small>{locale === "en" ? c.name : c.nameEn}</small></span><ArrowUpRight size={13} /></button>)}</div>}</div>
      <label className="locale-switcher"><span className="sr-only">界面语言 / Language</span><select aria-label="界面语言 / Language" value={locale} onChange={event => {
            setLocale(event.target.value as Locale);
            setTranslationError(null);
          }}><option value="zh-CN">简体中文</option><option value="en">English</option></select><ChevronDown size={11} /></label>
      <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={theme === "light" ? t("切换到黑夜主题") : t("切换到白天主题")} title={theme === "light" ? t("切换到黑夜主题") : t("切换到白天主题")} aria-pressed={theme === "dark"}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button>
      <button className="help-button" onClick={() => setInfoOpen(true)} aria-label={t("了解纪元")}><CircleHelp size={19} /></button>
    </header>

    <main className="explorer">
      <div className="space-background" aria-hidden="true" />
      <aside className="explore-sidebar">
        <div className="eyebrow"><span className="tiny-cross">+</span> A JOURNEY THROUGH TIME</div>
        <h1>{t("转动地球，")}<br />{t("回望")}<span>{t("世界。")}</span></h1>
        <p className="intro">{t("两个世纪的波澜壮阔，")}<br />{t("都藏在一个个改变世界的瞬间。")}</p>
        <div className="sidebar-rule" />
        <div className="section-label">{t("探索范围 ")}<span>01 — WORLD</span></div>
        <div className="country-picker" ref={countryRef}>
          <button className={`country-trigger ${selectedCountry ? "has-country" : ""}`} onClick={() => {
              setCountryOpen(!countryOpen);
              setCountryQuery("");
            }} aria-expanded={countryOpen}><Globe2 size={17} /><span>{selectedCountry ? countryName(selectedCountry) : t("全球视野")}</span><ChevronDown size={14} /></button>
          {countryOpen && <div className="country-popover"><div className="country-search"><Search size={14} /><input autoFocus placeholder={t("查找国家或地区")} aria-label={t("查找国家或地区")} value={countryQuery} onChange={e => setCountryQuery(e.target.value)} /></div><div className="country-options"><button onClick={() => selectCountry(null)}><Globe2 size={14} />{t("全部国家与地区")}{!selectedCountry && <Check size={13} />}</button>{filteredCountries.map(c => <button key={c.code} onClick={() => selectCountry(c.code)}><span className="iso-code">{c.code}</span>{countryName(c.code)}{selectedCountry === c.code && <Check size={13} />}</button>)}{!filteredCountries.length && <p className="no-country">{t("没有匹配的国家或地区")}</p>}</div></div>}
        </div>
        <div className="quick-countries">{["CN", "US", "GB", "FR", "RU", "JP"].map(code => <button key={code} className={selectedCountry === code ? "active" : ""} onClick={() => selectCountry(selectedCountry === code ? null : code)}>{countryName(code)}</button>)}</div>
        <div className="section-label category-label">{t("历史切面 ")}<span>02 — TOPICS</span></div>
        <div className="category-list"><button className={!category ? "active" : ""} onClick={() => setCategory(null)}><span className="category-dot all-dot" />{t("全部事件")}<span className="category-check">{!category ? "●" : ""}</span></button>{categories.map(c => <button key={c.id} className={category === c.id ? "active" : ""} onClick={() => setCategory(category === c.id ? null : c.id)}><span className="category-dot" style={{
                background: c.color
              }} />{t(c.name)}<span className="category-check">{category === c.id ? "●" : ""}</span></button>)}</div>
        <div className="archive-stats"><span className="stat-number">{status ? number(status.candidateCount ?? status.eventCount) : "—"}<span>{t("条历史记录")}</span></span><div><span>{t("始于 ")}<b>1800</b></span><span>{t("探索 ")}<b>{totalCountries}</b>{t(" 个地区")}</span></div></div>
        <button className="data-indicator" onClick={() => setSyncOpen(true)}><span className={`status-dot ${status?.sync.running ? "pulsing" : ""}`} /><span>{status?.sync.running ? `${t("正在补齐历史")} · ${status.sync.processed}/${status.sync.total}` : status?.sync.error ? t("同步待重试 · 查看状态") : t("本地历史数据库")}</span><ArrowUpRight size={12} /></button>
      </aside>

      <section className="globe-section" aria-label={t("交互式世界地球仪")}>
        <div className="globe-heading"><span className="eyebrow">{selectedCountry ? `${selectedCountry} / ${countryName(selectedCountry)}` : `EARTH / ${monthLabel(month)}`}</span><div className="map-era-control"><button className={historicalBorders ? "active" : ""} onClick={() => {
                setHistoricalBorders(true);
                setTerritory(null);
              }}>{t("历史疆界")}</button><button className={!historicalBorders ? "active" : ""} onClick={() => {
                setHistoricalBorders(false);
                setTerritory(null);
              }}>{t("当代地图")}</button></div></div>
        <div className="year-watermark" aria-hidden="true">{month.slice(0, 4)}<span>{month.slice(5, 7)}</span></div>
        <div className="globe-canvas"><HistoryGlobe events={visibleMapEvents} selectedCountry={selectedCountry} selectedTerritory={territory?.name ?? null} onCountrySelect={selectCountry} locale={locale} theme={theme} onEventSelect={setActiveEvent} onTerritorySelect={value => {
              setTerritory(value);
              if (!value.countryCode) {
                setSelectedCountry(null);
                setQuery(({
                  USSR: "Soviet",
                  "Ottoman Empire": "Ottoman",
                  "Austro-Hungarian Empire": "Austria",
                  "Austrian Empire": "Austria",
                  "Kingdom of Prussia": "Prussia"
                } as Record<string, string>)[value.name] || value.name);
                setAllTime(true);
                setPage(1);
              }
            }} activeEventId={activeEvent?.id ?? null} mapYear={Number(month.slice(0, 4))} historicalBorders={historicalBorders} autoRotate={autoRotate} resetToken={resetToken} /></div>
        <div className="globe-orbit-label"><span className="orbit-label-line" />{historicalBorders ? `${mapEra.year} ${t("年疆界重建快照")}` : t("当代地理边界")}</div>
        <div className="map-event-legend"><span className="map-legend-dot" />{allTime ? t("历史事件") : `${monthLabel(month)} · ${t("各国要闻")}`}<span>{visibleMapEvents.length}{t(" 个标记")}</span></div>{territory && <div className="territory-card"><button className="territory-close" onClick={() => setTerritory(null)} aria-label={t("关闭版图信息")}><X size={12} /></button><span className="eyebrow">{t("TERRITORY / 版图档案")}</span><h3>{territory.name}</h3>{territory.subject && <p>{t("所属 / ")}{territory.subject}</p>}<p>{territory.year}{t(" 年重建快照 · ")}{territory.countryCode ? countryName(territory.countryCode) : t("历史政体 · 按名称搜索事件")}</p><a href={historicalBorders ? mapEra.source : "https://www.naturalearthdata.com/"} target="_blank" rel="noreferrer">{t("查看地图来源 ")}<ExternalLink size={10} /></a></div>}<div className="globe-controls"><button className={autoRotate ? "active" : ""} onClick={() => setAutoRotate(!autoRotate)} title={autoRotate ? t("暂停自转") : t("自动旋转")} aria-label={autoRotate ? t("暂停自转") : t("自动旋转")}><RotateCcw size={16} /></button><button onClick={() => {
              setResetToken(v => v + 1);
              selectCountry(null);
            }} title={t("重置地球视角")} aria-label={t("重置地球视角")}><Compass size={16} /></button><span /><button onClick={fullscreen} title={t("全屏")} aria-label={t("全屏")}><Maximize size={15} /></button></div>
        <div className="globe-hint"><span className="mouse-icon" /><span>{t("拖动旋转")}</span><span className="hint-dot">·</span><span>{t("滚动缩放")}</span><span className="hint-dot">·</span><span>{t("点击国家探索")}</span></div>
        {selectedCountry && <button className="selected-country-pill" onClick={() => selectCountry(null)}><MapPin size={13} />{countryName(selectedCountry)}<X size={12} /></button>}
      </section>

      <section className="event-panel" aria-label={t("历史事件列表")}>{loading && <div className="fetch-progress" role="status" aria-label={t("正在加载历史事件")}><span /></div>}
        <div className="panel-overline"><span className="small-square" /> {allTime ? "THE HISTORICAL ARCHIVE" : "MOMENTS THAT MATTER"}<span className="live-label">ARCHIVE</span></div>
        <div className="event-heading" key={`${selectedCountry ?? "world"}-${allTime}-${month}`}><div><p>{selectedCountry ? `${countryName(selectedCountry)} / ${allTime ? t("跨越时间") : monthLabel(month)}` : allTime ? t("跨越时间，寻找答案") : monthLabel(month)}</p><h2>{query ? t("历史搜索") : selectedCountry ? t("国家历史变迁") : allTime ? t("事件档案") : t("世界此刻，正在发生")}<span className="heading-dot">.</span></h2></div><span className="event-count">{String(total).padStart(2, "0")}<span>{allTime ? "RESULTS" : "EVENTS"}</span></span></div>
        {selectedCountry && allTime && <div className="country-date-range"><label>{t("从")}<input type="month" min="1800-01" max={countryTo || latestMonth} value={countryFrom} onInput={e => setCountryFrom(e.currentTarget.value)} onChange={e => setCountryFrom(e.target.value)} aria-label={t("国家历史起始月份")} /></label><span>—</span><label>{t("至")}<input type="month" min={countryFrom || "1800-01"} max={latestMonth} value={countryTo} onInput={e => setCountryTo(e.currentTarget.value)} onChange={e => setCountryTo(e.target.value)} aria-label={t("国家历史结束月份")} /></label>{(countryFrom || countryTo) && <button aria-label={t("重置时间范围")} onClick={() => {
              setCountryFrom("");
              setCountryTo("");
            }}><X size={12} /></button>}</div>}
        {!selectedCountry && !allTime && !query && <div className="monthly-scope"><button className={monthScope === "countries" ? "active" : ""} onClick={() => setMonthScope("countries")}>{t("各国要闻")}</button><button className={monthScope === "highlights" ? "active" : ""} onClick={() => setMonthScope("highlights")}>{t("全球精选")}</button><span>{t("点击地球上的国家查看历史")}</span></div>}
        {(eventTranslationPending > 0 || translationError) && <div className="translation-notice" role="status" title={translationError || undefined}>{eventTranslationPending > 0 ? <><LoaderCircle size={11} className="spin" />{t("翻译处理中，稍后自动更新。")}</> : <>{t("翻译暂不可用，保留来源原文。")}</>}</div>}
        <div className="event-scope"><span>{selectedCountry ? countryName(selectedCountry) : t("全球")}{category ? ` / ${t(categories.find(c => c.id === category)?.name ?? "")}` : t(" / 所有主题")}</span><button onClick={() => {
              setAllTime(!allTime);
              setPage(1);
            }}><SlidersHorizontal size={12} />{allTime ? t("按月浏览") : t("全部时间")}</button></div>
        <div className={`event-list ${loading ? "is-loading" : ""}`} aria-live="polite" aria-busy={loading}>
          {loading && !events.length ? <div className="events-skeleton" role="status" aria-label={t("正在翻阅历史档案")}>{[0, 1, 2, 3].map(i => <div className="skeleton-card" key={i}><span /><b /><p /><p /></div>)}</div> : error ? <div className="event-empty"><Database size={24} /><p>{error}</p><button onClick={() => setRefreshToken(v => v + 1)}>{t("重新加载 ")}<ArrowRight size={13} /></button></div> : !events.length ? <div className="event-empty"><Search size={28} strokeWidth={1} /><h3>{t("这一页，等待被发现")}</h3><p>{query ? t("换一个关键词，或试着使用来源中的英文名称。") : selectedCountry || category ? t("这个时间范围暂未找到匹配记录，可清除主题筛选或查看全部时间。") : t("该月暂未收录事件。可以尝试相邻月份，或从全部时间中寻找。")}</p><button onClick={() => {
                setAllTime(true);
                setCategory(null);
                if (query) setQuery("");
              }}>{t("探索全部时间 ")}<ArrowRight size={13} /></button></div> : events.map((event, i) => {
              const cat = categories.find(c => c.id === event.category) ?? categories[0];
              return <button style={{
                animationDelay: `${Math.min(i, 5) * 35}ms`
              }} className={`event-card ${activeEvent?.id === event.id ? "selected" : ""}`} key={event.id} onClick={() => setActiveEvent(event)}><span className="event-index">{String((page - 1) * 15 + i + 1).padStart(2, "0")}</span><div className="event-body"><div className="event-meta"><span style={{
                      color: cat.color
                    }}>{t(cat.name)}</span><span>{allTime ? event.date.replaceAll("-", ".") : event.date.slice(5).replace("-", ".")}</span></div><h3 lang={event.contentLocale}>{event.title}</h3><p lang={event.contentLocale}>{event.summary}</p>{event.translationStatus && event.translationStatus !== "original" && <span className={`translation-badge translation-${event.translationStatus}`}>{event.translationStatus === "translated" ? t("机器翻译") : event.translationStatus === "pending" ? t("正在翻译") : t("暂未提供译文")}</span>}<div className="event-footer"><span><MapPin size={10} />{event.countryCodes.length ? event.countryCodes.slice(0, 2).map(countryName).join(" · ") : t("全球 / 地区待核实")}</span><ArrowUpRight size={14} /></div></div></button>;
            })}
        </div>
        {pages > 1 && <div className="pagination"><button disabled={page === 1} aria-label={t("上一页")} onClick={() => setPage(v => v - 1)}><ChevronLeft size={14} /></button><span>{page} / {pages}</span><button disabled={page >= pages} aria-label={t("下一页")} onClick={() => setPage(v => v + 1)}><ChevronRight size={14} /></button></div>}
        <div className="panel-footnote"><span className="footnote-line" />{allTime ? t("循着线索，与历史相遇") : `${t("按月精选")} · ${currentCoverage === 0 ? t("本月暂缺记录") : t("数量随史料与重要事件变化")}`}<button onClick={() => setInfoOpen(true)} aria-label={t("了解精选规则")}><CircleHelp size={12} /></button></div>
      </section>
    </main>

    <footer className="timeline">
      <div className="timeline-top"><div className="timeline-title"><span className="eyebrow">TIME EXPLORER</span><span>{t("历史时间轴")}</span></div><div className="date-navigation"><button className="icon-button" disabled={monthIndex(month) <= 0} aria-label={t("上个月")} onClick={() => navigateMonth(monthIndex(month) - 1)}><ChevronLeft size={16} /></button><label className="month-input"><input type="month" min="1800-01" max={latestMonth} value={month} aria-label={t("选择历史月份")} onInput={e => {
                if (/^\d{4}-\d{2}$/.test(e.currentTarget.value)) navigateMonth(monthIndex(e.currentTarget.value));
              }} onChange={e => {
                if (/^\d{4}-\d{2}$/.test(e.target.value)) navigateMonth(monthIndex(e.target.value));
              }} /><ChevronDown size={12} /></label><button className="icon-button" disabled={monthIndex(month) >= lastIndex} aria-label={t("下个月")} onClick={() => navigateMonth(monthIndex(month) + 1)}><ChevronRight size={16} /></button></div><button className="today-button" onClick={() => navigateMonth(lastIndex)}>{t("回到当下 ")}<ArrowUpRight size={12} /></button></div>
      <div className="timeline-track-row"><button className={`play-button ${playing ? "playing" : ""}`} onClick={() => setPlaying(!playing)} aria-label={playing ? t("暂停时间播放") : t("播放历史时间轴")}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button><div className="timeline-track"><div className="timeline-histogram" aria-hidden="true">{decades.map(d => <span key={d.year} style={{
                height: `${8 + d.count / maxCoverage * 22}px`
              }} className={d.year <= Number(month.slice(0, 4)) ? "past" : ""} />)}</div><div className="timeline-progress" style={{
              width: `${monthIndex(month) / lastIndex * 100}%`
            }} /><input type="range" min={0} max={lastIndex} value={monthIndex(month)} onChange={e => navigateMonth(Number(e.target.value))} aria-label={t("历史月份时间轴")} aria-valuetext={monthLabel(month)} /><div className="timeline-ticks">{[1800, 1850, 1900, 1950, 2000, Number(today.slice(0, 4))].map(year => <button key={year} style={{
                left: `${Math.min((year - 1800) * 12 / lastIndex * 100, 100)}%`
              }} onClick={() => navigateMonth(Math.min((year - 1800) * 12, lastIndex))}>{year}</button>)}</div></div></div>
      <div className="timeline-bottom"><span>{t("过去并未远去，它构成了我们所处的世界。")}</span><span>1800.01 <ArrowRight size={11} /> {latestMonth.replace("-", ".")}<span className="footer-dot" /> {historicalBorders ? `${mapEra.year} ${t("年边界快照 · 非逐月精确疆界")}` : t("当代地理边界")}</span></div>
    </footer>

    {activeEvent && <Modal title={activeEvent.title} onClose={() => setActiveEvent(null)} className="event-modal">{activeEvent.imageUrl && <div className="detail-image"><img src={activeEvent.imageUrl} alt={activeEvent.title} loading="lazy" /><span>{t("历史资料照片 · 已压缩为 WebP")}</span></div>}<div className="detail-content"><span className="eyebrow">A MOMENT IN HISTORY</span><div className="detail-meta"><span>{prettyDate(activeEvent.date)}</span><span>{t(categories.find(c => c.id === activeEvent.category)?.name ?? "")}</span></div><h2>{activeEvent.title}</h2><p className="detail-summary" lang={activeEvent.contentLocale}>{activeEvent.summary}</p>{activeEvent.translationStatus && activeEvent.translationStatus !== "original" && <div className="detail-translation"><span className={`translation-badge translation-${activeEvent.translationStatus}`}>{activeEvent.translationStatus === "translated" ? t("机器翻译") : activeEvent.translationStatus === "pending" ? t("正在翻译") : t("暂未提供译文")}</span><p>{t("公开史料的机器译文，仅辅助阅读；史实以原始来源为准。")}</p>{activeEvent.translatedBy && <small>{t("翻译来源：")}{activeEvent.translatedBy}</small>}</div>}{(activeEvent.originalTitle || activeEvent.originalSummary) && <details className="original-text"><summary>{t("查看原文")}</summary><h3>{activeEvent.originalTitle}</h3><p>{activeEvent.originalSummary}</p></details>}{activeEvent.imageCredit && <details className="image-attribution"><summary>{t("图片来源与授权")}</summary><p>{activeEvent.imageCredit}</p>{activeEvent.imageCredit.match(/https:\/\/commons\.wikimedia\.org\/wiki\/File:[^\s]+/)?.[0] && <a href={activeEvent.imageCredit.match(/https:\/\/commons\.wikimedia\.org\/wiki\/File:[^\s]+/)![0]} target="_blank" rel="noreferrer">{t("原始文件与作者信息 ")}<ExternalLink size={11} /></a>}</details>}<div className="detail-countries">{activeEvent.countryCodes.map(code => <button key={code} onClick={() => {
              selectCountry(code);
              setAllTime(true);
              setActiveEvent(null);
            }}><MapPin size={12} />{countryName(code)}<ArrowUpRight size={11} /></button>)}</div><div className="source-block"><span>{t("史料出处")}</span><a href={activeEvent.sourceUrl} target="_blank" rel="noopener noreferrer">{activeEvent.sourceTitle || t("Wikipedia 历史年表")}<ExternalLink size={13} /></a><p>{t("摘要摘录自公开年表，标题可能由摘要截取。事件国家归类与坐标按现代地理映射；历史边界以地图上标注的快照年份为准。")}</p></div><button className="detail-back" onClick={() => setActiveEvent(null)}><ArrowLeft size={14} />{t("继续探索")}</button></div></Modal>}
    {infoOpen && <Modal title={t("关于纪元与数据来源")} onClose={() => setInfoOpen(false)}><div className="info-content"><span className="eyebrow">ABOUT THE ATLAS</span><h2>{t("把世界，放回时间里。")}</h2><p>{t("纪元是一座从 1800 年起的本地历史档案。以月份为切片，从可追溯的公开历史年表中精选重要事件，在不断演变的地球上寻找它们留下的坐标。")}</p><div className="info-grid"><div><span>{t("01 / 精选规则")}</span><p>{t("“重要”没有唯一答案。程序按事件主题、影响关键词和来源信息评分；通常精选五件，重大事件密集的月份扩展收录。它是探索入口，仍值得人工编辑校订。")}</p></div><div><span>{t("02 / 真实覆盖")}</span><p>{t("早期月份按实际史料收录，不强行凑足。支持中文与英文阅读，机器译文单独缓存并保留原文。国家归类由地名辅助识别，可能存在遗漏。")}</p></div><div><span>{t("03 / 本地优先")}</span><p>{t("历史事件保存在 SQLite。启动后后台检查缺失年月，并刷新当前月份；网络失败保留已有数据，下次启动继续补齐。")}</p></div><div><span>{t("04 / 来源与地图")}</span><p>{t("事件摘要来自 ")}<a href="https://zh.wikipedia.org/wiki/1800%E5%B9%B4" target="_blank" rel="noreferrer">{t("Wikipedia 年表")}</a>{t("，遵循 ")}<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>{t("。每条事件保留原始链接。地图事件位置以国家中心作近似定位。历史地图采用 ")}<a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noreferrer">Historical Basemaps</a>{t(" 的年代快照，以最近的过去年份展示，不对中间年月的疆界作插值。社区重建数据可能存在年代及边界误差，可切换当代地图。国家筛选仍按现代地区索引。")}</p></div></div><div className="info-signature"><Globe2 size={18} /><span>{t("纪元 EPOCH")}</span><span>{t("理解过去，发现当下。")}</span></div></div></Modal>}
    {syncOpen && <Modal title={t("本地数据库与同步状态")} onClose={() => setSyncOpen(false)}><div className="info-content"><span className="eyebrow">LOCAL KNOWLEDGE BASE</span><h2>{t("历史，有据可循。")}</h2><p>{t("数据保存在这台设备的 SQLite 数据库中。项目启动后会自动检查日期与缺失记录。")}</p><div className="sync-stats"><div><b>{status ? number(status.candidateCount ?? status.eventCount) : "—"}</b><span>{t("已保存来源记录")}</span></div><div><b>{status ? number(status.completedMonths) : "—"}</b><span>{t("至少五件的月份")}</span></div><div><b>{status ? number(status.pendingMonths) : "—"}</b><span>{t("少于五件的月份")}</span></div></div><div className="sync-status-line"><span className={`status-dot ${status?.sync.running ? "pulsing" : ""}`} />{status?.sync.running ? `${t("正在同步")} ${status.sync.processed} / ${status.sync.total}` : t("当前同步已停止")}</div>{status?.sync.error && <p className="sync-error">{status.sync.error}</p>}<p className="sync-note">{(locale === "en" ? "Sources: Wikipedia annual timelines and current-event archives (CC BY-SA). Global highlights are selected with transparent heuristics, usually five and up to eight in dense months. Sparse periods retain their actual coverage. Country tags use modern geography; translations are for reading assistance." : status?.sourceNote) || t("正在检查本地数据库…")}</p><p className="sync-note">{t("目标日期：")}{today}（Asia/Shanghai）<br />{t("最近同步：")}{status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString(locale, {
              timeZone: "Asia/Shanghai"
            }) : t("尚未完成首次同步")}</p><button className="primary-button" disabled={status?.sync.running} onClick={syncNow}>{status?.sync.running ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}{status?.sync.running ? t("后台补齐中") : t("检查并补齐数据")}<ArrowUpRight size={14} /></button></div></Modal>}
    {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
  </div></LocaleContext.Provider>;
}
