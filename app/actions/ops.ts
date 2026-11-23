'use server';
// Company workspace actions. Each one: resolve the company from the form's `org` slug, check one fixed permission
// for the caller's role there, validate input, touch only rows with that org_id, and write the audit log.
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hashPassword } from '@/lib/auth';
import { hold, SeatsTaken } from '@/lib/bookings';
import { manilaNow } from '@/lib/catalog';
import { q } from '@/lib/db';
import { checkLayout, PASSENGER_KINDS, SEAT_KINDS, seatName, type Seat, type SeatKind } from '@/lib/layouts';
import { seatPrice, segmentFare } from '@/lib/pricing';
import { can, isRole, ROLE_KIND, type Permission } from '@/lib/rbac';
import { isCategory, PASSENGER_CATEGORIES, seatAllowed } from '@/lib/seatpolicy';
import { actionCtx, audit, isErr, type Ctx } from '@/lib/tenancy';
import { availability, discountsOf, invalidateNetwork, legOf, tripById } from '@/lib/trips';
import type { ActionResult } from '@/components/ActionForm';
import { BAG_STATUSES, bagByTag, setBagStatus, type BagStatus } from '@/lib/baggage';
import { refundToCard } from '@/lib/bookings';

type R = Promise<ActionResult>;
const slugOf = (f: FormData) => String(f.get('org') ?? '');
async function ctx(f: FormData, perm: Permission) { return actionCtx(slugOf(f), perm); }
const done = (c: Ctx, path: string, ok: string): ActionResult => { revalidatePath(`/ops/${c.org.slug}${path}`); return { ok }; };
const uuid = z.string().uuid();
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------- company settings ----------
const Company = z.object({
  contact_email: z.string().trim().email('Enter a valid company email.').max(120),
  contact_phone: z.string().trim().max(40),
  address: z.string().trim().max(200),
  releaseHoursBefore: z.coerce.number().int().min(0).max(72),
  d_senior: z.coerce.number().min(0).max(100), d_pwd: z.coerce.number().min(0).max(100), d_student: z.coerce.number().min(0).max(100), d_child: z.coerce.number().min(0).max(100),
  freeKgPerSeat: z.coerce.number().min(0).max(100), excessPerKg: z.coerce.number().min(0).max(1000), maxBagsPerSeat: z.coerce.number().int().min(0).max(10),
  speedLimitKph: z.coerce.number().min(20).max(140), deviationKm: z.coerce.number().min(0.2).max(50), unusualStopMinutes: z.coerce.number().int().min(5).max(240),
});
export async function saveCompany(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'org.manage'); if (isErr(c)) return c;
  const p = Company.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const kinds = f.getAll('releaseKinds').map(String).filter((k) => ['senior', 'pwd', 'priority'].includes(k)) as SeatKind[];
  const settings = { ...c.org.settings, seatPolicy: { releaseHoursBefore: d.releaseHoursBefore, releaseKinds: kinds }, discounts: { regular: 0, senior: d.d_senior, pwd: d.d_pwd, student: d.d_student, child: d.d_child },
    baggage: { freeKgPerSeat: d.freeKgPerSeat, excessPerKgCentavos: Math.round(d.excessPerKg * 100), maxBagsPerSeat: d.maxBagsPerSeat },
    tracking: { speedLimitKph: d.speedLimitKph, deviationKm: d.deviationKm, unusualStopMinutes: d.unusualStopMinutes },
    payments: { online: true, cards: f.get('accept_cards') === 'on', cash: true } };
  await q('update organizations set contact_email = $2, contact_phone = $3, address = $4, settings = $5 where id = $1', [c.org.id, d.contact_email, d.contact_phone, d.address, JSON.stringify(settings)]);
  await audit(c.user.id, c.org.id, 'company.settings', 'organization', c.org.id, settings);
  return done(c, '/settings', 'Saved. New bookings use these rules right away.');
}

