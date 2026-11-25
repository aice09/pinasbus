import { test } from 'node:test';
import assert from 'node:assert/strict';
import { along, bearing, cumulative, km, turn, type LngLat } from './journey.ts';

test('distance and bearing', () => {
  assert.ok(Math.abs(km([121, 14], [121, 15]) - 111.2) < 0.5);
  assert.ok(Math.abs(bearing([121, 14], [121, 15]) - 0) < 0.01);
  assert.ok(Math.abs(bearing([121, 14], [122, 14]) - 90) < 0.2);
});

test('point along a line', () => {
  const line: LngLat[] = [[121, 14], [121, 15], [122, 15]];
  const cum = cumulative(line);
  const mid = along(line, cum, cum[1] / 2);
  assert.equal(mid.i, 0);
  assert.ok(Math.abs(mid.p[1] - 14.5) < 1e-9);
  assert.deepEqual(along(line, cum, -1).p, line[0]);
  assert.deepEqual(along(line, cum, 1e9).p, line[2]);
  assert.equal(along(line, cum, cum[1] + 1).i, 1);
});

test('turning takes the short way', () => {
  assert.equal(turn(350, 10, 0.5), 0);
  assert.equal(turn(10, 350, 0.5), 0);
  assert.equal(turn(90, 180, 1), 180);
});
