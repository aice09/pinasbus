import { q } from './db.ts';
import type { BusClassId, Trip } from './catalog.ts';

type Row = { id: string; code: string; dir: Trip['dir']; bus_class: BusClassId; fare: number; pickups: Trip['pickups']; dropoffs: string[]; active: boolean };
const toTrip = (r: Row): Trip => ({ id: r.id, code: r.code, dir: r.dir, busClass: r.bus_class, fare: r.fare, pickups: r.pickups, dropoffs: r.dropoffs, active: r.active });

// shortcut: per-pod 15 s cache; another pod sees an admin edit up to 15 s late. Fine for a timetable.
let cache: { at: number; trips: Trip[] } | null = null;

export async function allTrips(): Promise<Trip[]> {
  if (cache && Date.now() - cache.at < 15_000) return cache.trips;
  const rows = await q<Row>('select * from trips order by code, dir');
  cache = { at: Date.now(), trips: rows.map(toTrip) };
  return cache.trips;
}

export const activeTrips = async () => (await allTrips()).filter((t) => t.active);
export const tripById = async (id: string) => (await allTrips()).find((t) => t.id === id);
export const invalidateTrips = () => { cache = null; };

export async function saveTrip(t: Trip) {
  await q(
    `insert into trips (id, code, dir, bus_class, fare, pickups, dropoffs, active, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8, now())
     on conflict (id) do update set code = $2, dir = $3, bus_class = $4, fare = $5, pickups = $6, dropoffs = $7, active = $8, updated_at = now()`,
    [t.id, t.code, t.dir, t.busClass, t.fare, JSON.stringify(t.pickups), t.dropoffs, t.active]);
  invalidateTrips();
}
