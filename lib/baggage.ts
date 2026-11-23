// Baggage: registration with weight rules, QR-tagged tracking, and notifications on every status change.
import { randomBytes } from 'node:crypto';
import { q, tx } from './db.ts';
import { notify } from './notify.ts';

export const BAG_STATUSES = {
  registered: 'Registered',
  checked_in: 'Checked in at the terminal',
  weighed: 'Weighed',
  tagged: 'Tagged',
  loaded: 'Loaded on the bus',
  in_transit: 'In transit',
  unloaded: 'Unloaded',
  ready: 'Ready for collection',
  released: 'Released to the passenger',
  exception: 'Exception: lost, damaged or held',
} as const;
export type BagStatus = keyof typeof BAG_STATUSES;
export const BAG_FLOW = Object.keys(BAG_STATUSES).filter((s) => s !== 'exception') as BagStatus[];
export const BAG_CATEGORIES = { regular: 'Regular', fragile: 'Fragile', oversized: 'Oversized', sports: 'Sports equipment', perishable: 'Perishable (packed)' } as const;
export type BagCategory = keyof typeof BAG_CATEGORIES;

export type BaggageRules = { freeKgPerSeat: number; excessPerKgCentavos: number; maxBagsPerSeat: number };
export const DEFAULT_BAGGAGE: BaggageRules = { freeKgPerSeat: 20, excessPerKgCentavos: 2000, maxBagsPerSeat: 3 };

export type Bag = { id: string; tag: string; org_id: string; booking_id: string; trip_id: string; passenger: string; description: string; category: BagCategory;
  weight_kg: number; fee_centavos: number; fee_paid: boolean; status: BagStatus; created_at: Date };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newTag = () => 'BG' + [...randomBytes(8)].map((b) => ALPHABET[b % 32]).join('');

/**
 * Excess fee for a booking's whole baggage list: everything above the free allowance (per seat) is charged per started kg.
 * Pure so the form can show the same number the server charges.
 */
export function excessFee(totalKg: number, seats: number, r: BaggageRules) {
  const over = Math.max(0, totalKg - seats * r.freeKgPerSeat);
  return Math.ceil(over) * r.excessPerKgCentavos;
}

/** Checks one new batch against the per-bag limit, the bag count, and the bus's hold capacity. Returns an error or null. */
export function checkBags(input: { weight: number }[], ctx: { existing: number; seats: number; maxBagKg: number; holdLeftKg: number; rules: BaggageRules; existingCount: number }) {
  if (!input.length) return 'Add at least one bag.';
  if (ctx.existingCount + input.length > ctx.seats * ctx.rules.maxBagsPerSeat) return `Up to ${ctx.rules.maxBagsPerSeat} bags per seat.`;
  for (const b of input) if (!(b.weight > 0) || b.weight > ctx.maxBagKg) return `Each bag can weigh up to ${ctx.maxBagKg} kg on this bus.`;
  const total = input.reduce((a, b) => a + b.weight, 0);
  if (total > ctx.holdLeftKg) return `The bus hold has room for ${Math.max(0, Math.floor(ctx.holdLeftKg))} kg more. Send the rest by Padala.`;
  return null;
}

/** Bus hold limit and per-bag limit for a trip (from its assigned bus; generous defaults when none is assigned yet). */
export async function tripBaggageLimits(tripId: string) {
  const [r] = await q<{ max_bag_kg: number | null; max_baggage_kg: number | null; used: number }>(
    `select b.max_bag_kg, b.max_baggage_kg, coalesce((select sum(weight_kg) from bags g where g.trip_id = t.id and g.status <> 'exception'), 0)::float used
       from trips t left join buses b on b.id = t.bus_id where t.id = $1`, [tripId]);
  const hold = r?.max_baggage_kg ?? 1500;
  return { maxBagKg: r?.max_bag_kg ?? 20, holdKg: hold, holdLeftKg: hold - (r?.used ?? 0) };
}

