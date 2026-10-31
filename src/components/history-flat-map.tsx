'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Focus, LoaderCircle, Minus, Plus, Scan } from 'lucide-react';
import type { HistoryGlobeProps } from './history-globe';
import { countryByCode } from '@/lib/countries';
import { getMapEra } from '@/lib/map-eras';
import { countryFocusBounds, countryMapName, decodeMapData, insideCountry, majorAnchors, mapCountryPath, mapPoint, readMapData, territoryDescription, type GeoCountry } from '@/lib/map-geometry';

type Viewport = { x: number; y: number; width: number; height: number };
type MapLayer = { countries: GeoCountry[]; historical: boolean; year: number };
type Contact = { x: number; y: number; startX: number; startY: number };
const WORLD: Viewport = { x: 0, y: 0, width: 720, height: 360 };

export default function HistoryFlatMap(props: HistoryGlobeProps) {
  const locale = props.locale || 'zh-CN';
  const zh = locale === 'zh-CN';
  const latest = useRef(props); latest.current = props;
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [layer, setLayer] = useState<MapLayer>({ countries: [], historical: false, year: 0 });
  const [busy, setBusy] = useState(true);
  const [warning, setWarning] = useState<'historical' | 'unavailable' | null>(null);
  const [size, setSize] = useState({ width: 600, height: 500 });
  const sizeRef = useRef(size); sizeRef.current = size;
  const [view, setView] = useState<Viewport>(WORLD);
  const viewRef = useRef(view);
  const frame = useRef(0);
  const firstFocus = useRef(true);
  const contacts = useRef(new Map<number, Contact>());
  const suppressClick = useRef(false);
  const usedMultiplePointers = useRef(false);
  const pinch = useRef<{ distance: number; x: number; y: number } | null>(null);
  const paths = useMemo(() => layer.countries.map(country => ({ country, path: mapCountryPath(country), bounds: country.polygons.map(polygon => countryFocusBounds({ ...country, polygons: [polygon] })) })), [layer.countries]);
  const selected = useMemo(() => {
    const named = props.selectedTerritory && layer.countries.find(country => country.name === props.selectedTerritory);
    if (named) return named;
    if (!props.selectedCountry) return null;
    const coded = layer.countries.find(country => country.code === props.selectedCountry);
    if (coded) return coded;
    const anchor = countryByCode[props.selectedCountry];
    return anchor ? layer.countries.find(country => insideCountry([anchor.lng, anchor.lat], country)) || null : null;
  }, [layer.countries, props.selectedCountry, props.selectedTerritory]);

  function bounded(next: Viewport): Viewport {
    const aspect = sizeRef.current.width / Math.max(1, sizeRef.current.height);
    const width = Math.min(720, Math.max(18, next.width));
    const height = width / aspect;
    const centerX = ((next.x + next.width / 2) % 720 + 720) % 720;
    const centerY = Math.min(360, Math.max(0, next.y + next.height / 2));
    return { x: centerX - width / 2, y: centerY - height / 2, width, height };
  }
  function commit(next: Viewport) {
    viewRef.current = next;
    setView(next);
  }
  function stopAnimation() { cancelAnimationFrame(frame.current); frame.current = 0; }
  function moveTo(next: Viewport, animate = true) {
    stopAnimation();
    const target = bounded(next);
    const from = viewRef.current;
    // Pick the neighboring world copy, so a transition across the date line stays short.
    target.x += Math.round((from.x + from.width / 2 - target.x - target.width / 2) / 720) * 720;
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { commit(target); return; }
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - started) / 520);
      const t = 1 - Math.pow(1 - elapsed, 4);
      commit(elapsed === 1 ? bounded(target) : { x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t, width: from.width + (target.width - from.width) * t, height: from.height + (target.height - from.height) * t });
      if (elapsed < 1) frame.current = requestAnimationFrame(tick); else frame.current = 0;
    };
    frame.current = requestAnimationFrame(tick);
  }
  function fit(country: GeoCountry | null, animate = true) {
    const bounds = country ? countryFocusBounds(country) : WORLD;
    const aspect = sizeRef.current.width / Math.max(1, sizeRef.current.height);
    const padding = country ? 1.65 : 1;
    const width = Math.max(bounds.width * padding, bounds.height * padding * aspect, country ? 28 : 720);
    moveTo({ x: bounds.x + bounds.width / 2 - width / 2, y: bounds.y + bounds.height / 2 - width / aspect / 2, width, height: width / aspect }, animate);
  }
  function focusSelection(animate = true) {
    if (selected) { fit(selected, animate); return; }
    const reference = props.selectedCountry && countryByCode[props.selectedCountry];
    if (!reference) { fit(null, animate); return; }
    const point = mapPoint(reference.lat, reference.lng);
    const aspect = sizeRef.current.width / Math.max(1, sizeRef.current.height);
    moveTo({ x: point.x - 40, y: point.y - 40 / aspect, width: 80, height: 80 / aspect }, animate);
  }
  function zoomAt(factor: number, clientX?: number, clientY?: number) {
    stopAnimation();
    const current = viewRef.current;
    const rect = svg.current?.getBoundingClientRect();
    const rx = rect && clientX !== undefined ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0.5;
    const ry = rect && clientY !== undefined ? Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)) : 0.5;
    const width = Math.min(720, Math.max(18, current.width * factor));
    const height = width * current.height / current.width;
    commit(bounded({ x: current.x + (current.width - width) * rx, y: current.y + (current.height - height) * ry, width, height }));
  }
  function selectCountry(country: GeoCountry) {
    if (country.code) latest.current.onCountrySelect(country.code);
    latest.current.onTerritorySelect?.({ name: country.name, subject: country.subject || null, year: layer.year, countryCode: country.code || null });
    fit(country);
  }
  function keyboardSelect(event: KeyboardEvent<SVGElement>, action: () => void) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); action(); }
  }

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => { observer.disconnect(); stopAnimation(); };
  }, []);

  const mapYear = props.mapYear || 1969;
  const historical = props.historicalBorders !== false;
  const mapFile = historical ? getMapEra(mapYear).file : '/geo/countries-110m.json';
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setBusy(true); setWarning(null);
    async function fetchLayer(file: string, isHistorical: boolean): Promise<MapLayer> {
      const response = await fetch(file, { signal: controller.signal });
      const countries = decodeMapData(await readMapData(response));
      if (!countries.length) throw new Error('Empty map');
      return { countries, historical: isHistorical, year: isHistorical ? getMapEra(mapYear).year : new Date().getFullYear() };
    }
    async function load() {
      let modern: MapLayer | null = null;
      try {
        modern = await fetchLayer('/geo/countries-110m.json', false);
        if (!active) return;
        // Keep the old historical map while a new snapshot loads; only use modern data as the initial fallback.
        setLayer(previous => previous.countries.length ? previous : modern!);
        if (!historical) { setLayer(modern); return; }
        try {
          const next = await fetchLayer(mapFile, true);
          if (active) setLayer(next);
        } catch (error) {
          if (controller.signal.aborted || !active) return;
          setLayer(modern); setWarning('historical');
        }
      } catch {
        if (controller.signal.aborted || !active) return;
        if (historical) {
          try { const next = await fetchLayer(mapFile, true); if (active) { setLayer(next); return; } }
          catch { if (controller.signal.aborted || !active) return; }
        }
        setWarning('unavailable');
      } finally { if (active) setBusy(false); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [mapFile, historical]);

  useLayoutEffect(() => {
    if (!layer.countries.length) return;
    focusSelection(!firstFocus.current && props.active !== false);
    firstFocus.current = false;
  }, [selected, props.selectedCountry, layer.countries, size.width, size.height]);
  useEffect(() => {
    if (props.active === false) {
      stopAnimation(); contacts.current.clear(); pinch.current = null;
    }
  }, [props.active]);
  useEffect(() => { if (props.resetToken) focusSelection(); }, [props.resetToken]);
  useEffect(() => {
    if (!props.activeEventId) return;
    const event = props.events.find(item => item.id === props.activeEventId);
    if (!event || !Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return;
    const point = mapPoint(event.lat, event.lng);
    const current = viewRef.current;
    point.x += Math.round((current.x + current.width / 2 - point.x) / 720) * 720;
    if (point.x > current.x + current.width * 0.12 && point.x < current.x + current.width * 0.88 && point.y > current.y + current.height * 0.12 && point.y < current.y + current.height * 0.88) return;
    const width = Math.min(current.width, 180);
    const height = width * current.height / current.width;
    moveTo({ x: point.x - width / 2, y: point.y - height / 2, width, height });
  }, [props.activeEventId]);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * element.clientHeight : event.deltaY;
      zoomAt(Math.exp(Math.min(300, Math.max(-300, delta)) * 0.0016), event.clientX, event.clientY);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    stopAnimation();
    if (!contacts.current.size) { suppressClick.current = false; usedMultiplePointers.current = false; }
    contacts.current.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    (event.target as Element).setPointerCapture?.(event.pointerId);
    if (contacts.current.size > 1) {
      usedMultiplePointers.current = true; suppressClick.current = true;
      const [a, b] = [...contacts.current.values()];
      pinch.current = { distance: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const previous = contacts.current.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x; const dy = event.clientY - previous.y;
    contacts.current.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
    if (Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY) > 6) suppressClick.current = true;
    if (contacts.current.size > 1) {
      const [a, b] = [...contacts.current.values()];
      const next = { distance: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinch.current && next.distance > 0) {
        zoomAt(pinch.current.distance / next.distance, pinch.current.x, pinch.current.y);
        const current = viewRef.current;
        commit(bounded({ ...current, x: current.x - (next.x - pinch.current.x) * current.width / sizeRef.current.width, y: current.y - (next.y - pinch.current.y) * current.height / sizeRef.current.height }));
      }
      pinch.current = next;
    } else {
      const current = viewRef.current;
      commit(bounded({ ...current, x: current.x - dx * current.width / sizeRef.current.width, y: current.y - dy * current.height / sizeRef.current.height }));
    }
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    contacts.current.delete(event.pointerId); pinch.current = null;
    if (usedMultiplePointers.current) suppressClick.current = true;
  }
  function pointerCancel(event: PointerEvent<SVGSVGElement>) {
    suppressClick.current = true;
    pointerUp(event);
  }

  const px = view.width / Math.max(1, size.width);
  const centerX = view.x + view.width / 2;
  const wrapX = (x: number) => x + Math.round((centerX - x) / 720) * 720;
  const visible = (x: number, y: number, margin = 0) => x > view.x + margin && x < view.x + view.width - margin && y > view.y + margin && y < view.y + view.height - margin;
  const labels = useMemo(() => {
    const seen = new Set<string>();
    const result: { country: GeoCountry; lat: number; lng: number }[] = [];
    if (selected) {
      const reference = props.selectedCountry && countryByCode[props.selectedCountry];
      const bounds = countryFocusBounds(selected);
      result.push({ country: selected, lat: reference ? reference.lat : 90 - (bounds.y + bounds.height / 2) / 2, lng: reference ? reference.lng : (bounds.x + bounds.width / 2) / 2 - 180 });
      seen.add(selected.name);
    }
    for (const [, lat, lng] of majorAnchors) {
      const country = layer.countries.find(item => insideCountry([lng, lat], item));
      if (country && !seen.has(country.name)) { seen.add(country.name); result.push({ country, lat, lng }); }
    }
    return result;
  }, [layer.countries, selected, props.selectedCountry]);
  const occupied: { x: number; y: number; width: number }[] = [];
  const eventPins = props.events.filter(event => Number.isFinite(event.lat) && Number.isFinite(event.lng) && event.countryCodes.length);
  const pinScreenPoints = eventPins.map((event, index) => {
    const point = mapPoint(event.lat, event.lng);
    return { x: (wrapX(point.x) - view.x) / px + (index % 3 - 1) * 2, y: (point.y - view.y) / px };
  });

  return <div ref={host} className="flat-map" role="region" aria-label={zh ? '可拖动缩放的二维世界地图' : 'Interactive flat world map'} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    <svg ref={svg} className="flat-map-svg" viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} preserveAspectRatio="none" role="group" aria-label={zh ? '平面国家版图，点击国家查看历史' : 'Flat country borders. Select a country to explore its history.'} style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', overflow: 'hidden' }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onLostPointerCapture={event => { if (contacts.current.has(event.pointerId)) pointerCancel(event); }}>
      <rect className="flat-map-ocean" x={-1440} y={-1440} width={3600} height={3240} />
      <g className="flat-map-grid" fill="none" pointerEvents="none">
        {[-720, 0, 720].flatMap(offset => [
          ...Array.from({ length: 7 }, (_, i) => <path key={`lat-${offset}-${i}`} d={`M${offset},${i * 60}h720`} vectorEffect="non-scaling-stroke" />),
          ...Array.from({ length: 13 }, (_, i) => <path key={`lng-${offset}-${i}`} d={`M${offset + i * 60},0v360`} vectorEffect="non-scaling-stroke" />),
        ])}
      </g>
      <g>{paths.map(({ country, path, bounds }, index) => {
        const inView = bounds.some(bound => {
          const x = wrapX(bound.x + bound.width / 2) - bound.width / 2;
          return x < view.x + view.width && x + bound.width > view.x && bound.y < view.y + view.height && bound.y + bound.height > view.y;
        });
        return <path key={`${country.name}-${index}`} className={`flat-map-country${country === selected || country.code && country.code === props.selectedCountry ? ' is-selected' : ''}`} d={path} fillRule="evenodd" vectorEffect="non-scaling-stroke" role="button" tabIndex={inView ? 0 : -1} aria-label={territoryDescription(country, layer.year, locale)} aria-pressed={country === selected} onClick={event => { event.stopPropagation(); if (!suppressClick.current) selectCountry(country); }} onKeyDown={event => keyboardSelect(event, () => selectCountry(country))}><title>{territoryDescription(country, layer.year, locale)}</title></path>;
      })}</g>
      <g className="flat-map-labels">{labels.map(({ country, lat, lng }) => {
        const point = mapPoint(lat, lng); point.x = wrapX(point.x);
        const name = countryMapName(country, locale);
        const width = Math.min(125, name.length * (zh ? 11 : 6));
        const screenX = (point.x - view.x) / px; const screenY = (point.y - view.y) / px;
        if (!visible(point.x, point.y, 18 * px)) return null;
        const offsets = country === selected ? [-18, -34, 20, 0] : [0, -18, 20, -34, 36];
        const baseline = offsets.map(offset => screenY + offset).find(candidate => candidate > 16 && candidate < size.height - 12
          && !occupied.some(other => Math.abs(other.x - screenX) < (other.width + width) / 2 + 10 && Math.abs(other.y - candidate) < 24)
          && !pinScreenPoints.some(pin => Math.abs(pin.x - screenX) < width / 2 + 10 && pin.y > candidate - 20 && pin.y < candidate + 12));
        if (baseline === undefined) return null;
        occupied.push({ x: screenX, y: baseline, width });
        return <text key={country.name} x={point.x} y={view.y + baseline * px} textAnchor="middle" className={`flat-map-label${country === selected ? ' is-selected' : ''}`} style={{ fontSize: (country === selected ? 11 : 10) * px, strokeWidth: 2.5 * px, paintOrder: 'stroke' }} role="button" tabIndex={0} aria-label={territoryDescription(country, layer.year, locale)} onClick={event => { event.stopPropagation(); if (!suppressClick.current) selectCountry(country); }} onKeyDown={event => keyboardSelect(event, () => selectCountry(country))}>{name}</text>;
      })}</g>
      <g>{eventPins.map((event, index) => {
        const point = mapPoint(event.lat, event.lng); point.x = wrapX(point.x);
        const active = event.id === props.activeEventId;
        if (!visible(point.x, point.y, -10 * px)) return null;
        return <g key={event.id} transform={`translate(${point.x + (index % 3 - 1) * px * 2},${point.y})`} className={`flat-map-event${active ? ' is-active' : ''}`} role="button" tabIndex={0} aria-label={`${event.date} · ${event.title}`} onClick={e => { e.stopPropagation(); if (!suppressClick.current) props.onEventSelect(event); }} onKeyDown={e => keyboardSelect(e, () => props.onEventSelect(event))}><title>{`${event.date} · ${event.title}`}</title><circle r={(active ? 9 : 7) * px} fill="transparent" stroke="none" /><circle className="flat-map-event-halo" r={(active ? 7 : 5) * px} vectorEffect="non-scaling-stroke" /><circle r={(active ? 3.2 : 2.4) * px} vectorEffect="non-scaling-stroke" /></g>;
      })}</g>
    </svg>
    {busy && <div className="flat-map-status" role="status"><LoaderCircle size={14} className="spin" />{zh ? '正在展开平面地图…' : 'Loading the flat map…'}</div>}
    {warning && <div className="flat-map-status is-warning" role="status">{warning === 'historical' ? zh ? '历史地图暂不可用，当前显示当代国界。' : 'Historical map unavailable. Showing contemporary borders.' : zh ? '地图暂不可用，请切换版图重试；仍可使用事件筛选。' : 'Map unavailable. Change the border view to retry, or use the event filters.'}</div>}
    <div className="flat-map-controls" aria-label={zh ? '二维地图控制' : 'Flat map controls'}>
      <button type="button" aria-label={zh ? '放大地图' : 'Zoom in'} title={zh ? '放大地图' : 'Zoom in'} onClick={() => zoomAt(0.72)} disabled={view.width <= 18.1}><Plus size={16} /></button>
      <button type="button" aria-label={zh ? '缩小地图' : 'Zoom out'} title={zh ? '缩小地图' : 'Zoom out'} onClick={() => zoomAt(1.4)} disabled={view.width >= 719.9}><Minus size={16} /></button>
      <button type="button" aria-label={zh ? '定位当前国家' : 'Focus selected country'} title={zh ? '定位当前国家' : 'Focus selected country'} onClick={() => focusSelection()}><Focus size={16} /></button>
      <button type="button" aria-label={zh ? '查看平面世界全图' : 'Show the whole flat world'} title={zh ? '查看平面世界全图' : 'Show the whole flat world'} onClick={() => fit(null)}><Scan size={16} /></button>
    </div>
    <div className="flat-map-caption" aria-hidden="true">2D / {layer.historical ? `${layer.year} ${zh ? '年边界快照' : 'border snapshot'}` : zh ? '当代国界' : 'Contemporary borders'}<span> · {zh ? '拖动平移 · 滚动／双指缩放' : 'Drag to pan · Scroll / pinch to zoom'}</span></div>
  </div>;
}
