import { countryByCode, countryByNumeric } from './countries';
import type { Locale } from './locale';

export type Coordinate = [number, number];
export type Polygon = Coordinate[][];
export type GeoCountry = { code: string; name: string; polygons: Polygon[]; historical?: boolean; subject?: string | null };
export type HistoricalGeoJSON = { features: { properties: { name: string; subject?: string | null; code: string | null }; geometry: { type: string; coordinates: Polygon | Polygon[] } }[] };
export type Topology = { transform: { scale: Coordinate; translate: Coordinate }; arcs: Coordinate[][]; objects: { countries: { geometries: { id: string; properties: { name: string }; type: string; arcs: number[][] | number[][][] }[] } } };

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
export const majorAnchors: [string, number, number][] = [
  ['CN', 35, 105], ['US', 39, -77], ['GB', 54, -2], ['FR', 47, 2], ['RU', 56, 40], ['JP', 36, 138],
  ['IN', 24, 78], ['BR', -15, -48], ['AU', -25, 135], ['CA', 47, -72], ['TR', 39, 33], ['DE', 52, 13],
  ['EG', 27, 30], ['ZA', -30, 25], ['IT', 43, 12], ['MX', 20, -100], ['ES', 40, -4], ['ID', -3, 117],
];

export function countryMapName(country: GeoCountry, locale: Locale, fallbackCode?: string) {
  if (country.historical) return locale === 'zh-CN' ? historicalNames[country.name] || country.name : country.name;
  const reference = countryByCode[country.code || fallbackCode || ''];
  return (locale === 'zh-CN' ? reference?.name : reference?.nameEn) || country.name;
}

export function territoryDescription(country: GeoCountry, year: number, locale: Locale) {
  const name = countryMapName(country, locale);
  const subject = country.subject && country.subject !== country.name ? (locale === 'zh-CN' ? historicalNames[country.subject] || country.subject : country.subject) : null;
  const reference = countryByCode[country.code];
  const filterName = (locale === 'zh-CN' ? reference?.name : reference?.nameEn) || country.code;
  const mapDate = country.historical ? (locale === 'zh-CN' ? `${year} 年边界快照` : `${year} border snapshot`) : (locale === 'zh-CN' ? '当代国界' : 'Contemporary borders');
  const action = country.code ? (locale === 'zh-CN' ? `以现代 ${filterName} 筛选事件` : `Filter events using present-day ${filterName}`) : (locale === 'zh-CN' ? '查看历史政权信息与事件' : 'Explore this historical territory and its events');
  return `${name}${subject ? ` · ${subject}` : ''}\n${mapDate}\n${action}`;
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
export function insideCountry(point: Coordinate, country: GeoCountry) {
  return country.polygons.some(polygon => insideRing(point, polygon[0]) && !polygon.slice(1).some(hole => insideRing(point, hole)));
}

export function decodeMapData(data: Topology | HistoricalGeoJSON): GeoCountry[] {
  if ('objects' in data) return decodeTopology(data);
  if (!Array.isArray(data.features)) throw new Error('Invalid map data');
  return data.features.filter(feature => feature.geometry && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)).map(feature => ({
    code: feature.properties.code || '', name: feature.properties.name, subject: feature.properties.subject, historical: true,
    polygons: feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates as Polygon] : feature.geometry.coordinates as Polygon[],
  }));
}

export async function readMapData(response: Response): Promise<Topology | HistoricalGeoJSON> {
  if (!response.ok) throw new Error(`Map request failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (signature[0] === 0x1f && signature[1] === 0x8b) {
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function mapPoint(lat: number, lng: number): { x: number; y: number } {
  return { x: (lng + 180) * 2, y: (90 - lat) * 2 };
}

function projectedRing(ring: Coordinate[]): Coordinate[] {
  let previous = 0;
  return ring.filter(point => point.every(Number.isFinite)).map(([lng, lat], index) => {
    const projected = mapPoint(lat, lng);
    let x = projected.x;
    if (index) x += Math.round((previous - x) / 720) * 720;
    previous = x;
    return [x, projected.y];
  });
}

function ringBounds(ring: Coordinate[]) {
  const xs = ring.map(point => point[0]); const ys = ring.map(point => point[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function projectedPolygon(polygon: Polygon): Polygon {
  const exterior = projectedRing(polygon[0] || []);
  if (!exterior.length) return [];
  const bounds = ringBounds(exterior);
  const center = (bounds.minX + bounds.maxX) / 2;
  const worldOffset = -Math.floor(center / 720) * 720;
  return [exterior.map(([x, y]) => [x + worldOffset, y] as Coordinate), ...polygon.slice(1).map(ring => {
    const hole = projectedRing(ring);
    if (!hole.length) return [];
    const holeBounds = ringBounds(hole);
    const alignment = Math.round((center - (holeBounds.minX + holeBounds.maxX) / 2) / 720) * 720;
    return hole.map(([x, y]) => [x + alignment + worldOffset, y] as Coordinate);
  })];
}

/** SVG paths repeat across the date line; clip only to the SVG viewport, not the world edge. */
export function mapCountryPath(country: GeoCountry): string {
  return country.polygons.map(projectedPolygon).flatMap(polygon => [-720, 0, 720].map(offset => polygon.map(ring => {
    if (ring.length < 3) return '';
    return ring.map(([x, y], index) => `${index ? 'L' : 'M'}${+(x + offset).toFixed(3)},${+y.toFixed(3)}`).join('') + 'Z';
  }).join(''))).join('');
}

function polygonArea(ring: Coordinate[]) {
  return Math.abs(ring.reduce((sum, [x, y], index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + x * next[1] - next[0] * y;
  }, 0)) / 2;
}

/** Focus the main landmass rather than distant islands or overseas possessions. */
export function countryFocusBounds(country: GeoCountry): { x: number; y: number; width: number; height: number } {
  const polygons = country.polygons.map(projectedPolygon).filter(polygon => polygon[0]?.length >= 3);
  const main = polygons.sort((a, b) => polygonArea(b[0]) - polygonArea(a[0]))[0]?.[0];
  if (!main) return { x: 0, y: 0, width: 720, height: 360 };
  const bounds = ringBounds(main);
  const width = Math.min(720, Math.max(8, bounds.maxX - bounds.minX));
  const height = Math.min(360, Math.max(8, bounds.maxY - bounds.minY));
  return { x: (bounds.minX + bounds.maxX - width) / 2, y: Math.max(0, Math.min(360 - height, (bounds.minY + bounds.maxY - height) / 2)), width, height };
}