// ---------- staff ----------
export async function addStaff(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'users.manage'); if (isErr(c)) return c;
  const name = String(f.get('name') ?? '').trim().slice(0, 80), email = String(f.get('email') ?? '').trim().toLowerCase().slice(0, 120), role = f.get('role');
  if (name.length < 2 || !z.string().email().safeParse(email).success) return { error: 'Enter the person’s name and email.' };
  if (!isRole(role) || ROLE_KIND[role] !== c.org.kind) return { error: 'Choose a role.' };
  const pw = randomBytes(9).toString('base64url');
  const [u] = await q<{ id: string; created: boolean }>(
    `insert into users (email, name, password_hash, must_change_password) values ($1,$2,$3,true)
     on conflict ((lower(email))) do update set name = users.name returning id, (xmax = 0) created`, [email, name, await hashPassword(pw)]);
  const m = await q(`insert into memberships (user_id, org_id, role) values ($1,$2,$3) on conflict do nothing returning user_id`, [u.id, c.org.id, role]);
  if (!m.length) return { error: 'That person already works here. Change their role in the list.' };
  await audit(c.user.id, c.org.id, 'staff.add', 'user', u.id, { email, role });
  return done(c, '/staff', u.created ? `Added. Give ${email} this one-time password: ${pw}` : `Added ${email}; they sign in with their existing password.`);
}

export async function setStaffRole(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'users.manage'); if (isErr(c)) return c;
  const id = String(f.get('id')), role = f.get('role');
  if (id === c.user.id) return { error: 'Ask another administrator to change your own role.' };
  if (role === 'remove') {
    await q('delete from memberships where user_id = $1 and org_id = $2', [id, c.org.id]);
    await audit(c.user.id, c.org.id, 'staff.remove', 'user', id);
    return done(c, '/staff', 'Removed from the company.');
  }
  if (!isRole(role) || ROLE_KIND[role] !== c.org.kind) return { error: 'Choose a role.' };
  await q('update memberships set role = $3 where user_id = $1 and org_id = $2', [id, c.org.id, role]);
  await audit(c.user.id, c.org.id, 'staff.role', 'user', id, { role });
  return done(c, '/staff', 'Role changed.');
}

