// Trips domain: dated trip instances made from schedules, search across operators, segment fares and seat availability.
import { q } from './db.ts';
import type { Seat } from './layouts.ts';
import { DEFAULT_DISCOUNTS, DEFAULT_POLICY, releaseDue, type Discounts, type SeatPolicy } from './seatpolicy.ts';

export type Stop = { station_id: string | null; name: string; offset_min: number | null; fare: number; boarding: boolean; alighting: boolean };
export type Leg = { type: 'expressway' | 'highway' | 'ferry' | 'city'; name: string; from: string; to: string; toll: boolean };
export type Source = { url: string; verified_at: string; what: string; verified: boolean };
export type TripRow = {
  id: string; org_id: string; org_name: string; org_slug: string; org_demo: boolean; org_settings: { seatPolicy?: SeatPolicy; discounts?: Discounts };
  schedule_id: string; code: string; class_name: string; service_date: string; departs_at: Date; status: string;
  seats: Seat[]; route_code: string; route_name: string; stops: Stop[]; itinerary: Leg[]; mode: 'road' | 'road_ferry';
  category_name: string | null; amenities: string[]; fare_adjust_pct: number; sources: Source[];
  bus_id: string | null; bus_code: string | null; plate: string | null; driver_id: string | null; conductor_id: string | null;
};

/** Creates trip instances for every active schedule running on `date` (idempotent). */
export async function ensureTrips(date: string) {
  await q(
    `insert into trips (org_id, schedule_id, service_date, departs_at, bus_id, layout_id)
     select s.org_id, s.id, $1::date, ($1::date + s.departure) at time zone 'Asia/Manila', s.bus_id, s.layout_id
       from schedules s join routes r on r.id = s.route_id join organizations o on o.id = s.org_id
      where s.active and r.active and o.status = 'active' and s.valid_from <= $1::date and (s.valid_to is null or s.valid_to >= $1::date)
        and extract(dow from $1::date)::int = any (s.days)
     on conflict (schedule_id, service_date) do nothing`, [date]);
}

const SELECT = `
  select t.id, t.org_id, o.name org_name, o.slug org_slug, o.is_demo org_demo, o.settings org_settings,
         t.schedule_id, s.code, s.class_name, t.service_date, t.departs_at, t.status, l.seats,
         r.code route_code, r.name route_name, r.stops, r.itinerary, r.mode, c.name category_name,
         coalesce((select array_agg(a.name order by a.name) from amenities a where a.id = any (coalesce(b.amenity_ids, s.amenity_ids))), '{}') amenities,
         s.fare_adjust_pct, s.data_sources sources, t.bus_id, b.code bus_code, b.plate, t.driver_id, t.conductor_id
    from trips t
    join schedules s on s.id = t.schedule_id
    join routes r on r.id = s.route_id
    join organizations o on o.id = t.org_id
    join seat_layouts l on l.id = t.layout_id
    left join buses b on b.id = t.bus_id
    left join categories c on c.id = r.category_id`;

export async function tripsOn(date: string, orgId?: string) {
  await ensureTrips(date);
  return q<TripRow>(`${SELECT} where t.service_date = $1 and ($2::uuid is null or t.org_id = $2) order by t.departs_at`, [date, orgId ?? null]);
}

export const tripById = async (id: string) =>
  /^[0-9a-f-]{36}$/.test(id) ? (await q<TripRow>(`${SELECT} where t.id = $1`, [id]))[0] ?? null : null;

/** Index of the boarding and alighting stops for a passenger going from -> to on this trip, or null. */
export function legOf(t: Pick<TripRow, 'stops'>, from?: string, to?: string) {
  const i = from ? t.stops.findIndex((s) => s.name === from && s.boarding) : t.stops.findIndex((s) => s.boarding);
  if (i < 0) return null;
  const j = to ? t.stops.findIndex((s, k) => k > i && s.name === to && s.alighting) : t.stops.findIndex((s, k) => k > i && s.alighting);
  return j < 0 ? null : { i, j };
}

export { segmentFare } from './pricing.ts';

export const stopTime = (t: Pick<TripRow, 'departs_at' | 'stops'>, i: number) =>
  t.stops[i].offset_min == null ? null : new Date(new Date(t.departs_at).getTime() + t.stops[i].offset_min! * 60_000);

export const policyOf = (t: Pick<TripRow, 'org_settings'>) => ({ ...DEFAULT_POLICY, ...(t.org_settings?.seatPolicy ?? {}) });
export const discountsOf = (t: Pick<TripRow, 'org_settings'>) => ({ ...DEFAULT_DISCOUNTS, ...(t.org_settings?.discounts ?? {}) });

const LIVE = `(b.status = 'paid' or (b.status = 'pending' and b.expires_at > now()))`;

export async function takenOn(tripIds: string[]) {
  const rows = await q<{ trip_id: string; n: number }>(
    `select ts.trip_id, count(*)::int n from trip_seats ts join bookings b on b.id = ts.booking_id where ts.trip_id = any ($1) and ${LIVE} group by 1`, [tripIds]);
  return new Map(rows.map((r) => [r.trip_id, r.n]));
}

/**
 * Taken seats and the priority seats released to everyone. When the company's release deadline has passed,
 * unbooked priority seats are released once and each release is written to the audit log.
 */
export async function availability(t: TripRow, now = new Date()) {
  const taken = (await q<{ seat: string }>(`select ts.seat from trip_seats ts join bookings b on b.id = ts.booking_id where ts.trip_id = $1 and ${LIVE}`, [t.id])).map((r) => r.seat);
  const policy = policyOf(t);
  if (releaseDue(policy, new Date(t.departs_at), now)) {
    const due = t.seats.filter((s) => policy.releaseKinds.includes(s.kind) && !taken.includes(s.id)).map((s) => s.id);
    if (due.length) {
      const fresh = await q<{ seat: string }>(
        `insert into seat_releases (trip_id, seat) select $1, unnest($2::text[]) on conflict do nothing returning seat`, [t.id, due]);
      for (const r of fresh) await q(`insert into audit_log (org_id, action, entity, entity_id, data) values ($1, 'seat.auto_release', 'trip', $2, $3)`,
        [t.org_id, t.id, JSON.stringify({ seat: r.seat, policy })]);
    }
  }
  const released = (await q<{ seat: string }>('select seat from seat_releases where trip_id = $1', [t.id])).map((r) => r.seat);
  return { taken, released };
}

// shortcut: per-pod 30 s cache of the route network; admin route edits show in dropdowns within 30 s.
let net: { at: number; pairs: Record<string, string[]> } | null = null;

/** Every boarding stop -> stops you can get off at later on some active route. Drives all From/To selects. */
export async function network() {
  if (net && Date.now() - net.at < 30_000) return net.pairs;
  const rows = await q<{ stops: Stop[] }>(
    `select r.stops from routes r join organizations o on o.id = r.org_id
      where r.active and o.status = 'active' and exists (select 1 from schedules s where s.route_id = r.id and s.active)`);
  const pairs: Record<string, Set<string>> = {};
  for (const { stops } of rows) stops.forEach((s, i) => {
    if (!s.boarding) return;
    for (const d of stops.slice(i + 1)) if (d.alighting) (pairs[s.name] ??= new Set()).add(d.name);
  });
  net = { at: Date.now(), pairs: Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, [...v].sort()])) };
  return net.pairs;
}
export const invalidateNetwork = () => { net = null; };

export const connects = (pairs: Record<string, string[]>, from: string, to: string) => !!pairs[from]?.includes(to);
