import { randomBytes } from 'node:crypto';
import { pool, q, tx } from './db.ts';
import { expireCheckout, paidPayment } from './paymongo.ts';
import type { PassengerCategory } from './seatpolicy.ts';
import { notify } from './notify.ts';

export const HOLD_MINUTES = 15;

export type BookedPassenger = { seat: string; name: string; category: PassengerCategory; fare: number; id_type?: string; id_last4?: string };
export type Booking = {
  id: string; ref: string; org_id: string | null; trip_uuid: string | null; trip_id: string; travel_date: string;
  pickup: string; dropoff: string; seats: string[];
  name: string; email: string; phone: string; fare_centavos: number; fee_centavos: number; total_centavos: number;
  status: 'pending' | 'paid' | 'expired' | 'needs_refund' | 'refunded'; checkout_id: string | null; payment_id: string | null;
  created_at: Date; expires_at: Date; paid_at: Date | null; user_id: string | null; passengers: BookedPassenger[];
  channel: 'online' | 'terminal'; sold_by: string | null; checked_in: string[];
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRef = () => 'PB' + [...randomBytes(10)].map((b) => ALPHABET[b % 32]).join('');

/** Frees seats whose 15-minute hold ran out and closes their PayMongo checkout pages. */
export async function releaseExpired() {
  const expired = await tx(async (c) => {
    const { rows } = await c.query<{ id: string; checkout_id: string | null }>(
      `update bookings set status = 'expired' where status = 'pending' and expires_at < now() returning id, checkout_id`);
    if (rows.length) await c.query('delete from trip_seats where booking_id = any($1)', [rows.map((r) => r.id)]);
    return rows;
  });
  for (const r of expired) if (r.checkout_id) expireCheckout(r.checkout_id).catch(() => {}); // best effort
}

export class SeatsTaken extends Error {}

type NewBooking = Pick<Booking, 'org_id' | 'trip_uuid' | 'trip_id' | 'travel_date' | 'pickup' | 'dropoff' | 'seats' | 'name' | 'email' | 'phone' |
  'fare_centavos' | 'fee_centavos' | 'total_centavos' | 'passengers'> & { user_id?: string | null; channel?: Booking['channel']; sold_by?: string | null; paid?: boolean };

/** Inserts the booking and its seats in one transaction; the trip_seats primary key prevents double booking. */
export async function hold(b: NewBooking) {
  await releaseExpired();
  try {
    return await tx(async (c) => {
      const { rows } = await c.query<Booking>(
        `insert into bookings (ref, org_id, trip_uuid, trip_id, travel_date, pickup, dropoff, seats, name, email, phone, fare_centavos, fee_centavos, total_centavos,
           expires_at, user_id, passengers, channel, sold_by, status, paid_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now() + make_interval(mins => $15), $16, $17, $18, $19, $20, case when $20 = 'paid' then now() end) returning *`,
        [newRef(), b.org_id, b.trip_uuid, b.trip_id, b.travel_date, b.pickup, b.dropoff, b.seats, b.name, b.email, b.phone, b.fare_centavos, b.fee_centavos,
          b.total_centavos, HOLD_MINUTES, b.user_id ?? null, JSON.stringify(b.passengers), b.channel ?? 'online', b.sold_by ?? null, b.paid ? 'paid' : 'pending']);
      await c.query(`insert into trip_seats (trip_id, seat, booking_id) select $1, unnest($2::text[]), $3`, [b.trip_uuid, b.seats, rows[0].id]);
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
  await q(`delete from bookings where id = $1 and status = 'pending'`, [id]);
}

export const byRef = async (ref: string): Promise<Booking | null> => (await q<Booking>('select * from bookings where ref = $1', [ref]))[0] ?? null;

/**
 * Records a payment. Idempotent. A payment that arrives after the hold expired gets its seats back if they are
 * still free; otherwise, or when the amount is wrong, the booking is flagged needs_refund and frees its seats.
 */
export async function markPaid(checkoutId: string, paymentId: string, amount: number): Promise<Booking | null> {
  let changed = false;
  return tx(async (c) => {
    const { rows } = await c.query<Booking>('select * from bookings where checkout_id = $1 for update', [checkoutId]);
    const b = rows[0];
    if (!b || (b.status !== 'pending' && b.status !== 'expired')) return b ?? null;
    changed = true;
    let status: Booking['status'] = amount === b.total_centavos ? 'paid' : 'needs_refund';
    if (status === 'paid' && b.status === 'expired') {
      await c.query('savepoint relock');
      try {
        await c.query(`insert into trip_seats (trip_id, seat, booking_id) select $1, unnest($2::text[]), $3`, [b.trip_uuid, b.seats, b.id]);
      } catch (e) {
        if ((e as { code?: string }).code !== '23505') throw e;
        await c.query('rollback to savepoint relock');
        status = 'needs_refund';
      }
    }
    if (status === 'needs_refund') await c.query('delete from trip_seats where booking_id = $1', [b.id]);
    const up = await c.query<Booking>(`update bookings set status = $2, payment_id = $3, paid_at = now() where id = $1 returning *`, [b.id, status, paymentId]);
    return up.rows[0];
  }).then(async (b) => {
    if (b && changed) await bookingNotice(b); // only on the transition, not on webhook retries
    return b;
  });
}

/** Booking confirmation or refund notice, in-app and by email. */
export async function bookingNotice(b: Booking) {
  const paid = b.status === 'paid';
  await notify({ userIds: [b.user_id], emails: [b.email] }, {
    kind: paid ? 'booking.paid' : 'booking.needs_refund',
    title: paid ? `Ticket ${b.ref}: ${b.pickup} to ${b.dropoff}` : `Refund due for ${b.ref}`,
    body: paid ? `Paid. ${b.travel_date}, seats ${b.seats.join(', ')}. Show the ticket or the reference at boarding with a valid ID.`
      : 'Your payment arrived after the seats were taken. The bus company will refund you.',
    link: `/booking/${b.ref}`,
  });
}

/** Asks PayMongo directly, so a booking still confirms when the webhook is late or missing. */
export async function syncFromPaymongo(b: Booking): Promise<Booking> {
  if ((b.status !== 'pending' && b.status !== 'expired') || !b.checkout_id) return b;
  try {
    const p = await paidPayment(b.checkout_id);
    if (p) return (await markPaid(b.checkout_id, p.id, p.amount)) ?? b;
  } catch (e) {
    console.error('paymongo sync failed', b.ref, (e as Error).message);
  }
  return b;
}

export const bookingsForUser = (userId: string) =>
  q<Booking>(`select * from bookings where user_id = $1 and status <> 'expired' order by travel_date desc, created_at desc limit 200`, [userId]);

/** Card-paid bookings are refunded to the same card through its issuer. */
export async function refundToCard(cardId: string, amount: number, ref: string) {
  const { issuerFor } = await import('./cards.ts');
  const [c] = await q<{ org_id: string }>('select org_id from cards where id = $1', [cardId]);
  if (c) await issuerFor(c.org_id).refund({ cardId, amount, reference: ref, channel: 'booking refund' });
}
