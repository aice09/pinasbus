// Live tracking. Positions come from a crew phone or GPS hardware (gps_points) when one reported in the last
// 5 minutes; otherwise, for demonstrations, a deterministic SIMULATION moves the bus along its planned route.
// Simulated data is always flagged `simulated: true` and labelled in the UI; it is never stored as GPS data.
import { q } from './db.ts';
import { along, haversine, lineLength, nearest, type LngLat } from './geo.ts';
import { notify } from './notify.ts';
import type { Stop, TripRow } from './trips.ts';

export type Geometry = { line: LngLat[]; source: 'osrm' | 'straight'; stopsKm: (number | null)[] };
export type TrackingRules = { speedLimitKph: number; deviationKm: number; unusualStopMinutes: number };
export const DEFAULT_TRACKING: TrackingRules = { speedLimitKph: 80, deviationKm: 2, unusualStopMinutes: 20 };

type StopPoint = Stop & { lat: number | null; lng: number | null };

/** Coordinates for a route's stops, in order (stations without coordinates are skipped). */
export async function stopPoints(stops: Stop[]): Promise<StopPoint[]> {
  const rows = await q<{ name: string; lat: number | null; lng: number | null }>('select name, lat, lng from stations where name = any($1)', [stops.map((s) => s.name)]);
  const m = new Map(rows.map((r) => [r.name, r]));
  return stops.map((s) => ({ ...s, lat: m.get(s.name)?.lat ?? null, lng: m.get(s.name)?.lng ?? null }));
}

/**
 * Road geometry for a route through its stops: asked once from the public OSRM demo router and cached on the route.
 * shortcut: router.project-osrm.org is for light use only; run your own OSRM/Valhalla before real traffic.
 * Falls back to straight lines (also used across ferry crossings, where no road exists).
 */
export async function routeGeometry(routeId: string, stops: Stop[]): Promise<Geometry | null> {
  const [r] = await q<{ geometry: Geometry | null }>('select geometry from routes where id = $1', [routeId]);
  if (r?.geometry?.line?.length) return r.geometry;
  const pts = (await stopPoints(stops)).filter((s) => s.lat != null && s.lng != null);
  if (pts.length < 2) return null;
  const coords: LngLat[] = pts.map((s) => [s.lng!, s.lat!]);
  let line = coords, source: Geometry['source'] = 'straight';
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords.map((c) => c.join(',')).join(';')}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'PINASBUS-demo/1.0' } });
    const body = await res.json();
    const osrm: LngLat[] | undefined = body?.routes?.[0]?.geometry?.coordinates;
    // A road route much longer than the straight path means a water crossing OSRM can't drive: keep straight lines.
    if (osrm?.length && lineLength(osrm) < lineLength(coords) * 2.2) { line = osrm.length > 1500 ? osrm.filter((_, i) => i % Math.ceil(osrm.length / 1500) === 0 || i === osrm.length - 1) : osrm; source = 'osrm'; }
  } catch { /* offline or rate-limited: straight lines */ }
  const stopsKm = (await stopPoints(stops)).map((s) => (s.lat == null ? null : nearest(line, [s.lng!, s.lat!]).at));
  const g: Geometry = { line, source, stopsKm };
  await q('update routes set geometry = $2 where id = $1', [routeId, JSON.stringify(g)]);
  return g;
}

export type Snapshot = {
  simulated: boolean; status: 'not_started' | 'on_the_way' | 'arrived'; position: LngLat | null; bearing: number;
  speedKph: number; avgKph: number; maxKph: number; travelledKm: number; remainingKm: number; totalKm: number;
  eta: string | null; lastUpdate: string | null; nextStop: string | null; ferry: boolean;
};

/** Planned duration in minutes: the last stop's published offset, or the distance at an average 50 km/h. */
const plannedMinutes = (stops: Stop[], totalKm: number) => {
  const last = [...stops].reverse().find((s) => s.offset_min != null && s.offset_min > 0)?.offset_min;
  const est = (totalKm / 50) * 60;
  return last && last > est * 0.4 ? Math.max(last, est * 0.8) : est;
};

/** Deterministic speed profile: slow in cities, fast on expressways, near 0 by stops. Same answer for the same minute. */
function simSpeed(km: number, totalKm: number, stopsKm: (number | null)[], minute: number) {
  const nearStop = stopsKm.some((s) => s != null && Math.abs(s - km) < 0.4);
  if (nearStop) return 3 + (minute % 4);
  const urban = km < 15 || totalKm - km < 10;
  const base = urban ? 32 : 72;
  return Math.max(5, base + 9 * Math.sin(minute / 7) + 5 * Math.sin(minute / 2.3));
}

export function simulate(t: Pick<TripRow, 'departs_at' | 'stops' | 'status' | 'mode'>, g: Geometry, now = new Date()): Snapshot {
  const totalKm = lineLength(g.line), minutes = plannedMinutes(t.stops, totalKm);
  const start = new Date(t.departs_at).getTime(), elapsed = (now.getTime() - start) / 60_000;
  const frac = Math.max(0, Math.min(1, elapsed / minutes));
  const km = frac * totalKm, pos = along(g.line, km);
  // replay minute by minute for average and maximum speed
  let max = 0;
  for (let m = 0; m <= Math.min(elapsed, minutes); m += 1) max = Math.max(max, simSpeed((m / minutes) * totalKm, totalKm, g.stopsKm, m));
  const status = elapsed < 0 ? 'not_started' : frac >= 1 ? 'arrived' : 'on_the_way';
  const next = t.stops.find((s, i) => (g.stopsKm[i] ?? -1) > km + 0.1)?.name ?? null;
  return {
    simulated: true, status, position: pos.point, bearing: pos.bearing,
    speedKph: status === 'on_the_way' ? Math.round(simSpeed(km, totalKm, g.stopsKm, Math.floor(elapsed))) : 0,
    avgKph: elapsed > 0 ? Math.round((km / Math.min(elapsed, minutes)) * 60) : 0, maxKph: Math.round(max),
    travelledKm: +km.toFixed(1), remainingKm: +(totalKm - km).toFixed(1), totalKm: +totalKm.toFixed(1),
    eta: new Date(start + minutes * 60_000).toISOString(), lastUpdate: now.toISOString(), nextStop: next, ferry: t.mode === 'road_ferry',
  };
}

