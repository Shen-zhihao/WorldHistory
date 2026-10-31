import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { createGlobeFlight, sampleGlobeFlight } from '../src/lib/globe-motion';

function position(lat: number, lng: number, radius = 3.65) {
  const phi = lat * Math.PI / 180; const theta = lng * Math.PI / 180;
  return new Vector3(radius * Math.cos(phi) * Math.sin(theta), radius * Math.sin(phi), radius * Math.cos(phi) * Math.cos(theta));
}

test('Asia to America follows an exterior great-circle orbit without the former chord plunge', () => {
  const from = position(25, 90); const to = position(39, -97, 3.2);
  const flight = createGlobeFlight(from, to, 100);
  const normal = from.clone().cross(to).normalize();
  let previousAngle = -1;
  for (let i = 0; i <= 120; i++) {
    const sample = sampleGlobeFlight(flight, 100 + flight.duration * i / 120);
    assert.ok(sample.position.toArray().every(Number.isFinite));
    assert.ok(sample.position.length() >= 3.2 - 1e-10);
    assert.ok(sample.position.length() <= 3.65 + 0.08 + 1e-10);
    assert.ok(Math.abs(sample.position.clone().normalize().dot(normal)) < 1e-8, 'orbit must stay in its great-circle plane');
    const angle = from.angleTo(sample.position);
    assert.ok(angle + 1e-7 >= previousAngle, 'flight may not reverse or overshoot'); previousAngle = angle;
  }
  assert.ok(sampleGlobeFlight(flight, 100).position.distanceTo(from) < 1e-12);
  const end = sampleGlobeFlight(flight, 100 + flight.duration);
  assert.ok(end.position.distanceTo(to) < 1e-12); assert.equal(end.done, true);
});

test('exact and nearly antipodal flights stay finite and outside the planet', () => {
  for (const to of [new Vector3(-3.65, 0, 0), new Vector3(-3.65, 1e-11, 0), new Vector3(0, -3.65, 0)]) {
    const from = to.y === -3.65 ? new Vector3(0, 3.65, 0) : new Vector3(3.65, 0, 0);
    const flight = createGlobeFlight(from, to, 0);
    for (let i = 0; i <= 200; i++) {
      const point = sampleGlobeFlight(flight, flight.duration * i / 200).position;
      assert.ok(point.toArray().every(Number.isFinite)); assert.ok(point.length() >= 3.65 - 1e-9);
    }
    assert.ok(sampleGlobeFlight(flight, flight.duration).position.distanceTo(to) < 1e-12);
  }
});

test('flight timing is independent of frame rate, with no movement for an already focused country', () => {
  const from = position(10, 20); const to = position(40, 140);
  const flight = createGlobeFlight(from, to, 500);
  for (const frameRate of [30, 60, 144]) for (let time = 500; time < 1100; time += 1000 / frameRate) sampleGlobeFlight(flight, time);
  const first = sampleGlobeFlight(flight, 1100).position;
  const second = sampleGlobeFlight(createGlobeFlight(from, to, 500), 1100).position;
  assert.ok(first.distanceTo(second) < 1e-12);
  const stationary = createGlobeFlight(from, from.clone(), 0);
  assert.equal(stationary.duration, 0); assert.ok(sampleGlobeFlight(stationary, 10).position.equals(from));
  const reduced = createGlobeFlight(from, to, 0, true);
  assert.equal(reduced.duration, 0); assert.ok(sampleGlobeFlight(reduced, 0).position.equals(to));
  assert.throws(() => createGlobeFlight(new Vector3(), to, 0), RangeError);
});

test('flight owns its input vectors so later user interaction cannot mutate a planned path', () => {
  const from = position(10, 20); const to = position(40, 140); const expected = to.clone();
  const flight = createGlobeFlight(from, to, 0); from.set(0, 0, 0); to.set(0, 0, 0);
  assert.ok(sampleGlobeFlight(flight, flight.duration).position.equals(expected));
});
