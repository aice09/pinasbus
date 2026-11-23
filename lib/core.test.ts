// Run: npm test  (node's built-in runner, TypeScript stripped natively)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { bookable, manilaNow } from './catalog.ts';
import { checkLayout, layoutFor, PASSENGER_KINDS, seatName } from './layouts.ts';
import { DEFAULT_RATES, maskName, padalaFee } from './padala.ts';
import { verifySignature } from './paymongo.ts';
import { seatFee, seatPrice, segmentFare } from './pricing.ts';
import { can, canSeeTrip, PERMISSIONS, ROLE_KIND, ROLES, rolesFor } from './rbac.ts';
import { along, haversine, lineLength, nearest, type LngLat } from './geo.ts';
import { hotp, totp, unbase32, base32, verifyTotp } from './totp.ts';
import { luhnDigit, newCardNumber, validCardNumber } from './cards.ts';
import { checkBags, DEFAULT_BAGGAGE, excessFee } from './baggage.ts';
import { simulate } from './tracking.ts';
import { DEFAULT_DISCOUNTS, releaseDue, seatAllowed } from './seatpolicy.ts';

test('online fee matches the source site (PHP 1,560 -> 97.12, PHP 2,900 -> 166.80)', () => {
  assert.equal(seatFee(156000), 9712);
  assert.equal(seatFee(290000), 16680);
});

test('segment fares are differences of cumulative stop fares, with the schedule adjustment', () => {
  const t = { stops: [{ fare: 0 }, { fare: 0 }, { fare: 1100 }, { fare: 1185 }], fare_adjust_pct: 0 };
  assert.equal(segmentFare(t, 1, 3), 118500);
  assert.equal(segmentFare(t, 2, 3), 8500);
  assert.equal(segmentFare({ ...t, fare_adjust_pct: 10 }, 0, 2), 121000);
  assert.equal(segmentFare({ ...t, fare_adjust_pct: '-50' }, 0, 3), 59250);
});

test('discounts apply before the online fee; terminal sales have no fee', () => {
  assert.deepEqual(seatPrice(100000, DEFAULT_DISCOUNTS, 'senior'), { fare: 80000, fee: seatFee(80000), total: 80000 + seatFee(80000) });
  assert.equal(seatPrice(100000, DEFAULT_DISCOUNTS, 'regular', false).total, 100000);
});

test('priority seats: eligible passengers only until released; anyone may take a regular seat; crew seats never', () => {
  assert.equal(seatAllowed('pwd', 'regular', false), false);
  assert.equal(seatAllowed('pwd', 'pwd', false), true);
  assert.equal(seatAllowed('pwd', 'regular', true), true);
  assert.equal(seatAllowed('regular', 'pwd', false), true);
  assert.equal(seatAllowed('senior', 'pwd', false), false);
  assert.equal(seatAllowed('priority', 'senior', false), true);
  assert.equal(seatAllowed('driver', 'regular', true), false);
  assert.equal(seatAllowed('unavailable', 'pwd', true), false);
  assert.equal(seatAllowed('reserved', 'regular', true), false);
});

test('release deadline is configurable and 0 means never', () => {
  const dep = new Date('2026-12-01T20:00:00+08:00');
  const p = { releaseHoursBefore: 2, releaseKinds: ['pwd' as const] };
  assert.equal(releaseDue(p, dep, new Date('2026-12-01T17:59:00+08:00')), false);
  assert.equal(releaseDue(p, dep, new Date('2026-12-01T18:00:00+08:00')), true);
  assert.equal(releaseDue({ ...p, releaseHoursBefore: 0 }, dep, new Date('2026-12-01T19:59:00+08:00')), false);
});

test('roles: fixed permissions, crew see only assigned trips', () => {
  assert.equal(Object.keys(ROLES).length, 18);
  assert.deepEqual(rolesFor('shipping_operator'), ['shipping_admin', 'vessel_operator']);
  assert.equal(ROLE_KIND.dispatcher, 'bus_operator');
  assert.equal(can('vessel_operator', 'ships.manage'), false);
  assert.equal(can('conductor', 'tracking.report'), true);
  for (const r of Object.values(ROLES)) for (const p of r.perms) assert.ok(p in PERMISSIONS, p);
  assert.equal(can('company_admin', 'users.manage'), true);
  assert.equal(can('dispatcher', 'users.manage'), false);
  assert.equal(can('cashier', 'bookings.sell'), true);
  assert.equal(can('auditor', 'bookings.refund'), false);
  assert.equal(can(null, 'trips.view'), false);
  const trip = { driver_id: 'u1', conductor_id: null };
  assert.equal(canSeeTrip('driver', 'u1', trip), true);
  assert.equal(canSeeTrip('driver', 'u2', trip), false);
  assert.equal(canSeeTrip('dispatcher', 'u2', trip), true);
});

test('template layouts are valid and include crew and priority seats', () => {
  for (const [k, n] of [['skybus', 36], ['elite', 25], ['regular', 47], ['nonac', 57], ['sleeper22', 22], ['royal', 28]] as const) {
    const l = layoutFor(k, n);
    assert.equal(checkLayout(l), null, k);
    assert.equal(l.filter((s) => PASSENGER_KINDS.includes(s.kind)).length, n, k);
    assert.ok(l.some((s) => s.kind === 'driver') && l.some((s) => s.kind === 'pwd'), k);
  }
});

test('layout validation rejects duplicates, overlaps and bad labels', () => {
  const s = { x: 0, row: 1, deck: 0 as const, berth: false, kind: 'regular' as const };
  assert.match(checkLayout([{ ...s, id: '1' }, { ...s, id: '1', x: 1 }])!, /twice/);
  assert.match(checkLayout([{ ...s, id: '1' }, { ...s, id: '2' }])!, /share/);
  assert.match(checkLayout([{ ...s, id: 'bad id' }])!, /label/);
  assert.match(checkLayout([{ ...s, id: 'DRV', kind: 'driver' }])!, /passenger/);
  assert.equal(checkLayout('nope'), 'A layout needs 1 to 120 positions.');
});

