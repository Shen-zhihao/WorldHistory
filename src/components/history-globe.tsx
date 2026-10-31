'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { countryByCode, countryByNumeric } from '@/lib/countries';
import { getMapEra } from '@/lib/map-eras';
import type { HistoryEvent } from '@/lib/types';
import type { Locale } from '@/lib/locale';
import { createGlobeFlight, sampleGlobeFlight, type GlobeFlight } from '@/lib/globe-motion';
import { GlobePointerGesture } from '@/lib/globe-gesture';

export type GlobeTheme = 'light' | 'dark';

const globePalettes = {
  dark: { ocean: '#071b31', land: '#40566a', selectedLand: '#8799a7', surface: 0xd3e0e9, emissive: 0x071522, ambient: 0xb7c7d4, ambientIntensity: 0.82, sunlight: 0xf4f4ec, sunlightIntensity: 2.2, rim: 0x819eb7, rimIntensity: 1.05, specular: 0x2d4557, atmosphere: 0x668ba6, atmosphereOpacity: 0.23, grid: 0x55768b, gridOpacity: 0.10, borders: 0x9ab3c2, borderOpacity: 0.40, selectedBorder: 0xf0e8da, pin: 0xd4ae7e, pinActive: 0xffead0, ring: 0xcaa577, stem: 0xb99970, label: '#e1ebf2', selectedLabel: '#fff0d8', labelShadow: '0 1px 3px #061725,0 0 7px #061725,0 0 12px #061725' },
  light: { ocean: '#103754', land: '#718a9a', selectedLand: '#a3b4bf', surface: 0xe7eff4, emissive: 0x081826, ambient: 0xd3dfe8, ambientIntensity: 0.95, sunlight: 0xfff9ed, sunlightIntensity: 2.1, rim: 0x8aa5bc, rimIntensity: 0.75, specular: 0x3e5769, atmosphere: 0x6088a5, atmosphereOpacity: 0.20, grid: 0x668ba0, gridOpacity: 0.09, borders: 0xc2d3dd, borderOpacity: 0.48, selectedBorder: 0xffedcf, pin: 0xc59d70, pinActive: 0xffe9c8, ring: 0xbe9665, stem: 0xa47e50, label: '#f1f6f9', selectedLabel: '#fff2db', labelShadow: '0 1px 3px #102d43,0 0 5px #102d43,0 0 9px #102d43' },
} as const;

type Coordinate = [number, number];
type Polygon = Coordinate[][];
type GeoCountry = { code: string; name: string; polygons: Polygon[]; historical?: boolean; subject?: string | null };
type HistoricalGeoJSON = { features: { properties: { name: string; subject?: string | null; code: string | null }; geometry: { type: string; coordinates: Polygon | Polygon[] } }[] };
type Topology = { transform: { scale: Coordinate; translate: Coordinate }; arcs: Coordinate[][]; objects: { countries: { geometries: { id: string; properties: { name: string }; type: string; arcs: number[][] | number[][][] }[] } } };

