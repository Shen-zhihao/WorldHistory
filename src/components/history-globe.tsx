'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { countryByCode, countryByNumeric } from '@/lib/countries';
import { getMapEra } from '@/lib/map-eras';
import type { HistoryEvent } from '@/lib/types';
import type { Locale } from '@/lib/locale';

type Coordinate = [number, number];
type Polygon = Coordinate[][];
type GeoCountry = { code: string; name: string; polygons: Polygon[]; historical?: boolean; subject?: string | null };
type HistoricalGeoJSON = { features: { properties: { name: string; subject?: string | null; code: string | null }; geometry: { type: string; coordinates: Polygon | Polygon[] } }[] };
type Topology = { transform: { scale: Coordinate; translate: Coordinate }; arcs: Coordinate[][]; objects: { countries: { geometries: { id: string; properties: { name: string }; type: string; arcs: number[][] | number[][][] }[] } } };

export interface HistoryGlobeProps {
  events: HistoryEvent[];
  selectedCountry: string | null;
  onCountrySelect: (code: string | null) => void;
  onEventSelect: (event: HistoryEvent) => void;
  activeEventId?: string | null;
  autoRotate?: boolean;
  resetToken?: number;
  mapYear?: number;
  historicalBorders?: boolean;
  locale?: Locale;
  onTerritorySelect?: (territory: { name: string; subject: string | null; year: number; countryCode: string | null }) => void;
}

const historicalNames: Record<string, string> = {
  'Qing Empire': '清朝', 'Qing': '清朝', 'China': '中国', 'Republic of China': '中华民国',
  'United States': '美国', 'United States of America': '美国', 'United Kingdom': '英国',
  'United Kingdom of Great Britain and Ireland': '英国', 'France': '法国', 'Prussia': '普鲁士',
  'Germany': '德国', 'German Empire': '德意志帝国', 'East Germany': '东德', 'West Germany': '西德',
  'Russian Empire': '俄罗斯帝国', 'Russia': '俄罗斯', 'USSR': '苏联', 'Soviet Union': '苏联',
  'Ottoman Empire': '奥斯曼帝国', 'Turkey': '土耳其', 'Türkiye': '土耳其',
  'India': '印度', 'British Raj': '英属印度', 'Japan': '日本', 'Imperial Japan': '日本帝国',
  'Brazil': '巴西', 'Viceroyalty of Brazil': '巴西总督区', 'Kingdom of Brazil': '巴西王国',
  'Australia': '澳大利亚', 'Australian aboriginal hunter-gatherers': '澳洲原住民地区',
  'Canada': '加拿大', 'Egypt': '埃及', 'South Africa': '南非', 'Italy': '意大利',
  'Papal States': '教皇国', 'Mexico': '墨西哥', 'Viceroyalty of New Spain': '新西班牙总督区', 'Spain': '西班牙',
};
const majorAnchors: [string, number, number][] = [
  ['CN', 35, 105], ['US', 39, -77], ['GB', 54, -2], ['FR', 47, 2], ['RU', 56, 40], ['JP', 36, 138],
  ['IN', 24, 78], ['BR', -15, -48], ['AU', -25, 135], ['CA', 47, -72], ['TR', 39, 33], ['DE', 52, 13],
  ['EG', 27, 30], ['ZA', -30, 25], ['IT', 43, 12], ['MX', 20, -100], ['ES', 40, -4], ['ID', -3, 117],
];

