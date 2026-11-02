"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { createTranslator, formatMonth } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

type MonthPickerProps = {
  value: string;
  onChange: (value: string) => void;
  min: string;
  max: string;
  currentMonth: string;
  defaultMonth?: string;
  locale: Locale;
  label: string;
  placeholder?: string;
  clearable?: boolean;
  variant?: "compact" | "navigator";
};

export default function MonthPicker({
  value, onChange, min, max, currentMonth, defaultMonth, locale, label,
  placeholder, clearable = false, variant = "compact",
}: MonthPickerProps) {
  const t = createTranslator(locale);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"months" | "years">("months");
  const initialMonth = value || (defaultMonth ? [min, defaultMonth, max].sort()[1] : max);
  const [year, setYear] = useState(Number(initialMonth.slice(0, 4)));
  const minYear = Number(min.slice(0, 4));
  const maxYear = Number(max.slice(0, 4));
  const yearStart = Math.floor(year / 12) * 12;
  const isYears = view === "years";
  const canGoBack = isYears ? yearStart > minYear : year > minYear;
  const canGoForward = isYears ? yearStart + 11 < maxYear : year < maxYear;
  const monthName = (index: number) => new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, index, 1)));

  // Native popovers use the top layer, escaping the atlas's clipped panels.
  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const anchor = trigger.current;
      const popup = panel.current;
      if (!anchor || !popup) return;
      const rect = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 12;
      const topEdge = (viewport?.offsetTop ?? 0) + 12;
      const rightEdge = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) - 12;
      const bottomEdge = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 12;
      popup.style.maxHeight = `${bottomEdge - topEdge}px`;
      const width = popup.offsetWidth;
      const height = popup.offsetHeight;
      const left = Math.max(leftEdge, Math.min(rect.right - width, rightEdge - width));
      const below = rect.bottom + 8;
      const top = below + height <= bottomEdge ? below : Math.max(topEdge, rect.top - height - 8);
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (panel.current) observer.observe(panel.current);
    if (trigger.current) observer.observe(trigger.current);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const buttons = grid.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    const preferred = grid.current?.querySelector<HTMLButtonElement>(".is-selected:not(:disabled), .is-current:not(:disabled)");
    (preferred || buttons?.[0])?.focus({ preventScroll: true });
  }, [open, view]);

  const close = () => {
    panel.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  };
  const choose = (next: string) => {
    if (next && (next < min || next > max)) return;
    onChange(next);
    close();
  };
  const movePeriod = (direction: number) => {
    setYear(current => Math.min(maxYear, Math.max(minYear, current + direction * (isYears ? 12 : 1))));
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // These arrows belong to this picker, not the atlas's global month shortcut.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (!grid.current?.contains(event.target as Node)) return;
    const keys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 };
    if (!(event.key in keys) && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const buttons = Array.from(grid.current.querySelectorAll<HTMLButtonElement>("button"));
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    const direction = event.key === "Home" ? 1 : event.key === "End" ? -1 : Math.sign(keys[event.key]);
    let next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : current + keys[event.key];
    while (next >= 0 && next < buttons.length) {
      if (!buttons[next].disabled) { buttons[next].focus(); break; }
      next += direction;
    }
  };

  return <div className={`month-picker month-picker-${variant}`} data-month-picker>
    <button ref={trigger} type="button" className={`month-picker-trigger ${value ? "" : "is-empty"}`}
      aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      popoverTarget={id} onClick={() => { setYear(Number(initialMonth.slice(0, 4))); setView("months"); }}>
      <CalendarDays size={14} aria-hidden="true" />
      <span className="month-picker-value">{value ? formatMonth(value, locale) : placeholder || t("选择月份")}</span>
      <ChevronDown size={12} aria-hidden="true" />
    </button>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-label={label} className="month-picker-panel" data-month-picker
      onToggle={event => setOpen(event.newState === "open")} onKeyDown={handleKeyDown}
      onBlur={event => {
        const next = event.relatedTarget as Node | null;
        if (next && !event.currentTarget.contains(next) && next !== trigger.current) panel.current?.hidePopover();
      }}>
      <div className="month-picker-header"><div><span>{isYears ? "SELECT YEAR" : "SELECT MONTH"}</span><strong>{label}</strong></div>
        <button type="button" className="month-picker-close" aria-label={t("关闭")} onClick={close}><X size={15} /></button>
      </div>
      <div className="month-picker-navigation">
        <button type="button" className="month-picker-nav-button" disabled={!canGoBack} aria-label={t(isYears ? "上一组年份" : "上一年")} onClick={() => movePeriod(-1)}><ChevronLeft size={16} /></button>
        <button type="button" className="month-picker-period" aria-label={t(isYears ? "返回月份选择" : "选择年份")} onClick={() => setView(isYears ? "months" : "years")}>
          {isYears ? `${Math.max(minYear, yearStart)} — ${Math.min(maxYear, yearStart + 11)}` : `${year}${locale === "zh-CN" ? " 年" : ""}`}<ChevronDown size={12} />
        </button>
        <button type="button" className="month-picker-nav-button" disabled={!canGoForward} aria-label={t(isYears ? "下一组年份" : "下一年")} onClick={() => movePeriod(1)}><ChevronRight size={16} /></button>
      </div>
      <div ref={grid} className={`month-picker-grid ${isYears ? "is-years" : ""}`} role="group" aria-label={t(isYears ? "选择年份" : "选择月份")}>
        {Array.from({ length: 12 }, (_, index) => {
          const cellYear = yearStart + index;
          const cellMonth = `${year}-${String(index + 1).padStart(2, "0")}`;
          const selected = isYears ? cellYear === year : cellMonth === value;
          const current = isYears ? cellYear === Number(currentMonth.slice(0, 4)) : cellMonth === currentMonth;
          const disabled = isYears ? cellYear < minYear || cellYear > maxYear : cellMonth < min || cellMonth > max;
          return <button type="button" key={index} className={`month-picker-cell ${selected ? "is-selected" : ""} ${current ? "is-current" : ""}`}
            disabled={disabled} aria-pressed={selected} aria-label={isYears ? String(cellYear) : formatMonth(cellMonth, locale)}
            onClick={() => { if (isYears) { setYear(cellYear); setView("months"); } else choose(cellMonth); }}>
            <span>{isYears ? cellYear : monthName(index)}</span>{selected && <Check size={11} aria-hidden="true" />}
          </button>;
        })}
      </div>
      <div className="month-picker-footer"><span>{value ? formatMonth(value, locale) : t("不限时间")}</span>
        {clearable && <button type="button" className="month-picker-clear" disabled={!value} onClick={() => choose("")}>{t("清除选择")}</button>}
      </div>
      <div className="month-picker-hint">{formatMonth(min, locale)} — {formatMonth(max, locale)}</div>
    </div>
  </div>;
}