export interface HistoryGlobeProps {
  events: HistoryEvent[];
  selectedCountry: string | null;
  selectedTerritory?: string | null;
  onCountrySelect: (code: string | null) => void;
  onEventSelect: (event: HistoryEvent) => void;
  activeEventId?: string | null;
  autoRotate?: boolean;
  resetToken?: number;
  mapYear?: number;
  historicalBorders?: boolean;
  locale?: Locale;
  theme?: GlobeTheme;
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

function landTexture(items: GeoCountry[], selectedCode?: string | null, selectedName?: string | null, theme: GlobeTheme = 'light') {
  const palette = globePalettes[theme];
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = palette.ocean; ctx.fillRect(0, 0, canvas.width, canvas.height);
  items.forEach(country => country.polygons.forEach(polygon => {
    ctx.beginPath();
    polygon.forEach(ring => ring.forEach(([lng, lat], i) => {
      const x = (lng + 180) / 360 * canvas.width; const y = (90 - lat) / 180 * canvas.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }));
    const selected = (selectedCode && country.code === selectedCode) || (selectedName && country.name === selectedName);
    ctx.fillStyle = selected ? palette.selectedLand : palette.land; ctx.fill('evenodd');
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
  const sceneApi = useRef<{ update: () => void; reset: () => void; loadMap: (year: number, historical: boolean) => void; refreshLocale: () => void; refreshTheme: () => void } | null>(null);
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mapWarning, setMapWarning] = useState<'historicalMapUnavailable' | 'mapUnavailable' | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const getPalette = () => globePalettes[current.current.theme || 'light'];
    const initialPalette = getPalette();
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
    const overviewDistance = 3.65;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshPhongMaterial({ color: initialPalette.surface, emissive: initialPalette.emissive, emissiveIntensity: 0.20, shininess: 12, specular: initialPalette.specular }));
    const ambient = new THREE.AmbientLight(initialPalette.ambient, initialPalette.ambientIntensity);
    scene.add(globe, ambient);
    // A consistent, soft studio key keeps the sphere's depth visible on either hemisphere.
    const keyOffset = new THREE.Vector3(-3.4, 2.4, 3.8);
    const rimOffset = new THREE.Vector3(3.2, 0.5, -2);
    const sunlight = new THREE.DirectionalLight(initialPalette.sunlight, initialPalette.sunlightIntensity); scene.add(sunlight);
    const rimlight = new THREE.DirectionalLight(initialPalette.rim, initialPalette.rimIntensity); scene.add(rimlight);
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 48), new THREE.ShaderMaterial({
      uniforms: { rimColor: { value: new THREE.Color(initialPalette.atmosphere) }, rimOpacity: { value: initialPalette.atmosphereOpacity } },
      vertexShader: 'varying vec3 vNormal;varying vec3 vPosition;void main(){vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.0);vPosition=p.xyz;gl_Position=projectionMatrix*p;}',
      fragmentShader: 'uniform vec3 rimColor;uniform float rimOpacity;varying vec3 vNormal;varying vec3 vPosition;void main(){float edge=1.0-max(0.0,dot(normalize(vNormal),normalize(-vPosition)));float intensity=pow(edge,4.5);gl_FragColor=vec4(rimColor,intensity*rimOpacity);}',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    })); scene.add(atmosphere);
    const gridPositions: number[] = [];
    for (let lat = -60; lat <= 60; lat += 30) for (let lng = -180; lng < 180; lng += 3) {
      const a = spherePosition(lat, lng, 1.001); const b = spherePosition(lat, lng + 3, 1.001); gridPositions.push(...a.toArray(), ...b.toArray());
    }
    for (let lng = -180; lng < 180; lng += 30) for (let lat = -90; lat < 90; lat += 3) {
      const a = spherePosition(lat, lng, 1.001); const b = spherePosition(lat + 3, lng, 1.001); gridPositions.push(...a.toArray(), ...b.toArray());
    }
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3)), new THREE.LineBasicMaterial({ color: initialPalette.grid, transparent: true, opacity: initialPalette.gridOpacity })); scene.add(grid);
    const starPositions: number[] = [];
    for (let i = 0; i < 650; i++) {
      const u = ((i * 0.61803398875) % 1) * 2 - 1; const angle = i * 2.399963;
      starPositions.push(Math.sqrt(1 - u * u) * Math.cos(angle) * 14, u * 14, Math.sqrt(1 - u * u) * Math.sin(angle) * 14);
    }
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3)), new THREE.PointsMaterial({ color: 0x9fb1c0, size: 0.014, transparent: true, opacity: 0.35, sizeAttenuation: true })); scene.add(stars);
    const pins = new THREE.Group(); scene.add(pins);
    let pinEvents: HistoryEvent[] = []; let pinRings: THREE.InstancedMesh | null = null;
    let geoCountries: GeoCountry[] = []; let selectedBorder: THREE.LineSegments | null = null; let mapTexture: THREE.Texture | null = null; let countryBorders: THREE.LineSegments | null = null; let displayedMapYear = current.current.mapYear || 1969;
    let flight: GlobeFlight | null = null;
    let lastCountry: string | null | undefined; let lastTerritory: string | null | undefined; let lastEvent: string | null | undefined;
    let paintedSelection = '';
    const selectionKey = () => JSON.stringify([current.current.selectedCountry, current.current.selectedTerritory || null, current.current.theme || 'light']);
    const beginFlight = (destination: THREE.Vector3) => {
      const origin = camera.position.clone();
      // Consume residual control inertia without rendering its intermediate pose.
      controls.autoRotate = false;
      controls.enableDamping = false;
      controls.update(0);
      camera.position.copy(origin);
      controls.update(0);
      controls.enableDamping = true;
      flight = createGlobeFlight(origin, destination, performance.now(), reducedMotion);
      setHover(null);
    };
    const focusPosition = (lat: number, lng: number) => spherePosition(lat, lng, Math.max(overviewDistance, camera.position.length()));
    const cancelFlight = () => { flight = null; setHover(null); };
    controls.addEventListener('start', cancelFlight);
    const selectTerritory = (country: GeoCountry, point?: Coordinate) => {
      const code = country.code || null;
      if (!code && point) beginFlight(focusPosition(point[1], point[0]));
      else if (code && code === current.current.selectedCountry && countryByCode[code]) {
        const reference = countryByCode[code]; beginFlight(focusPosition(reference.lat, reference.lng));
      }
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
        button.style.cssText = `position:absolute;display:none;transform:translate(-50%,-50%);background:transparent;border:0;padding:4px 3px;color:${getPalette().label};font:500 10px/1.1 system-ui,sans-serif;letter-spacing:.02em;text-shadow:${getPalette().labelShadow};max-width:120px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;pointer-events:auto;cursor:pointer`;
        button.title = territoryDescription(country, displayedMapYear, current.current.locale || 'zh-CN');
        button.setAttribute('aria-label', button.title);
        button.addEventListener('click', event => { event.stopPropagation(); selectTerritory(country, [lng, lat]); });
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
    const refreshTheme = () => {
      if (disposed) return;
      const palette = getPalette();
      const material = globe.material as THREE.MeshPhongMaterial;
      material.color.setHex(palette.surface); material.emissive.setHex(palette.emissive); material.specular.setHex(palette.specular);
      ambient.color.setHex(palette.ambient); ambient.intensity = palette.ambientIntensity;
      sunlight.color.setHex(palette.sunlight); sunlight.intensity = palette.sunlightIntensity;
      rimlight.color.setHex(palette.rim); rimlight.intensity = palette.rimIntensity;
      atmosphere.material.uniforms.rimColor.value.setHex(palette.atmosphere);
      atmosphere.material.uniforms.rimOpacity.value = palette.atmosphereOpacity;
      atmosphere.material.blending = (current.current.theme || 'light') === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending;
      atmosphere.material.needsUpdate = true;
      grid.material.color.setHex(palette.grid); grid.material.opacity = palette.gridOpacity;
      stars.visible = (current.current.theme || 'light') === 'dark';
      if (countryBorders) { const border = countryBorders.material as THREE.LineBasicMaterial; border.color.setHex(palette.borders); border.opacity = palette.borderOpacity; }
      if (selectedBorder) (selectedBorder.material as THREE.LineBasicMaterial).color.setHex(palette.selectedBorder);
      if (mapTexture) {
        const previousTexture = mapTexture;
        mapTexture = landTexture(geoCountries, current.current.selectedCountry, current.current.selectedTerritory, current.current.theme || 'light');
        material.map = mapTexture; previousTexture.dispose(); paintedSelection = selectionKey();
      }
      // Recolor existing batches in place; theme switching must not touch camera flights.
      for (const object of pins.children) {
        if (object instanceof THREE.InstancedMesh) {
          pinEvents.forEach((event, index) => object.setColorAt(index, new THREE.Color(current.current.activeEventId === event.id ? palette.pinActive : object === pinRings ? palette.ring : palette.pin)));
          if (object.instanceColor) object.instanceColor.needsUpdate = true;
        } else if (object instanceof THREE.LineSegments) (object.material as THREE.LineBasicMaterial).color.setHex(palette.stem);
      }
      for (const label of majorLabels) label.element.style.textShadow = palette.labelShadow;
      setHover(null);
    };
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
          dots.setMatrixAt(index, matrix.matrix); dots.setColorAt(index, new THREE.Color(active ? getPalette().pinActive : getPalette().pin));
          matrix.scale.setScalar(active ? 1.35 : 1); matrix.lookAt(position.clone().multiplyScalar(2)); matrix.updateMatrix();
          rings.setMatrixAt(index, matrix.matrix); rings.setColorAt(index, new THREE.Color(active ? getPalette().pinActive : getPalette().ring));
          stemPositions.push(...position.toArray(), ...position.clone().multiplyScalar(active ? 1.14 : 1.08).toArray());
        });
        dots.instanceMatrix.needsUpdate = true; rings.instanceMatrix.needsUpdate = true;
        if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
        if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
        dots.computeBoundingSphere(); rings.computeBoundingSphere();
        const stems = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(stemPositions, 3)), new THREE.LineBasicMaterial({ color: getPalette().stem, transparent: true, opacity: 0.62 }));
        pins.add(dots, rings, stems); pinRings = rings;
      }
      if (selectedBorder) { scene.remove(selectedBorder); disposeObject(selectedBorder); selectedBorder = null; }
      const selected = geoCountries.filter(country => country.code === current.current.selectedCountry || (current.current.selectedTerritory && country.name === current.current.selectedTerritory));
      if (selected.length) {
        selectedBorder = new THREE.LineSegments(borderGeometry(selected, 1.009), new THREE.LineBasicMaterial({ color: getPalette().selectedBorder, transparent: true, opacity: 1 })); scene.add(selectedBorder);
      }
      if (mapTexture && paintedSelection !== selectionKey()) {
        const previousTexture = mapTexture;
        mapTexture = landTexture(geoCountries, current.current.selectedCountry, current.current.selectedTerritory, current.current.theme || 'light');
        (globe.material as THREE.MeshPhongMaterial).map = mapTexture;
        previousTexture.dispose(); paintedSelection = selectionKey();
      }
      if (lastCountry !== current.current.selectedCountry && current.current.selectedCountry) {
        const country = countryByCode[current.current.selectedCountry];
        if (country) beginFlight(focusPosition(country.lat, country.lng));
      } else if (!current.current.selectedCountry && !current.current.selectedTerritory && (lastCountry || lastTerritory)) {
        // Leave the user on the hemisphere they were exploring when returning to the world view.
        beginFlight(camera.position.clone().normalize().multiplyScalar(Math.max(overviewDistance, camera.position.length())));
      }
      if (lastEvent !== current.current.activeEventId && current.current.activeEventId) {
        const event = current.current.events.find(item => item.id === current.current.activeEventId);
        if (event?.countryCodes.length && Number.isFinite(event.lat) && Number.isFinite(event.lng)) beginFlight(focusPosition(event.lat, event.lng));
      }
      lastCountry = current.current.selectedCountry;
      lastTerritory = current.current.selectedTerritory;
      lastEvent = current.current.activeEventId;
    };
    const reset = () => { beginFlight(spherePosition(25, 90, overviewDistance)); };
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
        mapTexture?.dispose(); mapTexture = landTexture(geoCountries, current.current.selectedCountry, current.current.selectedTerritory, current.current.theme || 'light'); paintedSelection = selectionKey(); (globe.material as THREE.MeshPhongMaterial).map = mapTexture; globe.material.needsUpdate = true;
        if (countryBorders) { scene.remove(countryBorders); disposeObject(countryBorders); }
        countryBorders = new THREE.LineSegments(borderGeometry(geoCountries), new THREE.LineBasicMaterial({ color: getPalette().borders, transparent: true, opacity: getPalette().borderOpacity })); scene.add(countryBorders);
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
    sceneApi.current = { update, reset, loadMap, refreshLocale, refreshTheme };
    refreshTheme();
    loadMap(current.current.mapYear || 1969, current.current.historicalBorders !== false);
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); const gesture = new GlobePointerGesture();
    const hitTest = (event: PointerEvent): { kind: 'event'; event: HistoryEvent } | { kind: 'country'; country: GeoCountry; point: Coordinate } | null => {
      const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const globeHit = raycaster.intersectObject(globe)[0];
      if (!globeHit) return null;
      const pinHit = raycaster.intersectObjects(pins.children.filter(object => object.userData.isEventPins)).find(hit => hit.instanceId !== undefined && hit.distance <= globeHit.distance + 0.04);
      if (pinHit?.instanceId !== undefined && pinEvents[pinHit.instanceId]) return { kind: 'event', event: pinEvents[pinHit.instanceId] };
      const normal = globeHit.point.clone().normalize();
      const point: Coordinate = [Math.atan2(normal.x, normal.z) * 180 / Math.PI, Math.asin(normal.y) * 180 / Math.PI];
      const country = geoCountries.find(item => insideCountry(point, item));
      return country ? { kind: 'country', country, point } : null;
    };
    const pointerDown = (event: PointerEvent) => { gesture.down(event.pointerId,event.clientX,event.clientY); cancelFlight(); };
    const pointerMove = (event: PointerEvent) => {
      gesture.move(event.pointerId,event.clientX,event.clientY);
      if (event.buttons || gesture.active) { setHover(null); return; }
      const hit = hitTest(event); renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      const rect = host.getBoundingClientRect();
      setHover(hit ? { text: hit.kind === 'event' ? hit.event.title : territoryDescription(hit.country, displayedMapYear, current.current.locale || 'zh-CN'), x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
    };
    const pointerUp = (event: PointerEvent) => {
      if (!gesture.up(event.pointerId,event.clientX,event.clientY)) return;
      const hit = hitTest(event);
      if (hit?.kind === 'event') current.current.onEventSelect(hit.event);
      else if (hit?.kind === 'country') selectTerritory(hit.country, hit.point);
    };
    const pointerLeave = () => setHover(null);
    const pointerCancel = (event: PointerEvent) => { gesture.cancel(event.pointerId); setHover(null); };
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointermove', pointerMove); renderer.domElement.addEventListener('pointerup', pointerUp); renderer.domElement.addEventListener('pointerleave', pointerLeave); renderer.domElement.addEventListener('pointercancel', pointerCancel);
    const contextLost = (event: Event) => { event.preventDefault(); setFailed(true); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    const resize = () => { const width = host.clientWidth; const height = host.clientHeight; if (!width || !height) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(36) / 2) / Math.min(1, camera.aspect))); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize(); update();
    let previousFrame = performance.now();
    const render = (now: number) => {
      animation = requestAnimationFrame(render);
      const delta = Math.max(0, Math.min((now - previousFrame) / 1000, 0.05)); previousFrame = now;
      if (document.hidden) return;
      controls.autoRotate = !reducedMotion && !!current.current.autoRotate && !current.current.selectedCountry && !current.current.selectedTerritory && !flight;
      if (flight) {
        const sample = sampleGlobeFlight(flight, now);
        camera.position.copy(sample.position); camera.lookAt(controls.target);
        if (sample.done) { flight = null; controls.update(0); }
      } else {
        controls.dampingFactor = 1 - Math.pow(0.93, delta * 60);
        controls.update(delta);
      }
      sunlight.position.copy(keyOffset).applyQuaternion(camera.quaternion);
      rimlight.position.copy(rimOffset).applyQuaternion(camera.quaternion);
      if (pinRings && !reducedMotion) (pinRings.material as THREE.MeshBasicMaterial).opacity = 0.61 + Math.sin(now * 0.0018) * 0.1;
      renderer.render(scene, camera);
      const occupied: { x: number; y: number; width: number }[] = []; const width = host.clientWidth; const height = host.clientHeight; const maximum = width < 440 ? 6 : width < 650 ? 9 : 13;
      for (const label of majorLabels) {
        const screen = label.position.clone().project(camera); const x = (screen.x * 0.5 + 0.5) * width; const y = (-screen.y * 0.5 + 0.5) * height;
        const occluded = label.position.clone().normalize().dot(camera.position) < 1.08;
        const overlaps = occupied.some(previous => Math.abs(previous.x - x) < (previous.width + label.width) / 2 + 9 && Math.abs(previous.y - y) < 22);
        const visible = !occluded && !overlaps && occupied.length < maximum && screen.z < 1 && x > label.width / 2 + 6 && x < width - label.width / 2 - 6 && y > 16 && y < height - 16;
        label.element.style.display = visible ? 'block' : 'none';
        if (visible) { label.element.style.left = `${x}px`; label.element.style.top = `${y}px`; label.element.style.color = current.current.selectedCountry === label.code ? getPalette().selectedLabel : getPalette().label; occupied.push({ x, y, width: label.width }); }
      }
    }; render(performance.now());
    return () => {
      disposed = true; mapAbort?.abort(); cancelAnimationFrame(animation); observer.disconnect(); controls.removeEventListener('start', cancelFlight); controls.dispose(); sceneApi.current = null;
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('pointerleave', pointerLeave); renderer.domElement.removeEventListener('pointercancel', pointerCancel); renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      disposeObject(scene); mapTexture?.dispose(); renderer.dispose(); renderer.domElement.remove(); labelLayer.remove();
    };
  }, []);

  useEffect(() => { sceneApi.current?.update(); setHover(null); }, [props.events, props.selectedCountry, props.selectedTerritory, props.activeEventId]);
  useEffect(() => { if (props.resetToken) sceneApi.current?.reset(); }, [props.resetToken]);
  useEffect(() => { sceneApi.current?.loadMap(props.mapYear || 1969, props.historicalBorders !== false); }, [props.mapYear, props.historicalBorders]);
  useEffect(() => { sceneApi.current?.refreshLocale(); }, [props.locale]);
  useEffect(() => { sceneApi.current?.refreshTheme(); }, [props.theme]);

  return <div ref={hostRef} className="history-globe" style={{ position: 'absolute', inset: 0 }}>
    {!ready && !failed && !mapWarning && <div role="status" style={{ position: 'absolute', zIndex: 3, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', background: 'var(--panel)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: 20, whiteSpace: 'nowrap', fontSize: 11, pointerEvents: 'none' }}><LoaderCircle size={14} className="spin" /><span>{text.loading}</span></div>}
    {mapWarning && !failed && <div role="status" style={{ position: 'absolute', left: '12%', right: '12%', bottom: 80, color: 'var(--text)', fontSize: 11, lineHeight: 1.7, textAlign: 'center', padding: '8px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 6, pointerEvents: 'none' }}>{text[mapWarning]}</div>}
    {failed && <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center', padding: 32, color: 'var(--text)', background: 'var(--panel)' }}><span style={{ fontSize: 64 }}>◎</span><p>{text.webglUnavailable}</p><p style={{ fontSize: 12, color: 'var(--muted)' }}>{text.fallback}</p></div>}
    {hover && !failed && <div style={{ position: 'absolute', zIndex: 3, left: Math.max(12, Math.min(hover.x + 15, (hostRef.current?.clientWidth || 600) - 260)), top: Math.max(hover.y - 40, 12), padding: '9px 13px', borderRadius: 7, border: '1px solid var(--line)', color: 'var(--text)', background: 'var(--panel)', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-line', maxWidth: 230, pointerEvents: 'none', boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)' }}>{hover.text}</div>}
  </div>;
}