const globeText = {
  'zh-CN': {
    canvas: '可拖动、缩放的世界地球仪，点击国家查看历史事件',
    labels: '地球主要国家与历史政权',
    loading: '正在展开世界地图…',
    historicalMapUnavailable: '历史地图暂时无法加载，当前回退显示现代国界。',
    mapUnavailable: '地图资源加载失败，请刷新重试；仍可使用国家筛选和时间轴。',
    webglUnavailable: '当前设备无法显示 3D 地球',
    fallback: '仍可使用国家筛选与时间轴探索全部事件',
    historicalEntity: '查看历史政权信息与事件',
    contemporary: '当代国界',
  },
  en: {
    canvas: 'Interactive world globe. Drag to rotate, scroll to zoom, and select a country to explore its history.',
    labels: 'Major countries and historical territories',
    loading: 'Unfolding the world map…',
    historicalMapUnavailable: 'The historical map could not load. Showing contemporary borders instead.',
    mapUnavailable: 'Map assets could not load. Refresh to retry, or explore events with the country filters and timeline.',
    webglUnavailable: 'This device cannot display the 3D globe',
    fallback: 'You can still explore every event using the country filters and timeline.',
    historicalEntity: 'Explore this historical territory and its events',
    contemporary: 'Contemporary borders',
  },
} as const;

function countryDisplayName(country: GeoCountry, locale: Locale, fallbackCode?: string) {
  if (country.historical) return locale === 'zh-CN' ? historicalNames[country.name] || country.name : country.name;
  const reference = countryByCode[country.code || fallbackCode || ''];
  return (locale === 'zh-CN' ? reference?.name : reference?.nameEn) || country.name;
}

function territoryDescription(country: GeoCountry, year: number, locale: Locale) {
  const name = countryDisplayName(country, locale);
  const subject = country.subject && country.subject !== country.name ? (locale === 'zh-CN' ? historicalNames[country.subject] || country.subject : country.subject) : null;
  const reference = countryByCode[country.code];
  const filterName = (locale === 'zh-CN' ? reference?.name : reference?.nameEn) || country.code;
  const mapDate = country.historical ? (locale === 'zh-CN' ? `${year} 年边界快照` : `${year} border snapshot`) : globeText[locale].contemporary;
  const action = country.code ? (locale === 'zh-CN' ? `以现代 ${filterName} 筛选事件` : `Filter events using present-day ${filterName}`) : globeText[locale].historicalEntity;
  return `${name}${subject ? ` · ${subject}` : ''}\n${mapDate}\n${action}`;
}

function spherePosition(lat: number, lng: number, radius = 1) {
  const phi = lat * Math.PI / 180;
  const theta = lng * Math.PI / 180;
  return new THREE.Vector3(radius * Math.cos(phi) * Math.sin(theta), radius * Math.sin(phi), radius * Math.cos(phi) * Math.cos(theta));
}

function decodeTopology(topology: Topology): GeoCountry[] {
  const decoded = topology.arcs.map(arc => {
    let x = 0; let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx; y += dy;
      return [x * topology.transform.scale[0] + topology.transform.translate[0], y * topology.transform.scale[1] + topology.transform.translate[1]] as Coordinate;
    });
  });
  const ring = (indices: number[]) => indices.flatMap((index, i) => {
    const points = index < 0 ? [...decoded[~index]].reverse() : decoded[index];
    return i ? points.slice(1) : points;
  });
  return topology.objects.countries.geometries.map(geometry => ({
    code: countryByNumeric[String(geometry.id).padStart(3, '0')]?.code || ({ Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO' } as Record<string, string>)[geometry.properties.name] || '',
    name: geometry.properties.name,
    polygons: (geometry.type === 'Polygon' ? [geometry.arcs as number[][]] : geometry.arcs as number[][][]).map(polygon => polygon.map(ring)),
  }));
}

function insideRing(point: Coordinate, ring: Coordinate[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if (((yi > point[1]) !== (yj > point[1])) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function insideCountry(point: Coordinate, country: GeoCountry) {
  return country.polygons.some(polygon => insideRing(point, polygon[0]) && !polygon.slice(1).some(hole => insideRing(point, hole)));
}

function borderGeometry(items: GeoCountry[], radius = 1.004) {
  const positions: number[] = [];
  items.forEach(country => country.polygons.forEach(polygon => polygon.forEach(ring => {
    for (let i = 1; i < ring.length; i++) {
      const a = spherePosition(ring[i - 1][1], ring[i - 1][0], radius);
      const b = spherePosition(ring[i][1], ring[i][0], radius);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  })));
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
}

function landTexture(items: GeoCountry[]) {
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#061c29'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  items.forEach(country => country.polygons.forEach(polygon => {
    ctx.beginPath();
    polygon.forEach(ring => ring.forEach(([lng, lat], i) => {
      const x = (lng + 180) / 360 * canvas.width; const y = (90 - lat) / 180 * canvas.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }));
    ctx.fillStyle = '#17515b'; ctx.fill('evenodd');
  }));
  // The sphere's default UV origin is 90° west of our longitude convention.
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.offset.x = 0.25;
  return texture;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse(child => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      if (child instanceof THREE.InstancedMesh) child.dispose();
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => material.dispose());
    }
  });
}

