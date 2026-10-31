import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { countryFocusBounds, countryMapName, decodeMapData, insideCountry, mapCountryPath, mapPoint, readMapData, type GeoCountry, type HistoricalGeoJSON, type Topology } from '../src/lib/map-geometry';

const modern = decodeMapData(JSON.parse(readFileSync('public/geo/countries-110m.json', 'utf8')) as Topology);

test('equirectangular world projection and country paths retain geographic positions', () => {
  assert.deepEqual(mapPoint(90, -180), { x: 0, y: 0 });
  assert.deepEqual(mapPoint(-90, 180), { x: 720, y: 360 });
  assert.deepEqual(mapPoint(0, 0), { x: 360, y: 180 });
  assert.ok(modern.length >= 170);
  for (const country of modern) {
    const path = mapCountryPath(country);
    assert.ok(path.startsWith('M'), country.name);
    assert.ok(!/NaN|Infinity|undefined/.test(path), country.name);
  }
  const china = modern.find(country => country.code === 'CN')!;
  const bounds = countryFocusBounds(china);
  assert.ok(bounds.x > 490 && bounds.x < 530);
  assert.ok(bounds.width > 100 && bounds.width < 150);
  assert.equal(countryMapName(china, 'zh-CN'), '中国');
});

test('date-line polygons unwrap locally and repeat without drawing a line through the whole world', () => {
  const country: GeoCountry = { code: 'XX', name: 'Dateline', polygons: [[[[170, 10], [-170, 10], [-170, -10], [170, -10], [170, 10]]]] };
  const subpaths = mapCountryPath(country).split('Z').filter(Boolean);
  assert.equal(subpaths.length, 3);
  for (const subpath of subpaths) {
    const points = [...subpath.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])]);
    assert.equal(Math.max(...points.map(point => point[0])) - Math.min(...points.map(point => point[0])), 40);
    for (let i = 1; i < points.length; i++) assert.ok(Math.abs(points[i][0] - points[i - 1][0]) <= 40);
  }
  const bounds = countryFocusBounds(country);
  assert.equal(bounds.width, 40);
  assert.equal(bounds.height, 40);
});

test('holes remain separate subpaths and distant possessions do not distort the main-country focus', () => {
  const country: GeoCountry = { code: 'XX', name: 'Islands', polygons: [
    [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]], [[5, 5], [10, 5], [10, 10], [5, 10], [5, 5]]],
    [[[150, -20], [151, -20], [151, -19], [150, -19], [150, -20]]],
  ] };
  assert.equal(insideCountry([2, 2], country), true);
  assert.equal(insideCountry([7, 7], country), false);
  assert.equal(insideCountry([150.5, -19.5], country), true);
  assert.equal(mapCountryPath(country).match(/M/g)?.length, 9);
  assert.deepEqual(countryFocusBounds(country), { x: 360, y: 140, width: 40, height: 40 });
  assert.deepEqual(countryFocusBounds({ code: '', name: 'Empty', polygons: [] }), { x: 0, y: 0, width: 720, height: 360 });
  const pointCountry: GeoCountry = { code: '', name: 'Small', polygons: [[[[1, 1], [1.01, 1], [1.01, 1.01], [1, 1.01], [1, 1]]]] };
  assert.equal(countryFocusBounds(pointCountry).width, 8);
});

test('compressed historical maps decode with historical names, subjects and direct browser response support', async () => {
  const bytes = new Uint8Array(readFileSync('public/geo/history/world_1960.geojson.gz'));
  const historical = decodeMapData(await readMapData(new Response(bytes)));
  assert.ok(historical.length > 100);
  assert.ok(historical.every(country => country.historical));
  assert.ok(historical.some(country => country.code === 'CN'));
  const raw = JSON.parse(gunzipSync(bytes).toString()) as HistoricalGeoJSON;
  assert.equal(historical.length, raw.features.filter(feature => ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)).length);
  const json = JSON.stringify({ features: [] });
  assert.deepEqual(await readMapData(new Response(json)), { features: [] });
  assert.deepEqual(await readMapData(new Response(new Uint8Array(gzipSync(json)))), { features: [] });
  await assert.rejects(readMapData(new Response('missing', { status: 404 })), /404/);
  const france = modern.find(country => country.code === 'FR')!;
  assert.ok(countryFocusBounds(france).width < 30, 'Metropolitan France, not Guiana, should determine focus');
  const russia = modern.find(country => country.code === 'RU')!;
  assert.ok(countryFocusBounds(russia).width < 360, 'Russia should not span the entire world because of the date line');
});
