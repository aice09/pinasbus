import { randomBytes } from 'node:crypto';
import { pool, ready, tx } from './db.ts';
import { expireCheckout, paidPayment } from './paymongo.ts';

export const HOLD_MINUTES = 15;

export type Booking = {
  id: string; ref: string; trip_id: string; travel_date: string; pickup: string; dropoff: string; seats: string[];
  name: string; email: string; phone: string; fare_centavos: number; fee_centavos: number; total_centavos: number;
  status: 'pending' | 'paid' | 'expired' | 'needs_refund'; checkout_id: string | null; payment_id: string | null;
  created_at: Date; expires_at: Date; paid_at: Date | null;
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRef = () => 'BB' + [...randomBytes(10)].map((b) => ALPHABET[b % 32]).join('');

/** Frees seats whose 15-minute hold ran out and closes their PayMongo checkout pages. */
export async function releaseExpired() {
  const expired = await tx(async (c) => {
    const { rows } = await c.query<{ id: string; checkout_id: string | null }>(
      `update bookings set status = 'expired' where status = 'pending' and expires_at < now() returning id, checkout_id`);
    if (rows.length) await c.query('delete from seat_locks where booking_id = any($1)', [rows.map((r) => r.id)]);
    return rows;
  });
  for (const r of expired) if (r.checkout_id) expireCheckout(r.checkout_id).catch(() => {}); // best effort: it may already be paid or expired
}

export async function takenSeats(tripId: string, date: string): Promise<string[]> {
  await ready();
  const { rows } = await pool().query<{ seat: string }>(
    `select l.seat from seat_locks l join bookings b on b.id = l.booking_id
      where l.trip_id = $1 and l.travel_date = $2 and (b.status = 'paid' or (b.status = 'pending' and b.expires_at > now()))`,
    [tripId, date]);
  return rows.map((r) => r.seat);
}

export async function takenCounts(tripIds: string[], date: string): Promise<Map<string, number>> {
  await ready();
  const { rows } = await pool().query<{ trip_id: string; n: string }>(
    `select l.trip_id, count(*) n from seat_locks l join bookings b on b.id = l.booking_id
      where l.trip_id = any($1) and l.travel_date = $2 and (b.status = 'paid' or (b.status = 'pending' and b.expires_at > now()))
      group by l.trip_id`,
    [tripIds, date]);
  return new Map(rows.map((r) => [r.trip_id, Number(r.n)]));
}

export class SeatsTaken extends Error {}

export async function hold(b: Omit<Booking, 'id' | 'ref' | 'status' | 'checkout_id' | 'payment_id' | 'created_at' | 'expires_at' | 'paid_at'>) {
  await releaseExpired();
  try {
    return await tx(async (c) => {
      const { rows } = await c.query<Booking>(
        `insert into bookings (ref, trip_id, travel_date, pickup, dropoff, seats, name, email, phone, fare_centavos, fee_centavos, total_centavos, expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now() + make_interval(mins => $13)) returning *`,
        [newRef(), b.trip_id, b.travel_date, b.pickup, b.dropoff, b.seats, b.name, b.email, b.phone, b.fare_centavos, b.fee_centavos, b.total_centavos, HOLD_MINUTES]);
      await c.query(
        `insert into seat_locks (trip_id, travel_date, seat, booking_id) select $1, $2, unnest($3::text[]), $4`,
        [b.trip_id, b.travel_date, b.seats, rows[0].id]);
      return rows[0];
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new SeatsTaken();
    throw e;
  }
}

export async function attachCheckout(id: string, checkoutId: string) {
  await pool().query('update bookings set checkout_id = $2 where id = $1', [id, checkoutId]);
}

export async function cancelHold(id: string) {
  await pool().query(`delete from bookings where id = $1 and status = 'pending'`, [id]);
}

export async function byRef(ref: string): Promise<Booking | null> {
  await ready();
  const { rows } = await pool().query<Booking>('select * from bookings where ref = $1', [ref]);
  return rows[0] ?? null;
}

/**
 * Records a payment. Idempotent. A payment that arrives after the hold expired gets its seats back if they are
 * still free; otherwise the booking is flagged needs_refund for staff.
 */
export async function markPaid(checkoutId: string, paymentId: string, amount: number): Promise<Booking | null> {
  return tx(async (c) => {
    const { rows } = await c.query<Booking>('select * from bookings where checkout_id = $1 for update', [checkoutId]);
    const b = rows[0];
    if (!b || b.status === 'paid' || b.status === 'needs_refund') return b ?? null;
    let status: Booking['status'] = amount === b.total_centavos ? 'paid' : 'needs_refund';
    if (status === 'paid' && b.status === 'expired') {
      await c.query('savepoint relock');
      try {
        await c.query(`insert into seat_locks (trip_id, travel_date, seat, booking_id) select $1, $2, unnest($3::text[]), $4`,
          [b.trip_id, b.travel_date, b.seats, b.id]);
      } catch (e) {
        if ((e as { code?: string }).code !== '23505') throw e;
        await c.query('rollback to savepoint relock');
        status = 'needs_refund';
      }
    }
    const up = await c.query<Booking>(
      `update bookings set status = $2, payment_id = $3, paid_at = now() where id = $1 returning *`, [b.id, status, paymentId]);
    return up.rows[0];
  });
}

/** Asks PayMongo directly, so a booking still confirms when the webhook is late or missing. */
export async function syncFromPaymongo(b: Booking): Promise<Booking> {
  if (b.status === 'paid' || b.status === 'needs_refund' || !b.checkout_id) return b;
  try {
    const p = await paidPayment(b.checkout_id);
    if (p) return (await markPaid(b.checkout_id, p.id, p.amount)) ?? b;
  } catch (e) {
    console.error('paymongo sync failed', b.ref, (e as Error).message);
  }
  return b;
}