// ---------- fleet ----------
const Bus = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(1, 'Enter the bus code.').max(20),
  plate: z.string().trim().max(12),
  make: z.string().trim().max(40), model: z.string().trim().max(40), color: z.string().trim().max(30),
  year: z.coerce.number().int().min(1960).max(2100).optional().or(z.literal('').transform(() => undefined)),
  class_name: z.string().trim().max(40),
  category_id: z.string().max(40),
  layout_id: uuid,
  length_m: z.coerce.number().min(0).max(30).optional(), width_m: z.coerce.number().min(0).max(5).optional(), height_m: z.coerce.number().min(0).max(6).optional(),
  max_baggage_kg: z.coerce.number().int().min(0).max(20000),
  max_bag_kg: z.coerce.number().int().min(1).max(200),
  registration_expiry: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  inspection_status: z.string().trim().max(60),
});
export async function saveBus(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'fleet.manage'); if (isErr(c)) return c;
  const p = Bus.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const [layout] = await q<{ seats: Seat[] }>('select seats from seat_layouts where id = $1 and org_id = $2', [d.layout_id, c.org.id]);
  if (!layout) return { error: 'Choose one of your seat layouts.' };
  const amen = (await q<{ id: string }>('select id from amenities where id = any($1::uuid[]) and (org_id is null or org_id = $2)', [f.getAll('amenity').map(String).filter((x) => uuid.safeParse(x).success), c.org.id])).map((r) => r.id);
  const vals = [c.org.id, d.code, d.plate.toUpperCase(), d.make, d.model, d.year ?? null, d.color, d.class_name, d.category_id || null, d.layout_id,
    layout.seats.some((s) => s.deck === 1) ? 2 : 1, d.length_m ?? null, d.width_m ?? null, d.height_m ?? null,
    layout.seats.filter((s) => PASSENGER_KINDS.includes(s.kind)).length, d.max_baggage_kg, d.max_bag_kg, d.registration_expiry || null, d.inspection_status, amen];
  try {
    if (d.id) {
      const r = await q(`update buses set code=$2, plate=$3, make=$4, model=$5, year=$6, color=$7, class_name=$8, category_id=$9, layout_id=$10, decks=$11, length_m=$12, width_m=$13, height_m=$14,
        max_passengers=$15, max_baggage_kg=$16, max_bag_kg=$17, registration_expiry=$18, inspection_status=$19, amenity_ids=$20 where id = $21 and org_id = $1 returning id`, [...vals, d.id]);
      if (!r.length) return { error: 'Bus not found.' };
    } else {
      await q(`insert into buses (org_id, code, plate, make, model, year, color, class_name, category_id, layout_id, decks, length_m, width_m, height_m, max_passengers, max_baggage_kg, max_bag_kg, registration_expiry, inspection_status, amenity_ids)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, vals);
    }
  } catch (e) { if ((e as { code?: string }).code === '23505') return { error: 'Another bus already uses that code.' }; throw e; }
  await audit(c.user.id, c.org.id, d.id ? 'bus.update' : 'bus.create', 'bus', d.id ?? d.code, { code: d.code, plate: d.plate });
  return done(c, '/fleet', d.id ? 'Bus saved.' : 'Bus registered.');
}

export async function setBusStatus(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'fleet.maintain'); if (isErr(c)) return c;
  const status = String(f.get('status'));
  if (!['active', 'maintenance', 'retired'].includes(status)) return { error: 'Unknown status.' };
  const r = await q('update buses set status = $3 where id = $1 and org_id = $2 returning code', [String(f.get('id')), c.org.id, status]);
  if (!r.length) return { error: 'Bus not found.' };
  await audit(c.user.id, c.org.id, 'bus.status', 'bus', String(f.get('id')), { status });
  return done(c, '/fleet', `Bus is now ${status}.`);
}

export async function addAmenity(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'fleet.manage'); if (isErr(c)) return c;
  const name = String(f.get('name') ?? '').trim().slice(0, 40);
  if (name.length < 2) return { error: 'Name the amenity.' };
  await q('insert into amenities (org_id, name) values ($1,$2) on conflict do nothing', [c.org.id, name]);
  await audit(c.user.id, c.org.id, 'amenity.add', 'amenity', name);
  return done(c, '/fleet', `Added "${name}". Tick it on your buses and schedules.`);
}

// ---------- seat layouts ----------
export async function saveLayout(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'fleet.manage'); if (isErr(c)) return c;
  const id = String(f.get('id') ?? ''), name = String(f.get('name') ?? '').trim().slice(0, 60);
  let seats: Seat[];
  try { seats = JSON.parse(String(f.get('seats') ?? '[]')); } catch { return { error: 'The layout could not be read.' }; }
  if (name.length < 2) return { error: 'Name the layout.' };
  const bad = checkLayout(seats);
  if (bad) return { error: bad };
  seats = seats.map((s) => ({ id: s.id, x: s.x, row: s.row, deck: s.deck, berth: !!s.berth, kind: s.kind }));
  if (id) {
    // Never drop a seat someone already holds a ticket for on an upcoming trip.
    const held = await q<{ seat: string }>(
      `select distinct ts.seat from trip_seats ts join trips t on t.id = ts.trip_id where t.layout_id = $1 and t.service_date >= $2`, [id, manilaNow().date]);
    const missing = held.map((h) => h.seat).filter((s) => !seats.some((x) => x.id === s && PASSENGER_KINDS.includes(x.kind)));
    if (missing.length) return { error: `Seats ${missing.join(', ')} are booked on upcoming trips; keep them as passenger seats.` };
    const r = await q('update seat_layouts set name = $3, seats = $4, updated_at = now() where id = $1 and org_id = $2 returning id', [id, c.org.id, name, JSON.stringify(seats)]);
    if (!r.length) return { error: 'Layout not found.' };
  } else {
    try { await q('insert into seat_layouts (org_id, name, seats) values ($1,$2,$3)', [c.org.id, name, JSON.stringify(seats)]); }
    catch (e) { if ((e as { code?: string }).code === '23505') return { error: 'A layout with that name exists.' }; throw e; }
  }
  await audit(c.user.id, c.org.id, id ? 'layout.update' : 'layout.create', 'seat_layout', id || name, { seats: seats.length });
  return done(c, '/layouts', 'Layout saved. Buses and schedules using it show the change on new trips.');
}

// ---------- routes ----------
const LEG_TYPES = ['expressway', 'highway', 'ferry', 'city'];
export async function saveRoute(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'routes.manage'); if (isErr(c)) return c;
  const id = String(f.get('id') ?? ''), code = String(f.get('code') ?? '').trim().slice(0, 20), name = String(f.get('name') ?? '').trim().slice(0, 120);
  if (!code || name.length < 3) return { error: 'Give the route a code and a name.' };
  const stops: { name: string; offset_min: number | null; fare: number; boarding: boolean; alighting: boolean }[] = [];
  for (const [n, line] of String(f.get('stops') ?? '').split('\n').map((l) => l.trim()).filter(Boolean).entries()) {
    const [st, off, fare, use] = line.split('|').map((x) => x.trim());
    if (!st || !/^\d*$/.test(off ?? '') || !/^\d+(\.\d+)?$/.test(fare ?? '')) return { error: `Stop line ${n + 1} must look like "EDSA Cubao | 0 | 0 | P".` };
    const u = (use ?? 'PD').toUpperCase();
    stops.push({ name: st.slice(0, 60), offset_min: off === '' ? null : Number(off), fare: Number(fare), boarding: u.includes('P'), alighting: u.includes('D') });
  }
  if (stops.length < 2) return { error: 'A route needs at least two stops.' };
  if (!stops[0].boarding || !stops[stops.length - 1].alighting) return { error: 'The first stop must be a pick-up and the last a drop-off.' };
  if (stops.some((s, i) => i > 0 && s.fare < stops[i - 1].fare)) return { error: 'Fares are cumulative from the first stop, so each must be at least the one before.' };
  const itinerary = [];
  for (const line of String(f.get('itinerary') ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [type, lname, from, to, toll] = line.split('|').map((x) => x.trim());
    if (!LEG_TYPES.includes(type) || !lname) return { error: `Road line "${line}" must look like "expressway | SLEX | Magallanes | Santo Tomas | toll".` };
    itinerary.push({ type, name: lname.slice(0, 80), from: (from ?? '').slice(0, 60), to: (to ?? '').slice(0, 60), toll: (toll ?? '').toLowerCase() === 'toll' });
  }
  for (const s of stops) await q(`insert into stations (name) values ($1) on conflict (name) do nothing`, [s.name]);
  const ids = new Map((await q<{ id: string; name: string }>('select id, name from stations where name = any($1)', [stops.map((s) => s.name)])).map((r) => [r.name, r.id]));
  const full = stops.map((s) => ({ station_id: ids.get(s.name) ?? null, ...s }));
  const mode = itinerary.some((l) => l.type === 'ferry') ? 'road_ferry' : 'road';
  const cat = String(f.get('category_id') ?? '') || null, active = f.get('active') === 'on';
  const minFare = Math.max(0, Math.min(5000, Math.round(Number(f.get('min_fare')) || 0)));
  try {
    if (id) {
      const r = await q('update routes set code=$3, name=$4, category_id=$5, stops=$6, itinerary=$7, mode=$8, active=$9, min_fare=$10, geometry=null where id = $1 and org_id = $2 returning id',
        [id, c.org.id, code, name, cat, JSON.stringify(full), JSON.stringify(itinerary), mode, active, minFare]);
      if (!r.length) return { error: 'Route not found.' };
    } else {
      await q('insert into routes (org_id, code, name, category_id, stops, itinerary, mode, active, min_fare) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [c.org.id, code, name, cat, JSON.stringify(full), JSON.stringify(itinerary), mode, active, minFare]);
    }
  } catch (e) { if ((e as { code?: string }).code === '23505') return { error: 'Another route already uses that code.' }; throw e; }
  invalidateNetwork();
  await audit(c.user.id, c.org.id, id ? 'route.update' : 'route.create', 'route', id || code, { stops: stops.length });
  return done(c, '/routes', 'Route saved. Search dropdowns show it within 30 seconds once it has a schedule.');
}

// ---------- schedules ----------
const Sched = z.object({
  id: z.string().optional(), route_id: uuid, code: z.string().trim().min(1).max(30),
  departure: z.string().regex(TIME, 'Departure must be HH:MM.'),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), valid_to: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  layout_id: uuid, bus_id: z.string().optional(), class_name: z.string().trim().max(40),
  fare_adjust_pct: z.coerce.number().min(-50).max(100),
});
export async function saveSchedule(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'schedules.manage'); if (isErr(c)) return c;
  const p = Sched.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const days = f.getAll('days').map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);
  if (!days.length) return { error: 'Pick at least one operating day.' };
  if (d.valid_to && d.valid_to < d.valid_from) return { error: 'The end date is before the start date.' };
  const [own] = await q<{ n: number }>(`select ((select count(*) from routes where id = $1 and org_id = $3) + (select count(*) from seat_layouts where id = $2 and org_id = $3))::int n`, [d.route_id, d.layout_id, c.org.id]);
  if (own.n !== 2) return { error: 'Choose one of your routes and seat layouts.' };
  const bus = d.bus_id && uuid.safeParse(d.bus_id).success ? (await q<{ id: string }>('select id from buses where id = $1 and org_id = $2', [d.bus_id, c.org.id]))[0]?.id ?? null : null;
  const amen = (await q<{ id: string }>('select id from amenities where id = any($1::uuid[]) and (org_id is null or org_id = $2)', [f.getAll('amenity').map(String).filter((x) => uuid.safeParse(x).success), c.org.id])).map((r) => r.id);
  const vals = [c.org.id, d.route_id, d.code, d.departure, days, d.valid_from, d.valid_to || null, bus, d.layout_id, d.class_name, amen, d.fare_adjust_pct, f.get('active') === 'on'];
  if (d.id) {
    const r = await q(`update schedules set route_id=$2, code=$3, departure=$4, days=$5, valid_from=$6, valid_to=$7, bus_id=$8, layout_id=$9, class_name=$10, amenity_ids=$11, fare_adjust_pct=$12, active=$13
      where id = $14 and org_id = $1 returning id`, [...vals, d.id]);
    if (!r.length) return { error: 'Schedule not found.' };
    // Future trips not yet sold pick up the new bus/layout/time; sold trips keep theirs.
    await q(`update trips t set bus_id = $2, layout_id = $3, departs_at = (t.service_date + $4::time) at time zone 'Asia/Manila'
             where t.schedule_id = $1 and t.service_date >= $5 and not exists (select 1 from trip_seats ts where ts.trip_id = t.id)`, [d.id, bus, d.layout_id, d.departure, manilaNow().date]);
  } else {
    await q(`insert into schedules (org_id, route_id, code, departure, days, valid_from, valid_to, bus_id, layout_id, class_name, amenity_ids, fare_adjust_pct, active)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, vals);
  }
  invalidateNetwork();
  await audit(c.user.id, c.org.id, d.id ? 'schedule.update' : 'schedule.create', 'schedule', d.id ?? d.code, { departure: d.departure, days, fare_adjust_pct: d.fare_adjust_pct });
  return done(c, '/schedules', 'Schedule saved.');
}