/** Real snapshot from reported GPS points, or null if nothing reported in the last 5 minutes. */
export async function liveSnapshot(tripId: string, g: Geometry | null, t: Pick<TripRow, 'departs_at' | 'stops' | 'status' | 'mode'>): Promise<Snapshot | null> {
  const pts = await q<{ lat: number; lng: number; speed_kph: number | null; heading: number | null; at: Date }>(
    'select lat, lng, speed_kph, heading, at from gps_points where trip_id = $1 order by at', [tripId]);
  const last = pts.at(-1);
  if (!last || Date.now() - last.at.getTime() > 5 * 60_000) return null;
  let travelled = 0, max = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = haversine([pts[i - 1].lng, pts[i - 1].lat], [pts[i].lng, pts[i].lat]);
    travelled += d;
    const hrs = (pts[i].at.getTime() - pts[i - 1].at.getTime()) / 3_600_000;
    max = Math.max(max, pts[i].speed_kph ?? (hrs > 0 ? d / hrs : 0));
  }
  const hours = (last.at.getTime() - pts[0].at.getTime()) / 3_600_000;
  const totalKm = g ? lineLength(g.line) : 0;
  const along = g ? nearest(g.line, [last.lng, last.lat]).at : travelled;
  const avg = hours > 0 ? travelled / hours : 0;
  const remaining = Math.max(0, totalKm - along);
  return {
    simulated: false, status: t.status === 'arrived' ? 'arrived' : 'on_the_way', position: [last.lng, last.lat], bearing: last.heading ?? 0,
    speedKph: Math.round(last.speed_kph ?? 0), avgKph: Math.round(avg), maxKph: Math.round(max), travelledKm: +travelled.toFixed(1),
    remainingKm: +remaining.toFixed(1), totalKm: +totalKm.toFixed(1),
    eta: avg > 5 ? new Date(last.at.getTime() + (remaining / avg) * 3_600_000).toISOString() : null, lastUpdate: last.at.toISOString(),
    nextStop: g ? t.stops.find((s, i) => (g.stopsKm[i] ?? -1) > along + 0.1)?.name ?? null : null, ferry: t.mode === 'road_ferry',
  };
}

/** Speeding and route-deviation checks on a new GPS point; alerts are throttled to one per kind per 10 minutes. */
export async function checkAlerts(trip: { id: string; org_id: string }, p: { lat: number; lng: number; speed: number | null }, g: Geometry | null, rules: TrackingRules) {
  const raised: string[] = [];
  const recent = async (kind: string) => (await q(`select 1 from trip_alerts where trip_id = $1 and kind = $2 and at > now() - interval '10 minutes'`, [trip.id, kind])).length > 0;
  if (p.speed != null && p.speed > rules.speedLimitKph && !(await recent('speeding'))) {
    await q(`insert into trip_alerts (trip_id, org_id, kind, detail) values ($1,$2,'speeding',$3)`, [trip.id, trip.org_id, `${Math.round(p.speed)} km/h, limit ${rules.speedLimitKph} km/h`]);
    raised.push(`Speeding: ${Math.round(p.speed)} km/h`);
  }
  if (g) {
    const off = nearest(g.line, [p.lng, p.lat]).km;
    if (off > rules.deviationKm && !(await recent('deviation'))) {
      await q(`insert into trip_alerts (trip_id, org_id, kind, detail) values ($1,$2,'deviation',$3)`, [trip.id, trip.org_id, `${off.toFixed(1)} km off the planned route`]);
      raised.push(`Off route by ${off.toFixed(1)} km`);
    }
  }
  // Unusual stop: no real movement for the configured minutes, away from any planned stop.
  const window = await q<{ lat: number; lng: number; at: Date }>(`select lat, lng, at from gps_points where trip_id = $1 and at > now() - make_interval(mins => $2) order by at`, [trip.id, rules.unusualStopMinutes]);
  if (window.length > 3 && Date.now() - window[0].at.getTime() > (rules.unusualStopMinutes - 1) * 60_000 && window.every((w) => haversine([w.lng, w.lat], [p.lng, p.lat]) < 0.3)) {
    const at = g ? nearest(g.line, [p.lng, p.lat]).at : null;
    const atStop = g && at != null && g.stopsKm.some((k) => k != null && Math.abs(k - at) < 0.6);
    if (!atStop && !(await recent('unusual_stop'))) {
      await q(`insert into trip_alerts (trip_id, org_id, kind, detail) values ($1,$2,'unusual_stop',$3)`, [trip.id, trip.org_id, `Stopped ${rules.unusualStopMinutes}+ minutes away from a planned stop`]);
      raised.push('Unusual stop');
    }
  }
  if (raised.length) {
    const staff = await q<{ user_id: string }>(`select user_id from memberships where org_id = $1 and role in ('company_admin', 'operations_manager', 'dispatcher', 'fleet_manager')`, [trip.org_id]);
    await notify({ userIds: staff.map((s) => s.user_id) }, { kind: 'tracking.alert', title: raised.join('; '), body: 'Open live tracking for details.', link: `/track/${trip.id}` }, false);
  }
  return raised;
}
