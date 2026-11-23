'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { BUS_CLASSES, type BusClassId } from '@/lib/catalog';
import { q } from '@/lib/db';
import { setRates, setStatus, STATUSES, type ShipmentStatus } from '@/lib/padala';
import { saveTrip as save } from '@/lib/routes';
import type { ActionResult } from '@/components/ActionForm';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const Trip = z.object({
  id: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,40}$/, 'Trip id: lowercase letters, digits and dashes.'),
  code: z.string().trim().min(1).max(20),
  dir: z.enum(['south', 'north']),
  busClass: z.enum(Object.keys(BUS_CLASSES) as [BusClassId, ...BusClassId[]]),
  fare: z.coerce.number().int().min(1, 'Fare must be at least ₱1.').max(20000),
  pickups: z.string(),
  dropoffs: z.string(),
  active: z.string().optional(),
});

/** Pick-ups as "Station HH:MM" lines, drop-offs as one station per line. */
export async function saveTrip(_: ActionResult, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const p = Trip.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  const pickups = [];
  for (const line of p.data.pickups.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(.+?)\s+(\d{1,2}:\d{2})$/);
    const time = m?.[2].padStart(5, '0');
    if (!m || !TIME.test(time!)) return { error: `Pick-up "${line}" must look like "EDSA Cubao 18:30".` };
    pickups.push({ station: m[1].trim().slice(0, 60), time: time! });
  }
  const dropoffs = [...new Set(p.data.dropoffs.split('\n').map((l) => l.trim().slice(0, 60)).filter(Boolean))];
  if (!pickups.length || !dropoffs.length) return { error: 'Add at least one pick-up and one drop-off.' };
  if (pickups.some((x) => dropoffs.includes(x.station))) return { error: 'A station cannot be both a pick-up and a drop-off on one trip.' };
  pickups.sort((a, b) => a.time.localeCompare(b.time));
  await save({ id: p.data.id, code: p.data.code, dir: p.data.dir, busClass: p.data.busClass, fare: p.data.fare, pickups, dropoffs, active: p.data.active === 'on' });
  revalidatePath('/admin/trips');
  return { ok: 'Trip saved. Searches show the change within 15 seconds.' };
}

export async function markRefunded(_: ActionResult, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const r = await q(`update bookings set status = 'refunded' where id = $1 and status in ('needs_refund', 'paid') returning id`, [String(f.get('id'))]);
  if (r.length) await q('delete from seat_locks where booking_id = $1', [String(f.get('id'))]);
  revalidatePath('/admin/bookings');
  return r.length ? { ok: 'Marked as refunded; the seats are back on sale.' } : { error: 'Only paid or needs-refund bookings can be refunded.' };
}

export async function updateShipment(_: ActionResult, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const status = String(f.get('status')) as ShipmentStatus;
  if (!STATUSES.includes(status) || status === 'pending_payment') return { error: 'Choose a status.' };
  await setStatus(String(f.get('id')), status, String(f.get('note') ?? '').trim().slice(0, 200));
  revalidatePath('/admin/padala');
  return { ok: 'Status updated. The sender sees it on the tracking page.' };
}

export async function saveRates(_: ActionResult, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const R = z.object({ base: z.coerce.number().min(0).max(10000), perKg: z.coerce.number().min(0).max(1000), maxKg: z.coerce.number().int().min(1).max(500), valuationPct: z.coerce.number().min(0).max(20) });
  const p = R.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: 'Check the rate values.' };
  await setRates({ base: Math.round(p.data.base * 100), perKg: Math.round(p.data.perKg * 100), maxKg: p.data.maxKg, valuationPct: p.data.valuationPct });
  revalidatePath('/admin/padala');
  return { ok: 'Rates saved. New shipments use them right away.' };
}

export async function setRole(_: ActionResult, f: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const id = String(f.get('id')), role = String(f.get('role'));
  if (!['admin', 'customer'].includes(role)) return { error: 'Unknown role.' };
  if (id === me.id) return { error: 'You cannot change your own role.' };
  await q('update users set role = $2 where id = $1', [id, role]);
  revalidatePath('/admin/users');
  return { ok: role === 'admin' ? 'Now an admin.' : 'Admin rights removed.' };
}

export async function markHandled(_: ActionResult, f: FormData): Promise<ActionResult> {
  await requireAdmin();
  await q('update messages set handled = not handled where id = $1', [Number(f.get('id'))]);
  revalidatePath('/admin/messages');
  return { ok: 'Updated.' };
}
