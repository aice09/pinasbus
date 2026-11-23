import { randomBytes } from 'node:crypto';
import { q, tx } from './db.ts';
import { paidPayment } from './paymongo.ts';

export type Rates = { base: number; perKg: number; maxKg: number; valuationPct: number }; // centavos, centavos/kg, kg, % of declared value
export const DEFAULT_RATES: Rates = { base: 15000, perKg: 2500, maxKg: 50, valuationPct: 1 };

export const STATUSES = ['pending_payment', 'paid', 'received', 'in_transit', 'arrived', 'claimed', 'cancelled'] as const;
export type ShipmentStatus = (typeof STATUSES)[number];
export const STATUS_TEXT: Record<ShipmentStatus, string> = {
  pending_payment: 'Waiting for payment',
  paid: 'Paid, drop it off at the origin terminal',
  received: 'Received at the origin terminal',
  in_transit: 'On the bus',
  arrived: 'Ready for pick-up at the destination terminal',
  claimed: 'Claimed by the recipient',
  cancelled: 'Cancelled',
};

export type Shipment = {
  id: string; ref: string; user_id: string | null; sender_name: string; sender_phone: string; sender_email: string;
  recipient_name: string; recipient_phone: string; origin: string; destination: string; description: string;
  weight_kg: number; declared_value_centavos: number; fee_centavos: number; status: ShipmentStatus;
  checkout_id: string | null; payment_id: string | null; created_at: Date; paid_at: Date | null;
};

/** Fee = base + per started kg + valuation charge on the declared value. */
export function padalaFee(r: Rates, weightKg: number, declaredCentavos: number) {
  return r.base + r.perKg * Math.ceil(weightKg) + Math.round((declaredCentavos * r.valuationPct) / 100);
}

export async function getRates(): Promise<Rates> {
  const rows = await q<{ value: Rates }>(`select value from settings where key = 'padala_rates'`);
  return { ...DEFAULT_RATES, ...(rows[0]?.value ?? {}) };
}

export async function setRates(r: Rates) {
  await q(`insert into settings (key, value) values ('padala_rates', $1) on conflict (key) do update set value = $1`, [JSON.stringify(r)]);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newPadalaRef = () => 'PD' + [...randomBytes(10)].map((b) => ALPHABET[b % 32]).join('');

export async function createShipment(s: Omit<Shipment, 'id' | 'ref' | 'status' | 'checkout_id' | 'payment_id' | 'created_at' | 'paid_at'>) {
  const rows = await q<Shipment>(
    `insert into shipments (ref, user_id, sender_name, sender_phone, sender_email, recipient_name, recipient_phone, origin, destination, description, weight_kg, declared_value_centavos, fee_centavos)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
    [newPadalaRef(), s.user_id, s.sender_name, s.sender_phone, s.sender_email, s.recipient_name, s.recipient_phone, s.origin, s.destination, s.description, s.weight_kg, s.declared_value_centavos, s.fee_centavos]);
  await q(`insert into shipment_events (shipment_id, status, note) values ($1, 'pending_payment', 'Booked online')`, [rows[0].id]);
  return rows[0];
}

export const shipmentByRef = async (ref: string) => (await q<Shipment>('select * from shipments where ref = $1', [ref]))[0] ?? null;
export const shipmentEvents = (id: string) => q<{ status: ShipmentStatus; note: string; created_at: Date }>('select status, note, created_at from shipment_events where shipment_id = $1 order by id', [id]);

export async function setStatus(id: string, status: ShipmentStatus, note: string) {
  await tx(async (c) => {
    await c.query('update shipments set status = $2 where id = $1', [id, status]);
    await c.query('insert into shipment_events (shipment_id, status, note) values ($1, $2, $3)', [id, status, note]);
  });
}

/** Idempotent; a wrong amount leaves the shipment unpaid for staff to review. */
export async function markShipmentPaid(checkoutId: string, paymentId: string, amount: number): Promise<Shipment | null> {
  return tx(async (c) => {
    const { rows } = await c.query<Shipment>('select * from shipments where checkout_id = $1 for update', [checkoutId]);
    const s = rows[0];
    if (!s || s.status !== 'pending_payment') return s ?? null;
    if (amount !== s.fee_centavos) {
      await c.query(`insert into shipment_events (shipment_id, status, note) values ($1, 'pending_payment', $2)`, [s.id, `Payment of ${amount} centavos did not match the fee; staff will review`]);
      return s;
    }
    const up = await c.query<Shipment>(`update shipments set status = 'paid', payment_id = $2, paid_at = now() where id = $1 returning *`, [s.id, paymentId]);
    await c.query(`insert into shipment_events (shipment_id, status, note) values ($1, 'paid', 'Payment received')`, [s.id]);
    return up.rows[0];
  });
}

export async function syncShipment(s: Shipment): Promise<Shipment> {
  if (s.status !== 'pending_payment' || !s.checkout_id) return s;
  try {
    const p = await paidPayment(s.checkout_id);
    if (p) return (await markShipmentPaid(s.checkout_id, p.id, p.amount)) ?? s;
  } catch (e) {
    console.error('paymongo sync failed', s.ref, (e as Error).message);
  }
  return s;
}

/** "Juan Dela Cruz" -> "Juan D." for the public tracking page. */
export const maskName = (n: string) => { const [first, ...rest] = n.trim().split(/\s+/); return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first; };
