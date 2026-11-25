'use server';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hashPassword, requirePlatformAdmin } from '@/lib/auth';
import { q, tx } from '@/lib/db';
import { resetDemoData } from '@/lib/demo';
import { setRates, setStatus, STATUSES, type ShipmentStatus } from '@/lib/padala';
import { audit } from '@/lib/tenancy';
import { adminRoleFor } from '@/lib/rbac';
import { refundToCard } from '@/lib/bookings';
import { invalidateNetwork } from '@/lib/trips';
import { parseColorHunt } from '@/lib/theme';
import type { ActionResult } from '@/components/ActionForm';

const tempPassword = () => randomBytes(9).toString('base64url');

const NewOrg = z.object({
  name: z.string().trim().min(2, 'Enter the company name.').max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, 'Short name: 2-40 lowercase letters, digits or dashes.'),
  kind: z.enum(['bus_operator', 'card_issuer', 'shipping_operator']),
  contact_email: z.string().trim().email('Enter the contact email.').max(120),
  contact_phone: z.string().trim().max(40).default(''),
  admin_name: z.string().trim().min(2, 'Enter the first administrator’s name.').max(80),
  admin_email: z.string().trim().toLowerCase().email('Enter the first administrator’s email.').max(120),
});

/** Registers a company and its first administrator, who gets a one-time password to change at first sign-in. */
export async function createOrg(_: ActionResult, f: FormData): Promise<ActionResult> {
  const me = await requirePlatformAdmin();
  const p = NewOrg.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data, pw = tempPassword();
  try {
    await tx(async (c) => {
      const { rows: [o] } = await c.query<{ id: string }>(
        `insert into organizations (kind, name, slug, contact_email, contact_phone, status) values ($1,$2,$3,$4,$5,'active') returning id`,
        [d.kind, d.name, d.slug, d.contact_email, d.contact_phone]);
      const { rows: [u] } = await c.query<{ id: string }>(
        `insert into users (email, name, password_hash, must_change_password) values ($1,$2,$3,true)
         on conflict ((lower(email))) do update set name = users.name returning id`, [d.admin_email, d.admin_name, await hashPassword(pw)]);
      await c.query(`insert into memberships (user_id, org_id, role) values ($1,$2,$3) on conflict do nothing`, [u.id, o.id, adminRoleFor(d.kind)]);
      await c.query(`insert into audit_log (actor_id, org_id, action, entity, entity_id, data) values ($1,$2,'org.create','organization',$2,$3)`, [me.id, o.id, JSON.stringify({ name: d.name, admin: d.admin_email })]);
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { error: 'That short name is taken.' };
    throw e;
  }
  revalidatePath('/platform/orgs');
  return { ok: `Created. Give ${d.admin_email} this one-time password: ${pw} (if the account already existed, its password is unchanged).` };
}

export async function setOrgStatus(_: ActionResult, f: FormData): Promise<ActionResult> {
  const me = await requirePlatformAdmin();
  const id = String(f.get('id')), status = String(f.get('status'));
  if (!['active', 'suspended'].includes(status)) return { error: 'Unknown status.' };
  const r = await q(`update organizations set status = $2 where id = $1 and kind <> 'platform' returning id`, [id, status]);
  if (!r.length) return { error: 'Company not found.' };
  await audit(me.id, id, status === 'suspended' ? 'org.suspend' : 'org.reactivate', 'organization', id);
  invalidateNetwork();
  revalidatePath('/platform/orgs');
  return { ok: status === 'suspended' ? 'Suspended: its trips are hidden and its staff cannot sign in to its workspace.' : 'Reactivated.' };
}

const Cat = z.object({
  id: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, 'Id: lowercase letters, digits and dashes.'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).default(''),
  sort: z.coerce.number().int().min(0).max(999).default(100),
  active: z.string().optional(),
  max_seats_per_booking: z.coerce.number().int().min(1).max(20).default(6),
  advance_days: z.coerce.number().int().min(0).max(365).default(60),
});

/** Transport categories are data, not code: add or edit them here. */
export async function saveCategory(_: ActionResult, f: FormData): Promise<ActionResult> {
  const me = await requirePlatformAdmin();
  const p = Cat.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  await q(`insert into categories (id, name, description, sort, active, rules) values ($1,$2,$3,$4,$5,$6)
           on conflict (id) do update set name = $2, description = $3, sort = $4, active = $5, rules = $6`,
    [d.id, d.name, d.description, d.sort, d.active === 'on', JSON.stringify({ maxSeatsPerBooking: d.max_seats_per_booking, advanceDays: d.advance_days })]);
  await audit(me.id, null, 'category.save', 'category', d.id, d);
  revalidatePath('/platform/categories');
  return { ok: 'Category saved.' };
}

export async function setUserDisabled(_: ActionResult, f: FormData): Promise<ActionResult> {
  const me = await requirePlatformAdmin();
  const id = String(f.get('id')), disabled = f.get('disabled') === 'true';
  if (id === me.id) return { error: 'You cannot disable yourself.' };
  await q('update users set disabled = $2 where id = $1', [id, disabled]);
  if (disabled) await q('delete from sessions where user_id = $1', [id]);
  await audit(me.id, null, disabled ? 'user.disable' : 'user.enable', 'user', id);
  revalidatePath('/platform/users');
  return { ok: disabled ? 'Account disabled and signed out.' : 'Account enabled.' };
}

export async function markRefunded(_: ActionResult, f: FormData): Promise<ActionResult> {
  const me = await requirePlatformAdmin();
  const id = String(f.get('id'));
  const r = await q<{ org_id: string; paid_with: string; card_id: string | null; total_centavos: number; ref: string }>(`update bookings set status = 'refunded' where id = $1 and status in ('needs_refund', 'paid') returning org_id, paid_with, card_id, total_centavos, ref`, [id]);
  if (!r.length) return { error: 'Only paid or needs-refund bookings can be refunded.' };
  if (r[0].paid_with === 'card' && r[0].card_id) await refundToCard(r[0].card_id, r[0].total_centavos, r[0].ref);
  await q('delete from trip_seats where booking_id = $1', [id]);
  await audit(me.id, r[0].org_id, 'booking.refund', 'booking', id);
  revalidatePath('/platform/bookings');
  return { ok: 'Marked as refunded; the seats are back on sale.' };
}

export async function updateShipment(_: ActionResult, f: FormData): Promise<ActionResult> {
  const me = await requirePlatformAdmin();
  const status = String(f.get('status')) as ShipmentStatus;
  if (!STATUSES.includes(status) || status === 'pending_payment') return { error: 'Choose a status.' };
  await setStatus(String(f.get('id')), status, String(f.get('note') ?? '').trim().slice(0, 200));
  await audit(me.id, null, 'padala.status', 'shipment', String(f.get('id')), { status });
  revalidatePath('/platform/padala');
  return { ok: 'Status updated. The sender sees it on the tracking page.' };
}

export async function saveRates(_: ActionResult, f: FormData): Promise<ActionResult> {
  const me = await requirePlatformAdmin();
  const R = z.object({ base: z.coerce.number().min(0).max(10000), perKg: z.coerce.number().min(0).max(1000), maxKg: z.coerce.number().int().min(1).max(500), valuationPct: z.coerce.number().min(0).max(20) });
  const p = R.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: 'Check the rate values.' };
  await setRates({ base: Math.round(p.data.base * 100), perKg: Math.round(p.data.perKg * 100), maxKg: p.data.maxKg, valuationPct: p.data.valuationPct });
  await audit(me.id, null, 'padala.rates', 'settings', 'padala_rates', p.data);
  revalidatePath('/platform/padala');
  return { ok: 'Rates saved.' };
}

