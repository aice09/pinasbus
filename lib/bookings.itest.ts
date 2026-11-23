// Integration check against a real Postgres: DATABASE_URL=... node --test lib/bookings.itest.ts
// Uses trip id "itest" and removes its rows afterwards.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { attachCheckout, byRef, hold, markPaid, releaseExpired, SeatsTaken, takenSeats } from './bookings.ts';
import { pool } from './db.ts';

const base = { trip_id: 'itest', travel_date: '2030-01-01', pickup: 'A', dropoff: 'B', name: 'Test', email: 't@example.com', phone: '09170000000', fare_centavos: 100, fee_centavos: 10, total_centavos: 110 };

after(async () => { await pool().query(`delete from bookings where trip_id = 'itest'`); await pool().end(); });

test('holds, blocks double booking, confirms payment, recovers or flags late payments', async () => {
  await pool().query(`delete from bookings where trip_id = 'itest'`).catch(() => {});
  const a = await hold({ ...base, seats: ['1', '2'] });
  await assert.rejects(hold({ ...base, seats: ['2', '3'] }), SeatsTaken);
  assert.deepEqual((await takenSeats('itest', '2030-01-01')).sort(), ['1', '2']);

  await attachCheckout(a.id, 'cs_itest_a');
  assert.equal((await markPaid('cs_itest_a', 'pay_1', 110))?.status, 'paid');
  assert.equal((await markPaid('cs_itest_a', 'pay_1', 110))?.status, 'paid'); // webhook retry is a no-op

  const b = await hold({ ...base, seats: ['5'] });
  await attachCheckout(b.id, 'cs_itest_b');
  assert.equal((await markPaid('cs_itest_b', 'pay_2', 999))?.status, 'needs_refund'); // wrong amount

  // Hold expires, seat is resold, then the late payment arrives -> needs_refund.
  const c = await hold({ ...base, seats: ['7'] });
  await attachCheckout(c.id, 'cs_itest_c');
  await pool().query(`update bookings set expires_at = now() - interval '1 minute' where id = $1`, [c.id]);
  await releaseExpired();
  assert.equal((await byRef(c.ref))?.status, 'expired');
  await hold({ ...base, seats: ['7'] });
  assert.equal((await markPaid('cs_itest_c', 'pay_3', 110))?.status, 'needs_refund');

  // Hold expires, nobody took the seat, late payment arrives -> paid and seat re-locked.
  const d = await hold({ ...base, seats: ['9'] });
  await attachCheckout(d.id, 'cs_itest_d');
  await pool().query(`update bookings set expires_at = now() - interval '1 minute' where id = $1`, [d.id]);
  await releaseExpired();
  assert.equal((await markPaid('cs_itest_d', 'pay_4', 110))?.status, 'paid');
  assert.ok((await takenSeats('itest', '2030-01-01')).includes('9'));
});