export async function registerBags(booking: { id: string; org_id: string; trip_uuid: string; seats: string[]; passengers: { name: string }[]; name: string },
  bags: { passenger: string; description: string; category: BagCategory; weight: number }[], rules: BaggageRules, actorId: string | null) {
  return tx(async (c) => {
    // Serialize registrations per trip so two passengers can't both take the last of the hold.
    await c.query('select pg_advisory_xact_lock(727400, hashtext($1))', [booking.trip_uuid]);
    const { rows: existing } = await c.query<{ weight_kg: number; fee_centavos: number }>('select weight_kg, fee_centavos from bags where booking_id = $1 and status <> \'exception\'', [booking.id]);
    const limits = await tripBaggageLimits(booking.trip_uuid);
    const err = checkBags(bags, { existing: existing.length, existingCount: existing.length, seats: booking.seats.length, maxBagKg: limits.maxBagKg, holdLeftKg: limits.holdLeftKg, rules });
    if (err) return { error: err };
    const before = existing.reduce((a, b) => a + Number(b.weight_kg), 0);
    const already = existing.reduce((a, b) => a + b.fee_centavos, 0);
    const totalFee = excessFee(before + bags.reduce((a, b) => a + b.weight, 0), booking.seats.length, rules);
    let feeLeft = totalFee - already;
    const out: Bag[] = [];
    for (const b of bags) {
      const fee = Math.max(0, feeLeft); feeLeft -= fee; // the whole new excess goes on the first new bag
      const { rows: [bag] } = await c.query<Bag>(
        `insert into bags (tag, org_id, booking_id, trip_id, passenger, description, category, weight_kg, fee_centavos, fee_paid)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
        [newTag(), booking.org_id, booking.id, booking.trip_uuid, b.passenger.slice(0, 80) || booking.name, b.description.slice(0, 120), b.category, b.weight, fee, fee === 0]);
      await c.query(`insert into bag_events (bag_id, status, note, actor_id) values ($1, 'registered', 'Registered with the ticket', $2)`, [bag.id, actorId]);
      out.push(bag);
    }
    return { bags: out, fee: totalFee - already };
  });
}

export async function bagByTag(tag: string) {
  return (await q<Bag & { ref: string; user_id: string | null; email: string; pickup: string; dropoff: string; driver_id: string | null; conductor_id: string | null; org_slug: string }>(
    `select g.*, b.ref, b.user_id, b.email, b.pickup, b.dropoff, t.driver_id, t.conductor_id, o.slug org_slug
       from bags g join bookings b on b.id = g.booking_id join trips t on t.id = g.trip_id join organizations o on o.id = g.org_id where g.tag = $1`, [tag.toUpperCase()]))[0] ?? null;
}

export const bagEvents = (bagId: string) =>
  q<{ status: BagStatus; location: string; note: string; created_at: Date; actor: string | null }>(
    `select e.status, e.location, e.note, e.created_at, u.name actor from bag_events e left join users u on u.id = e.actor_id where e.bag_id = $1 order by e.id`, [bagId]);

export async function setBagStatus(bagId: string, status: BagStatus, location: string, note: string, actorId: string) {
  const [bag] = await q<Bag & { user_id: string | null; email: string; ref: string }>(
    `update bags g set status = $2 from bookings b where g.id = $1 and b.id = g.booking_id returning g.*, b.user_id, b.email, b.ref`, [bagId, status]);
  await q('insert into bag_events (bag_id, status, location, note, actor_id) values ($1,$2,$3,$4,$5)', [bagId, status, location.slice(0, 80), note.slice(0, 200), actorId]);
  if (['loaded', 'ready', 'released', 'exception'].includes(status)) {
    await notify({ userIds: [bag.user_id], emails: [bag.email] }, {
      kind: 'baggage.status', title: `Bag ${bag.tag}: ${BAG_STATUSES[status]}`,
      body: `${bag.description}, ${bag.weight_kg} kg${location ? ` at ${location}` : ''}.${note ? ` ${note}` : ''}`, link: `/booking/${bag.ref}#bags`,
    });
  }
  return bag;
}
