'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { CREW_STEPS, candidateSailings, LINK_STATUSES, linkByToken, linkSailing, nextSteps, SHIP_STEPS, setLinkStatus, setSailingStatus, type LinkStatus } from '@/lib/ferry';
import { can } from '@/lib/rbac';
import { actionCtx, audit, isErr } from '@/lib/tenancy';
import { tripById } from '@/lib/trips';
import type { ActionResult } from '@/components/ActionForm';

type R = Promise<ActionResult>;
const slug = (f: FormData) => String(f.get('org') ?? '');

// ---------- bus side ----------
export async function bookFerry(_: ActionResult, f: FormData): R {
  const c = await actionCtx(slug(f), 'ferry.link'); if (isErr(c)) return c;
  const t = await tripById(String(f.get('trip')));
  if (!t || t.org_id !== c.org.id) return { error: 'Trip not found.' };
  const sailingId = String(f.get('sailing'));
  if (!(await candidateSailings(t)).some((s) => s.id === sailingId)) return { error: 'Choose one of the sailings offered for this trip.' };
  const r = await linkSailing(t.id, sailingId, c.user.id);
  if ('error' in r) return { error: r.error };
  await audit(c.user.id, c.org.id, 'ferry.book', 'trip', t.id, r);
  revalidatePath(`/ops/${c.org.slug}/trips/${t.id}`);
  return { ok: `Ferry booked, reference ${r.reference}. Show its QR code at the port.` };
}

/** Status step from a QR scan: bus crew around the port, shipping staff on board. */
export async function ferryStep(_: ActionResult, f: FormData): R {
  const u = await requireUser('/ferry/scan');
  const link = await linkByToken(String(f.get('token') ?? ''));
  if (!link) return { error: 'This ferry code is not valid.' };
  const status = String(f.get('status')) as LinkStatus;
  if (!(status in LINK_STATUSES)) return { error: 'Unknown step.' };
  const bus = u.memberships.find((m) => m.org_id === link.bus_org_id);
  const ship = u.memberships.find((m) => m.org_id === link.ship_org_id);
  const isCrew = !!bus && (link.driver_id === u.id || link.conductor_id === u.id || can(bus.role, 'trips.dispatch'));
  const isShip = !!ship && can(ship.role, 'ships.operate');
  const allowed = (isCrew && CREW_STEPS.includes(status)) || (isShip && SHIP_STEPS.includes(status));
  if (!allowed) return { error: 'You are not allowed to record that step for this trip.' };
  if (status !== 'cancelled' && !nextSteps(link.status).includes(status) && !(status === 'waiting' && link.status === 'reserved')) return { error: `From “${LINK_STATUSES[link.status]}” the next step is ${nextSteps(link.status).map((s) => `“${LINK_STATUSES[s]}”`).join(' or ') || 'none'}.` };
  await setLinkStatus(link, status, String(f.get('note') ?? ''), u.id);
  revalidatePath('/ferry/scan');
  return { ok: `${link.reference}: ${LINK_STATUSES[status]}.` };
}

// ---------- shipping operator workspace ----------
export async function saveVessel(_: ActionResult, f: FormData): R {
  const c = await actionCtx(slug(f), 'ships.manage'); if (isErr(c)) return c;
  const V = z.object({ name: z.string().trim().min(2).max(80), registration: z.string().trim().max(40), vehicle_slots: z.coerce.number().int().min(1).max(200),
    passenger_capacity: z.coerce.number().int().min(0).max(5000), status: z.enum(['in_service', 'maintenance', 'retired']) });
  const p = V.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  const id = String(f.get('id') ?? '');
  try {
    if (id) await q('update vessels set name=$3, registration=$4, vehicle_slots=$5, passenger_capacity=$6, status=$7 where id = $1 and org_id = $2', [id, c.org.id, p.data.name, p.data.registration, p.data.vehicle_slots, p.data.passenger_capacity, p.data.status]);
    else await q('insert into vessels (org_id, name, registration, vehicle_slots, passenger_capacity, status) values ($1,$2,$3,$4,$5,$6)', [c.org.id, p.data.name, p.data.registration, p.data.vehicle_slots, p.data.passenger_capacity, p.data.status]);
  } catch (e) { if ((e as { code?: string }).code === '23505') return { error: 'A vessel with that name exists.' }; throw e; }
  await audit(c.user.id, c.org.id, id ? 'vessel.update' : 'vessel.create', 'vessel', id || p.data.name, p.data);
  revalidatePath(`/ship/${c.org.slug}`, 'layout');
  return { ok: 'Vessel saved.' };
}

