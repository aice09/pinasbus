// Integration check against a real Postgres: DATABASE_URL=... npm run test:db
// Builds a throwaway company ("itest-co") with a route, schedule and trip, then removes it.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { attachCheckout, byRef, hold, markPaid, releaseExpired, SeatsTaken } from './bookings.ts';
import { pool, q, ready } from './db.ts';
import { layoutFor } from './layouts.ts';
import { availability, ensureTrips, legOf, network, tripById, tripsOn } from './trips.ts';

const DATE = '2030-01-07';
let tripId = '', orgId = '';
async function clean() {
  await q(`delete from bookings where org_id in (select id from organizations where slug = 'itest-co')`);
  await q(`delete from organizations where slug = 'itest-co'`);
  await q(`delete from stations where name like 'Itest %'`);
}

before(async () => {
  await ready();
  await clean();
  const [o] = await q<{ id: string }>(`insert into organizations (kind, name, slug, settings) values ('bus_operator', 'Itest Co', 'itest-co', '{"seatPolicy":{"releaseHoursBefore":2,"releaseKinds":["pwd"]}}') returning id`);
  orgId = o.id;
  const [l] = await q<{ id: string }>(`insert into seat_layouts (org_id, name, seats) values ($1, 't', $2) returning id`, [orgId, JSON.stringify(layoutFor('skybus', 36))]);
  const stops = [{ name: 'Itest A', offset_min: 0, fare: 0, boarding: true, alighting: false }, { name: 'Itest B', offset_min: 60, fare: 100, boarding: true, alighting: true }, { name: 'Itest C', offset_min: 120, fare: 250, boarding: false, alighting: true }];
  const [r] = await q<{ id: string }>(`insert into routes (org_id, code, name, stops) values ($1, 'IT', 'Itest', $2) returning id`, [orgId, JSON.stringify(stops)]);
  await q(`insert into schedules (org_id, route_id, code, departure, layout_id, valid_from) values ($1, $2, 'IT1', '08:00', $3, '2030-01-01')`, [orgId, r.id, l.id]);
  await ensureTrips(DATE);
  tripId = (await tripsOn(DATE, orgId))[0].id;
});
after(async () => { await clean(); await pool().end(); });

const base = () => ({ org_id: orgId, trip_uuid: tripId, trip_id: 'IT1', travel_date: DATE, pickup: 'Itest A', dropoff: 'Itest C', name: 'T', email: 't@example.com', phone: '09170000000',
  fare_centavos: 100, fee_centavos: 10, total_centavos: 110, passengers: [] });

test('trip instances, legs and the route network come from the schedule', async () => {
  const t = (await tripById(tripId))!;
  assert.equal(t.org_id, orgId);
  assert.deepEqual(legOf(t, 'Itest B', 'Itest C'), { i: 1, j: 2 });
  assert.equal(legOf(t, 'Itest C', 'Itest A'), null);
  await ensureTrips(DATE); // idempotent
  assert.equal((await tripsOn(DATE, orgId)).length, 1);
  assert.ok((await network())['Itest A']?.includes('Itest C'));
});

test('holds, blocks double booking, confirms payment, recovers or flags late payments', async () => {
  const a = await hold({ ...base(), seats: ['10', '11'] });
  await assert.rejects(hold({ ...base(), seats: ['11', '12'] }), SeatsTaken);
  await attachCheckout(a.id, 'cs_itest_a');
  assert.equal((await markPaid('cs_itest_a', 'pay_1', 110))?.status, 'paid');
  assert.equal((await markPaid('cs_itest_a', 'pay_1', 110))?.status, 'paid');

  const b = await hold({ ...base(), seats: ['15'] });
  await attachCheckout(b.id, 'cs_itest_b');
  assert.equal((await markPaid('cs_itest_b', 'pay_2', 999))?.status, 'needs_refund');
  await hold({ ...base(), seats: ['15'] }); // seat freed by the refund case

  const c = await hold({ ...base(), seats: ['17'] });
  await attachCheckout(c.id, 'cs_itest_c');
  await q(`update bookings set expires_at = now() - interval '1 minute' where id = $1`, [c.id]);
  await releaseExpired();
  assert.equal((await byRef(c.ref))?.status, 'expired');
  await hold({ ...base(), seats: ['17'] });
  assert.equal((await markPaid('cs_itest_c', 'pay_3', 110))?.status, 'needs_refund');

  const d = await hold({ ...base(), seats: ['19'] });
  await attachCheckout(d.id, 'cs_itest_d');
  await q(`update bookings set expires_at = now() - interval '1 minute' where id = $1`, [d.id]);
  await releaseExpired();
  assert.equal((await markPaid('cs_itest_d', 'pay_4', 110))?.status, 'paid');
  assert.ok((await availability((await tripById(tripId))!)).taken.includes('19'));
});

test('priority seats release once at the deadline, skip sold seats, and are audited', async () => {
  const t = (await tripById(tripId))!;
  const early = await availability(t, new Date(new Date(t.departs_at).getTime() - 3 * 3600_000));
  assert.deepEqual(early.released, []);
  const late = await availability(t, new Date(new Date(t.departs_at).getTime() - 3600_000));
  assert.deepEqual(late.released, ['1']); // seat 1 is the PWD seat; policy covers pwd only
  await availability(t, new Date(new Date(t.departs_at).getTime() - 1800_000));
  const audits = await q<{ n: number }>(`select count(*)::int n from audit_log where org_id = $1 and action = 'seat.auto_release'`, [orgId]);
  assert.equal(audits[0].n, 1);
});