// ---------- dispatch ----------
export async function dispatchTrip(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'trips.dispatch'); if (isErr(c)) return c;
  const id = String(f.get('id')), status = String(f.get('status'));
  if (!['scheduled', 'boarding', 'departed', 'arrived', 'cancelled'].includes(status)) return { error: 'Unknown status.' };
  const opt = (k: string) => { const v = String(f.get(k) ?? ''); return uuid.safeParse(v).success ? v : null; };
  const bus = opt('bus_id'), driver = opt('driver_id'), conductor = opt('conductor_id');
  if (bus && !(await q('select 1 from buses where id = $1 and org_id = $2 and status = \'active\'', [bus, c.org.id])).length) return { error: 'Choose one of your active buses.' };
  for (const [who, roles] of [[driver, ['driver', 'assistant_driver']], [conductor, ['conductor']]] as const)
    if (who && !(await q('select 1 from memberships where user_id = $1 and org_id = $2 and role = any($3)', [who, c.org.id, roles])).length) return { error: 'Choose crew from your staff with the right role.' };
  const r = await q('update trips set bus_id = coalesce($3, bus_id), driver_id = $4, conductor_id = $5, status = $6 where id = $1 and org_id = $2 returning id', [id, c.org.id, bus, driver, conductor, status]);
  if (!r.length) return { error: 'Trip not found.' };
  await audit(c.user.id, c.org.id, 'trip.dispatch', 'trip', id, { bus, driver, conductor, status });
  return done(c, '/trips', 'Trip updated.');
}

