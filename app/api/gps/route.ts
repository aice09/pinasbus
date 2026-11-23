import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { can } from '@/lib/rbac';
import { allow } from '@/lib/ratelimit';
import { checkAlerts, DEFAULT_TRACKING, routeGeometry } from '@/lib/tracking';
import { tripById } from '@/lib/trips';

const Point = z.object({ tripId: z.string().uuid(), lat: z.number().min(4).max(22), lng: z.number().min(115).max(128), speedKph: z.number().min(0).max(250).nullable().optional(), heading: z.number().min(0).max(360).nullable().optional() });

/** Crew phones (or GPS hardware through the same session API) report the bus position. Only assigned crew may report. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(process.env.PUBLIC_BASE_URL ?? req.nextUrl.origin).origin) return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'sign in' }, { status: 401 });
  if (!allow('gps:' + user.id, 30, 60_000)) return NextResponse.json({ error: 'too many points' }, { status: 429 });
  const p = Point.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'bad point' }, { status: 400 });
  const t = await tripById(p.data.tripId);
  const m = t && user.memberships.find((x) => x.org_id === t.org_id);
  if (!t || !m || !can(m.role, 'tracking.report') || (t.driver_id !== user.id && t.conductor_id !== user.id)) return NextResponse.json({ error: 'not assigned to this trip' }, { status: 403 });
  if (!['boarding', 'departed'].includes(t.status)) return NextResponse.json({ error: 'trip is not on the road' }, { status: 409 });
  await q(`insert into gps_points (trip_id, lat, lng, speed_kph, heading, source, actor_id) values ($1,$2,$3,$4,$5,'device',$6)`,
    [t.id, p.data.lat, p.data.lng, p.data.speedKph ?? null, p.data.heading ?? null, user.id]);
  const [r] = await q<{ id: string }>('select route_id id from schedules where id = $1', [t.schedule_id]);
  const rules = { ...DEFAULT_TRACKING, ...((t.org_settings as { tracking?: object }).tracking ?? {}) };
  const alerts = await checkAlerts(t, { lat: p.data.lat, lng: p.data.lng, speed: p.data.speedKph ?? null }, await routeGeometry(r.id, t.stops), rules);
  return NextResponse.json({ ok: true, alerts });
}
