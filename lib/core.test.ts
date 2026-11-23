// Run: npm test  (node's built-in runner, TypeScript stripped natively)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { price, BUS_CLASSES, isBookable, manilaNow, addDays, network, connects } from './catalog.ts';
import { seedTrips } from './seed.ts';
import { padalaFee, maskName, DEFAULT_RATES } from './padala.ts';
import { seatName } from './layouts.ts';
import { verifySignature } from './paymongo.ts';

const TRIPS = seedTrips();

test('fee matches the source site (PHP 1,560 -> 97.12, PHP 2,900 -> 166.80)', () => {
  assert.equal(price(1560, 1).fee, 9712);
  assert.equal(price(2900, 1).fee, 16680);
  assert.equal(price(1135, 2).total, (113500 + 7502) * 2);
});

test('every bus class has unique seat ids and the advertised seat count', () => {
  for (const c of Object.values(BUS_CLASSES)) {
    assert.equal(c.layout.length, c.seats, c.id);
    assert.equal(new Set(c.layout.map((s) => s.id)).size, c.seats, c.id);
  }
});

test('catalog trips are well formed', () => {
  assert.ok(TRIPS.length > 40);
  for (const t of TRIPS) {
    assert.ok(t.pickups.length && t.dropoffs.length && t.fare > 0, t.id);
    for (const p of t.pickups) assert.match(p.time, /^\d{2}:\d{2}$/);
  }
});

test('booking window: past dates and departures within the hour are closed', () => {
  const trip = { ...TRIPS[0], pickups: [{ station: 'X', time: '20:00' }] };
  const at = (iso: string) => new Date(iso);
  const today = manilaNow(at('2026-11-23T10:00:00+08:00')).date;
  assert.equal(today, '2026-11-23');
  assert.equal(isBookable(trip, '2026-11-23', at('2026-11-23T18:59:00+08:00')), true);
  assert.equal(isBookable(trip, '2026-11-23', at('2026-11-23T19:01:00+08:00')), false);
  assert.equal(isBookable(trip, '2026-11-22', at('2026-11-23T10:00:00+08:00')), false);
  assert.equal(isBookable(trip, addDays('2026-11-23', 61), at('2026-11-23T10:00:00+08:00')), false);
  assert.equal(isBookable(trip, 'nope', at('2026-11-23T10:00:00+08:00')), false);
});

test('webhook signature: accepts a valid test signature, rejects tampering and wrong mode', () => {
  const secret = 'whsk_test';
  const body = '{"data":{}}';
  const sig = createHmac('sha256', secret).update(`123.${body}`).digest('hex');
  assert.equal(verifySignature(`t=123,te=${sig},li=`, body, secret, false), true);
  assert.equal(verifySignature(`t=123,te=${sig},li=`, body + ' ', secret, false), false);
  assert.equal(verifySignature(`t=123,te=${sig},li=`, body, secret, true), false);
  assert.equal(verifySignature(null, body, secret, false), false);
  assert.equal(verifySignature(`t=123,te=${sig}`, body, '', false), false);
});

test('route network only offers pairs a trip serves', () => {
  const { pairs } = network(TRIPS);
  assert.ok(pairs['EDSA Cubao'].includes('Naga CBD'));
  assert.ok(!pairs['EDSA Cubao'].includes('EDSA Cubao'));
  assert.equal(connects(TRIPS, 'EDSA Cubao', 'Naga CBD'), true);
  assert.equal(connects(TRIPS, 'Naga CBD', 'Gubat'), false);
});

test('padala fee: base + per started kg + valuation', () => {
  assert.equal(padalaFee(DEFAULT_RATES, 1, 0), 15000 + 2500);
  assert.equal(padalaFee(DEFAULT_RATES, 2.1, 100000), 15000 + 2500 * 3 + 1000);
  assert.equal(maskName('Juan Dela Cruz'), 'Juan C.');
  assert.equal(maskName('Ana'), 'Ana');
});

test('seat names spell out sleeper decks', () => {
  assert.equal(seatName('L3'), 'Lower berth 3');
  assert.equal(seatName('U10'), 'Upper berth 10');
  assert.equal(seatName('12'), 'Seat 12');
});