// ---------- bookings ----------
export async function refundBooking(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'bookings.refund'); if (isErr(c)) return c;
  const id = String(f.get('id'));
  const r = await q<{ id: string; paid_with: string; card_id: string | null; total_centavos: number; ref: string }>(`update bookings set status = 'refunded' where id = $1 and org_id = $2 and status in ('needs_refund', 'paid') returning id, paid_with, card_id, total_centavos, ref`, [id, c.org.id]);
  if (!r.length) return { error: 'Only paid or needs-refund bookings can be refunded.' };
  if (r[0].paid_with === 'card' && r[0].card_id) await refundToCard(r[0].card_id, r[0].total_centavos, r[0].ref);
  await q('delete from trip_seats where booking_id = $1', [id]);
  await audit(c.user.id, c.org.id, 'booking.refund', 'booking', id);
  return done(c, '/bookings', 'Marked refunded; the seats are back on sale.');
}

/** Terminal sale paid in cash: same seat rules as online, no online fee, recorded against the seller. */
export async function sellTicket(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'bookings.sell'); if (isErr(c)) return c;
  const trip = await tripById(String(f.get('trip')));
  if (!trip || trip.org_id !== c.org.id) return { error: 'Trip not found.' };
  if (['departed', 'arrived', 'cancelled'].includes(trip.status)) return { error: 'This trip is no longer selling.' };
  const leg = legOf(trip, String(f.get('pickup')), String(f.get('dropoff')));
  if (!leg) return { error: 'Choose a pick-up and a later drop-off.' };
  const seatId = String(f.get('seat') ?? ''), category = String(f.get('category')), name = String(f.get('name') ?? '').trim().slice(0, 80);
  const seat = trip.seats.find((s) => s.id === seatId);
  if (!seat || !PASSENGER_KINDS.includes(seat.kind)) return { error: 'Choose a passenger seat.' };
  if (!isCategory(category)) return { error: 'Choose a passenger type.' };
  if (name.length < 2) return { error: 'Enter the passenger’s name.' };
  const { released } = await availability(trip);
  if (!seatAllowed(seat.kind, category, released.includes(seat.id))) return { error: `${seatName(seat.id)} is a ${SEAT_KINDS[seat.kind]} seat; sell it to an eligible passenger or choose another.` };
  const idType = String(f.get('id_type') ?? '').trim().slice(0, 40), idLast4 = String(f.get('id_last4') ?? '').trim().toUpperCase();
  if (category !== 'regular' && category !== 'child' && (!idType || !/^[A-Z0-9]{4}$/.test(idLast4))) return { error: 'Check the discount ID and note its type and last 4 characters.' };
  const price = seatPrice(segmentFare(trip, leg.i, leg.j), discountsOf(trip), category, false);
  try {
    const b = await hold({
      org_id: c.org.id, trip_uuid: trip.id, trip_id: trip.code, travel_date: trip.service_date, pickup: trip.stops[leg.i].name, dropoff: trip.stops[leg.j].name,
      seats: [seat.id], name, email: c.org.contact_email || 'terminal@pinasbus.test', phone: String(f.get('phone') ?? '').slice(0, 20) || 'terminal',
      fare_centavos: price.fare, fee_centavos: 0, total_centavos: price.fare, passengers: [{ seat: seat.id, name, category, fare: price.fare, id_type: idType, id_last4: idLast4 }],
      channel: 'terminal', sold_by: c.user.id, paid: true,
    });
    await audit(c.user.id, c.org.id, 'booking.terminal_sale', 'booking', b.id, { ref: b.ref, seat: seat.id, category, fare: price.fare });
    return done(c, `/trips/${trip.id}`, `Sold ${seatName(seat.id)} to ${name} (${PASSENGER_CATEGORIES[category]}): collect PHP ${(price.fare / 100).toFixed(2)}. Ticket ${b.ref}.`);
  } catch (e) {
    if (e instanceof SeatsTaken) return { error: 'That seat was just taken.' };
    throw e;
  }
}