test('sales close an hour before boarding and open 60 days ahead', () => {
  const now = new Date('2026-11-24T10:00:00+08:00');
  assert.equal(manilaNow(now).date, '2026-11-24');
  assert.equal(bookable(new Date('2026-11-24T11:01:00+08:00'), now), true);
  assert.equal(bookable(new Date('2026-11-24T10:59:00+08:00'), now), false);
  assert.equal(bookable(new Date('2027-02-01T10:00:00+08:00'), now), false);
  assert.equal(bookable(null, now), false);
});

test('webhook signature: accepts a valid test signature, rejects tampering and wrong mode', () => {
  const secret = 'whsk_test', body = '{"data":{}}';
  const sig = createHmac('sha256', secret).update(`123.${body}`).digest('hex');
  assert.equal(verifySignature(`t=123,te=${sig},li=`, body, secret, false), true);
  assert.equal(verifySignature(`t=123,te=${sig},li=`, body + ' ', secret, false), false);
  assert.equal(verifySignature(`t=123,te=${sig},li=`, body, secret, true), false);
  assert.equal(verifySignature(null, body, secret, false), false);
});

test('padala fee and names', () => {
  assert.equal(padalaFee(DEFAULT_RATES, 2.1, 100000), 15000 + 2500 * 3 + 1000);
  assert.equal(maskName('Juan Dela Cruz'), 'Juan C.');
  assert.equal(seatName('L3'), 'Lower berth 3');
  assert.equal(seatName('DRV'), 'Driver');
});

test('geometry: distances, points along a line, nearest point', () => {
  const cubaoToNaga = haversine([121.0532, 14.6197], [123.1853, 13.6233]);
  assert.ok(cubaoToNaga > 250 && cubaoToNaga < 270, String(cubaoToNaga));
  const line: LngLat[] = [[121, 14], [121, 15], [122, 15]];
  assert.ok(Math.abs(lineLength(line) - (111.2 + 107.5)) < 2);
  assert.deepEqual(along(line, 0).point, [121, 14]);
  assert.deepEqual(along(line, 10_000).point, [122, 15]);
  const mid = along(line, 55.6).point;
  assert.ok(Math.abs(mid[1] - 14.5) < 0.01 && mid[0] === 121);
  assert.ok(nearest(line, [121.01, 14.5]).km < 1.2);
  assert.ok(Math.abs(nearest(line, [121.01, 14.5]).at - 55.6) < 1);
});

test('totp: RFC 6238 vector and drift window', () => {
  const secret = base32(Buffer.from('12345678901234567890'));
  assert.equal(unbase32(secret).toString(), '12345678901234567890');
  assert.equal(hotp(secret, 1), '287082'); // RFC 4226 test vector, counter 1
  assert.equal(totp(secret, 59_000), '287082'); // RFC 6238: T=59 s -> 94287082
  assert.equal(verifyTotp(secret, totp(secret, 1_000_000), 1_000_000 + 25_000), true);
  assert.equal(verifyTotp(secret, totp(secret, 1_000_000), 1_000_000 + 95_000), false);
  assert.equal(verifyTotp(secret, 'abcdef'), false);
});

test('card numbers carry a Luhn check digit', () => {
  assert.equal(luhnDigit('7992739871'), '3'); // classic Luhn example: 79927398713
  const n = newCardNumber('8800');
  assert.ok(validCardNumber(n) && n.startsWith('8800'));
  assert.equal(validCardNumber(n.slice(0, 15) + String((Number(n[15]) + 1) % 10)), false);
});

test('baggage: allowance, excess fee, per-bag and hold limits', () => {
  assert.equal(excessFee(40, 2, DEFAULT_BAGGAGE), 0);
  assert.equal(excessFee(41.2, 2, DEFAULT_BAGGAGE), 2 * 2000);
  const ctx = { existing: 0, existingCount: 0, seats: 1, maxBagKg: 20, holdLeftKg: 30, rules: DEFAULT_BAGGAGE };
  assert.equal(checkBags([{ weight: 18 }], ctx), null);
  assert.match(checkBags([{ weight: 21 }], ctx)!, /up to 20 kg/);
  assert.match(checkBags([{ weight: 18 }, { weight: 15 }], ctx)!, /hold has room/);
  assert.match(checkBags([{ weight: 1 }, { weight: 1 }, { weight: 1 }, { weight: 1 }], ctx)!, /bags per seat/);
});

test('simulation: deterministic, labelled, bounded', () => {
  const line: LngLat[] = [[121, 14], [122, 14]];
  const g = { line, source: 'straight' as const, stopsKm: [0, lineLength(line)] };
  const t = { departs_at: new Date('2026-12-01T00:00:00Z'), stops: [{ offset_min: 0 }, { offset_min: 120 }] as never, status: 'departed', mode: 'road' as const };
  const before = simulate(t, g, new Date('2026-11-30T23:00:00Z'));
  assert.equal(before.status, 'not_started');
  const mid = simulate(t, g, new Date('2026-12-01T01:00:00Z'));
  assert.equal(mid.simulated, true);
  assert.equal(mid.status, 'on_the_way');
  assert.ok(mid.travelledKm > 0 && mid.remainingKm > 0 && mid.maxKph >= mid.speedKph);
  assert.deepEqual(simulate(t, g, new Date('2026-12-01T01:00:00Z')), mid);
  assert.equal(simulate(t, g, new Date('2026-12-01T05:00:00Z')).status, 'arrived');
});