export default function HistoryGlobe(props: HistoryGlobeProps) {
  const locale = props.locale || 'zh-CN';
  const text = globeText[locale];
  const hostRef = useRef<HTMLDivElement>(null);
  const current = useRef(props); current.current = props;
  const sceneApi = useRef<{ update: () => void; reset: () => void; loadMap: (year: number, historical: boolean) => void; refreshLocale: () => void } | null>(null);
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mapWarning, setMapWarning] = useState<'historicalMapUnavailable' | 'mapUnavailable' | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false; let animation = 0; let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    renderer.domElement.setAttribute('aria-label', globeText[current.current.locale || 'zh-CN'].canvas);
    renderer.domElement.setAttribute('role', 'img');
    host.appendChild(renderer.domElement);
    const labelLayer = document.createElement('div');
    labelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2';
    labelLayer.setAttribute('aria-label', globeText[current.current.locale || 'zh-CN'].labels); host.appendChild(labelLayer);
    let majorLabels: { element: HTMLButtonElement; position: THREE.Vector3; code: string; width: number }[] = [];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.copy(spherePosition(25, 90, 3.65));
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.07; controls.enablePan = false;
    controls.minDistance = 1.65; controls.maxDistance = 5.8; controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.65;
    controls.autoRotateSpeed = 0.35;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshPhongMaterial({ color: 0x9fd9da, emissive: 0x062633, emissiveIntensity: 0.7, shininess: 12 }));
    scene.add(globe, new THREE.AmbientLight(0x9abccf, 1.5));
    const sunlight = new THREE.DirectionalLight(0xb5f5eb, 2.2); sunlight.position.set(3, 2, 4); scene.add(sunlight);
    const rimlight = new THREE.DirectionalLight(0x2565be, 2); rimlight.position.set(-3, 1, -2); scene.add(rimlight);
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 48), new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vNormal;varying vec3 vPosition;void main(){vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.0);vPosition=p.xyz;gl_Position=projectionMatrix*p;}',
      fragmentShader: 'varying vec3 vNormal;varying vec3 vPosition;void main(){float edge=1.0-max(0.0,dot(normalize(vNormal),normalize(-vPosition)));float intensity=pow(edge,4.5);gl_FragColor=vec4(0.12,0.69,0.83,intensity*0.52);}',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    })); scene.add(atmosphere);
    const gridPositions: number[] = [];
    for (let lat = -60; lat <= 60; lat += 30) for (let lng = -180; lng < 180; lng += 3) {
      const a = spherePosition(lat, lng, 1.001); const b = spherePosition(lat, lng + 3, 1.001); gridPositions.push(...a.toArray(), ...b.toArray());
    }
    for (let lng = -180; lng < 180; lng += 30) for (let lat = -90; lat < 90; lat += 3) {
      const a = spherePosition(lat, lng, 1.001); const b = spherePosition(lat + 3, lng, 1.001); gridPositions.push(...a.toArray(), ...b.toArray());
    }
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3)), new THREE.LineBasicMaterial({ color: 0x33838a, transparent: true, opacity: 0.13 })));
    const starPositions: number[] = [];
    for (let i = 0; i < 650; i++) {
      const u = ((i * 0.61803398875) % 1) * 2 - 1; const angle = i * 2.399963;
      starPositions.push(Math.sqrt(1 - u * u) * Math.cos(angle) * 14, u * 14, Math.sqrt(1 - u * u) * Math.sin(angle) * 14);
    }
    scene.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3)), new THREE.PointsMaterial({ color: 0x8ea9bf, size: 0.014, transparent: true, opacity: 0.6, sizeAttenuation: true })));
    const pins = new THREE.Group(); scene.add(pins);
    let pinEvents: HistoryEvent[] = []; let pinRings: THREE.InstancedMesh | null = null;
    let geoCountries: GeoCountry[] = []; let selectedBorder: THREE.LineSegments | null = null; let mapTexture: THREE.Texture | null = null; let countryBorders: THREE.LineSegments | null = null; let displayedMapYear = current.current.mapYear || 1969;
    const selectTerritory = (country: GeoCountry) => {
      const code = country.code || null;
      if (code) current.current.onCountrySelect(code);
      current.current.onTerritorySelect?.({ name: country.name, subject: country.subject || null, year: displayedMapYear, countryCode: code });
    };
    const updateMajorLabels = () => {
      labelLayer.replaceChildren(); majorLabels = []; const seen = new Set<string>();
      for (const [code, lat, lng] of majorAnchors) {
        const country = geoCountries.find(item => insideCountry([lng, lat], item));
        if (!country) continue;
        const key = country.historical ? `${country.name}|${country.subject || ''}` : code;
        if (seen.has(key)) continue; seen.add(key);
        const name = countryDisplayName(country, current.current.locale || 'zh-CN', code);
        const button = document.createElement('button'); button.type = 'button'; button.textContent = `· ${name}`;
        button.style.cssText = 'position:absolute;display:none;transform:translate(-50%,-50%);background:transparent;border:0;padding:4px 3px;color:#c9e4e5;font:500 10px/1.1 system-ui,sans-serif;letter-spacing:.02em;text-shadow:0 1px 3px #00131f,0 0 7px #00131f,0 0 12px #00131f;max-width:120px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;pointer-events:auto;cursor:pointer';
        button.title = territoryDescription(country, displayedMapYear, current.current.locale || 'zh-CN');
        button.setAttribute('aria-label', button.title);
        button.addEventListener('click', event => { event.stopPropagation(); selectTerritory(country); });
        labelLayer.appendChild(button);
        majorLabels.push({ element: button, position: spherePosition(lat, lng, 1.023), code: country.code, width: Math.min(120, name.length * (/[^\x00-\x7F]/.test(name) ? 10 : 6) + 14) });
      }
    };
    const refreshLocale = () => {
      renderer.domElement.setAttribute('aria-label', globeText[current.current.locale || 'zh-CN'].canvas);
      labelLayer.setAttribute('aria-label', globeText[current.current.locale || 'zh-CN'].labels);
      setHover(null);
      updateMajorLabels();
    };
    let flyTarget: THREE.Vector3 | null = null; let lastCountry: string | null | undefined; let lastEvent: string | null | undefined;
    const update = () => {
      if (disposed) return;
      pins.children.slice().forEach(child => { pins.remove(child); disposeObject(child); });
      pinEvents = current.current.events.filter(event => Number.isFinite(event.lat) && Number.isFinite(event.lng) && event.countryCodes.length > 0);
      pinRings = null;
      if (pinEvents.length) {
        // Three draw calls regardless of event count: instanced dots, instanced rings, batched stems.
        const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), pinEvents.length);
        const rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.022, 0.026, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.64, side: THREE.DoubleSide, depthWrite: false }), pinEvents.length);
        dots.userData.isEventPins = true; rings.userData.isEventPins = true;
        const matrix = new THREE.Object3D(); const stemPositions: number[] = [];
        pinEvents.forEach((event, index) => {
          const active = current.current.activeEventId === event.id;
          const position = spherePosition(event.lat + (index % 3 - 1) * 0.4, event.lng + (index % 2) * 0.5, 1.014);
          matrix.position.copy(position); matrix.quaternion.identity(); matrix.scale.setScalar(active ? 0.018 : 0.012); matrix.updateMatrix();
          dots.setMatrixAt(index, matrix.matrix); dots.setColorAt(index, new THREE.Color(active ? 0xffecd0 : 0xffb46d));
          matrix.scale.setScalar(active ? 1.35 : 1); matrix.lookAt(position.clone().multiplyScalar(2)); matrix.updateMatrix();
          rings.setMatrixAt(index, matrix.matrix); rings.setColorAt(index, new THREE.Color(active ? 0xffe7ba : 0xffad66));
          stemPositions.push(...position.toArray(), ...position.clone().multiplyScalar(active ? 1.14 : 1.08).toArray());
        });
        dots.instanceMatrix.needsUpdate = true; rings.instanceMatrix.needsUpdate = true;
        if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
        if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
        dots.computeBoundingSphere(); rings.computeBoundingSphere();
        const stems = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(stemPositions, 3)), new THREE.LineBasicMaterial({ color: 0xffb874, transparent: true, opacity: 0.72 }));
        pins.add(dots, rings, stems); pinRings = rings;
      }
      if (selectedBorder) { scene.remove(selectedBorder); disposeObject(selectedBorder); selectedBorder = null; }
      const selected = geoCountries.filter(country => country.code === current.current.selectedCountry);
      if (selected.length) {
        selectedBorder = new THREE.LineSegments(borderGeometry(selected, 1.009), new THREE.LineBasicMaterial({ color: 0xf5c58b, transparent: true, opacity: 1 })); scene.add(selectedBorder);
      }
      if (lastCountry !== current.current.selectedCountry && current.current.selectedCountry) {
        const country = countryByCode[current.current.selectedCountry];
        if (country) flyTarget = spherePosition(country.lat, country.lng, Math.max(2.8, camera.position.length()));
      }
      if (lastEvent !== current.current.activeEventId && current.current.activeEventId) {
        const event = current.current.events.find(item => item.id === current.current.activeEventId);
        if (event?.countryCodes.length && Number.isFinite(event.lat) && Number.isFinite(event.lng)) flyTarget = spherePosition(event.lat, event.lng, Math.max(2.8, camera.position.length()));
      }
      lastCountry = current.current.selectedCountry;
      lastEvent = current.current.activeEventId;
    };
    const reset = () => { flyTarget = spherePosition(25, 90, 3.65); };
    let mapAbort: AbortController | undefined; let activeMapFile = ''; let modernReady = false; let pendingMap: { year: number; historical: boolean } | null = null;
    const loadMap = (year: number, historical: boolean, fallback = false) => {
      // A small local modern map is displayed first, so historical loading never leaves an empty globe.
      if (historical && !modernReady) {
        if (!activeMapFile) loadMap(year, false);
        pendingMap = { year, historical }; return;
      }
      if (!historical) pendingMap = null;
      const file = historical ? getMapEra(year).file : '/geo/countries-110m.json';
      if (file === activeMapFile) return;
      activeMapFile = file; mapAbort?.abort(); mapAbort = new AbortController();
      setReady(false); setHover(null);
      fetch(file, { signal: mapAbort.signal }).then(async response => {
        if (!response.ok) throw new Error('map');
        const bytes = await response.arrayBuffer(); const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
        if (signature[0] === 0x1f && signature[1] === 0x8b) return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
        return JSON.parse(new TextDecoder().decode(bytes));
      }).then((data: Topology | HistoricalGeoJSON) => {
        if (disposed || activeMapFile !== file) return;
        geoCountries = historical ? (data as HistoricalGeoJSON).features.filter(feature => ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)).map(feature => ({
          code: feature.properties.code || '', name: feature.properties.name, subject: feature.properties.subject, historical: true,
          polygons: feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates as Polygon] : feature.geometry.coordinates as Polygon[],
        })) : decodeTopology(data as Topology);
        displayedMapYear = historical ? getMapEra(year).year : new Date().getFullYear();
        mapTexture?.dispose(); mapTexture = landTexture(geoCountries); (globe.material as THREE.MeshPhongMaterial).map = mapTexture; globe.material.needsUpdate = true;
        if (countryBorders) { scene.remove(countryBorders); disposeObject(countryBorders); }
        countryBorders = new THREE.LineSegments(borderGeometry(geoCountries), new THREE.LineBasicMaterial({ color: 0x69c5c3, transparent: true, opacity: 0.47 })); scene.add(countryBorders);
        update(); updateMajorLabels(); setReady(true);
        if (!fallback) setMapWarning(null);
        if (!historical) {
          modernReady = true;
          const pending = pendingMap; pendingMap = null;
          if (pending) loadMap(pending.year, pending.historical);
        }
      }).catch(error => {
        if (error.name === 'AbortError' || disposed || activeMapFile !== file) return;
        activeMapFile = '';
        if (historical) {
          setMapWarning('historicalMapUnavailable');
          loadMap(year, false, true);
        } else {
          setReady(geoCountries.length > 0);
          setMapWarning('mapUnavailable');
        }
      });
    };
    sceneApi.current = { update, reset, loadMap, refreshLocale };
    loadMap(current.current.mapYear || 1969, current.current.historicalBorders !== false);
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); let down = { x: 0, y: 0 };
    const hitTest = (event: PointerEvent): { kind: 'event'; event: HistoryEvent } | { kind: 'country'; country: GeoCountry } | null => {
      const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const globeHit = raycaster.intersectObject(globe)[0];
      if (!globeHit) return null;
      const pinHit = raycaster.intersectObjects(pins.children.filter(object => object.userData.isEventPins)).find(hit => hit.instanceId !== undefined && hit.distance <= globeHit.distance + 0.04);
      if (pinHit?.instanceId !== undefined && pinEvents[pinHit.instanceId]) return { kind: 'event', event: pinEvents[pinHit.instanceId] };
      const normal = globeHit.point.clone().normalize();
      const point: Coordinate = [Math.atan2(normal.x, normal.z) * 180 / Math.PI, Math.asin(normal.y) * 180 / Math.PI];
      const country = geoCountries.find(item => insideCountry(point, item));
      return country ? { kind: 'country', country } : null;
    };
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; flyTarget = null; };
    const pointerMove = (event: PointerEvent) => {
      if (event.buttons) { setHover(null); return; }
      const hit = hitTest(event); renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      const rect = host.getBoundingClientRect();
      setHover(hit ? { text: hit.kind === 'event' ? hit.event.title : territoryDescription(hit.country, displayedMapYear, current.current.locale || 'zh-CN'), x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
    };
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
      const hit = hitTest(event);
      if (hit?.kind === 'event') current.current.onEventSelect(hit.event);
      else if (hit?.kind === 'country') selectTerritory(hit.country);
    };
    const pointerLeave = () => setHover(null);
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointermove', pointerMove); renderer.domElement.addEventListener('pointerup', pointerUp); renderer.domElement.addEventListener('pointerleave', pointerLeave);
    const contextLost = (event: Event) => { event.preventDefault(); setFailed(true); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    const resize = () => { const width = host.clientWidth; const height = host.clientHeight; if (!width || !height) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(36) / 2) / Math.min(1, camera.aspect))); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize(); update();
    const render = () => {
      animation = requestAnimationFrame(render);
      if (document.hidden) return;
      controls.autoRotate = !reducedMotion && !!current.current.autoRotate && !current.current.selectedCountry && !flyTarget;
      if (flyTarget) { camera.position.lerp(flyTarget, reducedMotion ? 1 : 0.055); if (camera.position.distanceTo(flyTarget) < 0.005) flyTarget = null; }
      if (pinRings && !reducedMotion) (pinRings.material as THREE.MeshBasicMaterial).opacity = 0.61 + Math.sin(performance.now() * 0.0018) * 0.1;
      controls.update(); renderer.render(scene, camera);
      const occupied: { x: number; y: number; width: number }[] = []; const width = host.clientWidth; const height = host.clientHeight; const maximum = width < 440 ? 6 : width < 650 ? 9 : 13;
      for (const label of majorLabels) {
        const screen = label.position.clone().project(camera); const x = (screen.x * 0.5 + 0.5) * width; const y = (-screen.y * 0.5 + 0.5) * height;
        const occluded = label.position.clone().normalize().dot(camera.position) < 1.08;
        const overlaps = occupied.some(previous => Math.abs(previous.x - x) < (previous.width + label.width) / 2 + 9 && Math.abs(previous.y - y) < 22);
        const visible = !occluded && !overlaps && occupied.length < maximum && screen.z < 1 && x > label.width / 2 + 6 && x < width - label.width / 2 - 6 && y > 16 && y < height - 16;
        label.element.style.display = visible ? 'block' : 'none';
        if (visible) { label.element.style.left = `${x}px`; label.element.style.top = `${y}px`; label.element.style.color = current.current.selectedCountry === label.code ? '#ffcc96' : '#d0e8e8'; occupied.push({ x, y, width: label.width }); }
      }
    }; render();
    return () => {
      disposed = true; mapAbort?.abort(); cancelAnimationFrame(animation); observer.disconnect(); controls.dispose(); sceneApi.current = null;
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('pointerleave', pointerLeave); renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      disposeObject(scene); mapTexture?.dispose(); renderer.dispose(); renderer.domElement.remove(); labelLayer.remove();
    };
  }, []);

  useEffect(() => { sceneApi.current?.update(); setHover(null); }, [props.events, props.selectedCountry, props.activeEventId]);
  useEffect(() => { if (props.resetToken) sceneApi.current?.reset(); }, [props.resetToken]);
  useEffect(() => { sceneApi.current?.loadMap(props.mapYear || 1969, props.historicalBorders !== false); }, [props.mapYear, props.historicalBorders]);
  useEffect(() => { sceneApi.current?.refreshLocale(); }, [props.locale]);

  return <div ref={hostRef} className="history-globe" style={{ position: 'absolute', inset: 0 }}>
    {!ready && !failed && !mapWarning && <div role="status" style={{ position: 'absolute', zIndex: 3, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 8, color: '#9bc7c4', background: '#081c2add', border: '1px solid #4b777733', padding: '10px 14px', borderRadius: 20, whiteSpace: 'nowrap', fontSize: 11, pointerEvents: 'none' }}><LoaderCircle size={14} className="spin" /><span>{text.loading}</span></div>}
    {mapWarning && !failed && <div role="status" style={{ position: 'absolute', left: '12%', right: '12%', bottom: 80, color: '#e9be83', fontSize: 11, lineHeight: 1.7, textAlign: 'center', padding: '8px 12px', background: '#15222ce8', border: '1px solid #69553b', borderRadius: 6, pointerEvents: 'none' }}>{text[mapWarning]}</div>}
    {failed && <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center', padding: 32, color: '#b5ccd2', background: 'radial-gradient(circle, #103747, transparent 65%)' }}><span style={{ fontSize: 64 }}>◎</span><p>{text.webglUnavailable}</p><p style={{ fontSize: 12, color: '#7898a4' }}>{text.fallback}</p></div>}
    {hover && !failed && <div style={{ position: 'absolute', zIndex: 3, left: Math.max(12, Math.min(hover.x + 15, (hostRef.current?.clientWidth || 600) - 260)), top: Math.max(hover.y - 40, 12), padding: '9px 13px', borderRadius: 7, border: '1px solid #36515d', color: '#e3efee', background: '#10212eec', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-line', maxWidth: 230, pointerEvents: 'none', boxShadow: '0 8px 32px #0005' }}>{hover.text}</div>}
  </div>;
}