export async function addPort(_: ActionResult, f: FormData): R {
  const c = await actionCtx(slug(f), 'ships.manage'); if (isErr(c)) return c;
  const name = String(f.get('name') ?? '').trim().slice(0, 60), province = String(f.get('province') ?? '').trim().slice(0, 60);
  if (name.length < 3) return { error: 'Name the port.' };
  const lat = Number(f.get('lat')), lng = Number(f.get('lng'));
  const ok = lat >= 4 && lat <= 22 && lng >= 115 && lng <= 128;
  await q(`insert into stations (name, province, kind, lat, lng, coord_source) values ($1,$2,'port',$3,$4,$5)
           on conflict (name) do update set kind = 'port', lat = coalesce(excluded.lat, stations.lat), lng = coalesce(excluded.lng, stations.lng)`,
    [name, province, ok ? lat : null, ok ? lng : null, ok ? 'entered by shipping operator' : '']);
  await audit(c.user.id, c.org.id, 'port.add', 'station', name);
  revalidatePath(`/ship/${c.org.slug}`, 'layout');
  return { ok: `Port ${name} saved.` };
}

/** One sailing, or the same sailing every day for N days (time in Manila). */
export async function addSailings(_: ActionResult, f: FormData): R {
  const c = await actionCtx(slug(f), 'ships.manage'); if (isErr(c)) return c;
  const S = z.object({ vessel_id: z.string().uuid(), from_port: z.string().min(2).max(60), to_port: z.string().min(2).max(60), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/), minutes: z.coerce.number().int().min(10).max(2880), days: z.coerce.number().int().min(1).max(60), boarding: z.coerce.number().int().min(10).max(240) });
  const p = S.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: 'Check the sailing details.' };
  const d = p.data;
  if (d.from_port === d.to_port) return { error: 'Choose two different ports.' };
  if (!(await q('select 1 from vessels where id = $1 and org_id = $2', [d.vessel_id, c.org.id])).length) return { error: 'Choose one of your vessels.' };
  const ports = await q<{ name: string }>(`select name from stations where kind = 'port' and name = any($1)`, [[d.from_port, d.to_port]]);
  if (ports.length !== 2) return { error: 'Both ends must be registered ports.' };
  const r = await q(`insert into sailings (org_id, vessel_id, from_port, to_port, departs_at, arrives_at, boarding_minutes)
     select $1, $2, $3, $4, (($5::date + n) + $6::time) at time zone 'Asia/Manila', (($5::date + n) + $6::time) at time zone 'Asia/Manila' + make_interval(mins => $7), $9
       from generate_series(0, $8 - 1) n on conflict (vessel_id, departs_at) do nothing returning id`,
    [c.org.id, d.vessel_id, d.from_port, d.to_port, d.date, d.time, d.minutes, d.days, d.boarding]);
  await audit(c.user.id, c.org.id, 'sailing.create', 'sailing', '', { ...d, created: r.length });
  revalidatePath(`/ship/${c.org.slug}`, 'layout');
  return { ok: `${r.length} sailing${r.length === 1 ? '' : 's'} added.` };
}

export async function sailingStatus(_: ActionResult, f: FormData): R {
  const c = await actionCtx(slug(f), 'ships.operate'); if (isErr(c)) return c;
  const status = String(f.get('status'));
  if (!['scheduled', 'boarding', 'sailing', 'arrived', 'delayed', 'cancelled'].includes(status)) return { error: 'Unknown status.' };
  if (!(await setSailingStatus(String(f.get('id')), c.org.id, status, String(f.get('note') ?? ''), c.user.id))) return { error: 'Sailing not found.' };
  await audit(c.user.id, c.org.id, 'sailing.status', 'sailing', String(f.get('id')), { status });
  revalidatePath(`/ship/${c.org.slug}`, 'layout');
  return { ok: `Sailing is now ${status}; linked buses and passengers were updated.` };
}