export async function markHandled(_: ActionResult, f: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();
  await q('update messages set handled = not handled where id = $1', [Number(f.get('id'))]);
  revalidatePath('/platform/messages');
  return { ok: 'Updated.' };
}

/** Deletes every demo company (and its trips and bookings) and the demo accounts, then seeds them again. */
export async function resetDemo(_: ActionResult, f: FormData): Promise<ActionResult> {
  const me = await requirePlatformAdmin();
  if (f.get('confirm') !== 'RESET') return { error: 'Type RESET to confirm.' };
  await tx(async (c) => {
    await resetDemoData(c);
    await c.query(`insert into audit_log (actor_id, action, entity) values ($1, 'demo.reset', 'platform')`, [me.id]);
  });
  invalidateNetwork();
  revalidatePath('/', 'layout');
  return { ok: 'Demo data reset.' };
}

export async function savePlatformTheme(_: unknown, f: FormData): Promise<{ error?: string; ok?: string }> {
  const me = await requirePlatformAdmin();
  const choice = String(f.get('theme_choice') ?? '');
  const palette = parseColorHunt(choice === 'custom' ? String(f.get('theme_link') ?? '') : choice);
  if (!palette) return { error: 'Choose a palette or paste a Color Hunt link.' };
  await q(`insert into settings (key, value) values ('theme', $1) on conflict (key) do update set value = $1`, [JSON.stringify({ palette })]);
  await audit(me.id, null, 'platform.theme', 'settings', 'theme', { palette });
  revalidatePath('/', 'layout');
  return { ok: 'Saved. Everyone without their own colours now sees this palette.' };
}
