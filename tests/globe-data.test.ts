import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countries, countryByCode, countryByNumeric, inferCountryCodes } from '../src/lib/countries';

test('geographic references cover world countries with valid coordinates', () => {
  assert.ok(countries.length >= 240);
  assert.equal(new Set(countries.map(country => country.code)).size, countries.length);
  for (const country of countries) {
    assert.ok(country.lat >= -90 && country.lat <= 90, country.code);
    assert.ok(country.lng >= -180 && country.lng <= 180, country.code);
  }
  assert.equal(countryByNumeric['840'].code, 'US');
  assert.equal(countryByCode.CN.name, '中国');
});

test('country inference recognizes historical names and rejects substring matches', () => {
  assert.ok(inferCountryCodes('清朝与英国签署条约').includes('CN'));
  assert.ok(inferCountryCodes('清朝与英国签署条约').includes('GB'));
  assert.ok(inferCountryCodes('The Soviet Union launches Sputnik').includes('RU'));
  assert.ok(inferCountryCodes('Prussian armies clash with France').includes('DE'));
  assert.ok(inferCountryCodes('Apollo 11: NASA sends American astronauts to the moon.').includes('US'));
  assert.equal(inferCountryCodes('a popular cultural exhibition').includes('US'), false);
});

test('offline map contains compressed genuine country polygons', () => {
  const topology = JSON.parse(readFileSync('public/geo/countries-110m.json', 'utf8'));
  assert.ok(topology.objects.countries.geometries.length >= 170);
  assert.ok(topology.arcs.length > 100);
  assert.equal(topology.transform.scale.length, 2);
  assert.ok(topology.objects.countries.geometries.some((geometry: { id: string }) => String(geometry.id).padStart(3, '0') === '156'));
});