export async function checkIn(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'bookings.checkin'); if (isErr(c)) return c;
  const [b] = await q<{ id: string; trip_uuid: string; seats: string[]; driver_id: string | null; conductor_id: string | null }>(
    `select b.id, b.trip_uuid, b.seats, t.driver_id, t.conductor_id from bookings b join trips t on t.id = b.trip_uuid where b.id = $1 and b.org_id = $2 and b.status = 'paid'`, [String(f.get('id')), c.org.id]);
  if (!b) return { error: 'Booking not found or not paid.' };
  if (!can(c.role, 'trips.view') && b.driver_id !== c.user.id && b.conductor_id !== c.user.id) return { error: 'You are not assigned to this trip.' };
  const seat = String(f.get('seat'));
  if (!b.seats.includes(seat)) return { error: 'Seat not on this booking.' };
  await q('update bookings set checked_in = array(select distinct unnest(checked_in || $2::text)) where id = $1', [b.id, seat]);
  await audit(c.user.id, c.org.id, 'booking.checkin', 'booking', b.id, { seat });
  return done(c, `/trips/${b.trip_uuid}`, `${seatName(seat)} checked in.`);
}

// ---------- baggage ----------
export async function updateBag(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'baggage.manage'); if (isErr(c)) return c;
  const bag = await bagByTag(String(f.get('tag') ?? ''));
  if (!bag || bag.org_id !== c.org.id) return { error: 'No bag with that tag in this company.' };
  if (!can(c.role, 'trips.view') && bag.driver_id !== c.user.id && bag.conductor_id !== c.user.id) return { error: 'You are not assigned to this bag’s trip.' };
  const status = String(f.get('status')) as BagStatus;
  if (!(status in BAG_STATUSES)) return { error: 'Choose a status.' };
  if (f.get('fee_paid') === 'on' && !bag.fee_paid) await q('update bags set fee_paid = true where id = $1', [bag.id]);
  if (status === 'loaded' && !bag.fee_paid && f.get('fee_paid') !== 'on') return { error: `Collect the excess baggage fee (PHP ${(bag.fee_centavos / 100).toFixed(2)}) before loading.` };
  await setBagStatus(bag.id, status, String(f.get('location') ?? ''), String(f.get('note') ?? ''), c.user.id);
  await audit(c.user.id, c.org.id, 'bag.status', 'bag', bag.tag, { status });
  return done(c, '/baggage', `${bag.tag}: ${BAG_STATUSES[status]}.`);
}

export async function ackAlert(_: ActionResult, f: FormData): R {
  const c = await ctx(f, 'tracking.view'); if (isErr(c)) return c;
  const r = await q('update trip_alerts set acknowledged = true where id = $1 and org_id = $2 returning id', [Number(f.get('id')), c.org.id]);
  if (!r.length) return { error: 'Alert not found.' };
  await audit(c.user.id, c.org.id, 'alert.ack', 'trip_alert', String(f.get('id')));
  return done(c, '/live', 'Acknowledged.');
}
