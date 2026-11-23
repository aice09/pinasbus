// Run: npm test  (node's built-in runner, TypeScript stripped natively)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { bookable, manilaNow } from './catalog.ts';
import { checkLayout, layoutFor, PASSENGER_KINDS, seatName } from './layouts.ts';
import { DEFAULT_RATES, maskName, padalaFee } from './padala.ts';
import { verifySignature } from './paymongo.ts';
import { seatFee, seatPrice, segmentFare } from './pricing.ts';
import { can, canSeeTrip, PERMISSIONS, ROLES } from './rbac.ts';
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
  assert.equal(Object.keys(ROLES).length, 14);
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
