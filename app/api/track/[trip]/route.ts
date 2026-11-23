import { NextResponse, type NextRequest } from 'next/server';
import { q } from '@/lib/db';
import { liveSnapshot, routeGeometry, simulate, stopPoints } from '@/lib/tracking';
import { tripById } from '@/lib/trips';

export const dynamic = 'force-dynamic';

/** Position and stats for one trip. `?full=1` adds the route line and stops (sent once; the page then polls). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ trip: string }> }) {
  const t = await tripById((await params).trip);
  if (!t) return NextResponse.json({ error: 'unknown trip' }, { status: 404 });
  const [r] = await q<{ id: string }>('select route_id id from schedules where id = $1', [t.schedule_id]);
  const g = await routeGeometry(r.id, t.stops);
  const live = await liveSnapshot(t.id, g, t);
  const snap = live ?? (g ? simulate(t, g) : null);
  const ferry = await q<{ status: string; from_port: string; to_port: string; vessel: string; sailing_status: string; departs_at: Date }>(
    `select l.status, s.from_port, s.to_port, v.name vessel, s.status sailing_status, s.departs_at
       from ferry_links l join sailings s on s.id = l.sailing_id join vessels v on v.id = s.vessel_id where l.trip_id = $1 and l.status <> 'cancelled'`, [t.id]);
  const body: Record<string, unknown> = { trip: { id: t.id, status: t.status, code: t.code, org: t.org_name, route: t.route_name }, snapshot: snap, ferry };
  if (req.nextUrl.searchParams.get('full')) {
    body.line = g?.line ?? [];
    body.lineSource = g?.source ?? null;
    body.stops = (await stopPoints(t.stops)).filter((s) => s.lat != null).map((s) => ({ name: s.name, lngLat: [s.lng, s.lat], boarding: s.boarding, alighting: s.alighting }));
    body.itinerary = t.itinerary;
  }
  return NextResponse.json(body, { headers: { 'cache-control': 'no-store' } });
}
