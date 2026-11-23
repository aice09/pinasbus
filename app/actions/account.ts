'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { endSession, hashPassword, requireUser, verifyPassword } from '@/lib/auth';
import { q } from '@/lib/db';
import type { ActionResult } from '@/components/ActionForm';

const PHONE = /^((\+63|0)9\d{9})?$/;
const phone = z.string().trim().transform((s) => s.replace(/[\s-]/g, '')).refine((s) => PHONE.test(s), 'Use a PH mobile number, e.g. 09171234567.');

const Passenger = z.object({
  full_name: z.string().trim().min(2, 'Enter the passenger’s full name as on their ID.').max(80),
  phone,
  label: z.string().trim().max(40),
  category: z.enum(['regular', 'senior', 'pwd', 'student', 'child']),
  id_type: z.string().trim().max(40).default(''),
  id_last4: z.string().trim().toUpperCase().regex(/^([A-Z0-9]{4})?$/, 'ID: enter only the last 4 letters or digits.').default(''),
});

export async function savePassenger(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser('/account/passengers');
  const p = Passenger.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  const id = String(f.get('id') ?? '');
  if (id) {
    const r = await q('update passengers set full_name = $3, phone = $4, label = $5, category = $6, id_type = $7, id_last4 = $8, updated_at = now() where id = $1 and user_id = $2 returning id',
      [id, u.id, p.data.full_name, p.data.phone, p.data.label, p.data.category, p.data.id_type, p.data.id_last4]);
    if (!r.length) return { error: 'That profile no longer exists.' };
  } else {
    const [{ n }] = await q<{ n: number }>('select count(*)::int n from passengers where user_id = $1', [u.id]);
    if (n >= 20) return { error: 'You can save up to 20 passengers. Delete one first.' };
    await q('insert into passengers (user_id, full_name, phone, label, category, id_type, id_last4) values ($1,$2,$3,$4,$5,$6,$7)',
      [u.id, p.data.full_name, p.data.phone, p.data.label, p.data.category, p.data.id_type, p.data.id_last4]);
  }
  revalidatePath('/account/passengers');
  return { ok: id ? 'Passenger updated.' : 'Passenger saved.' };
}

export async function deletePassenger(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser('/account/passengers');
  await q('delete from passengers where id = $1 and user_id = $2', [String(f.get('id')), u.id]);
  revalidatePath('/account/passengers');
  return { ok: 'Passenger deleted.' };
}

const Profile = z.object({ name: z.string().trim().min(2).max(80), phone, passenger_category: z.enum(['regular', 'senior', 'pwd', 'student', 'child']) });

export async function saveProfile(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser('/account/settings');
  const p = Profile.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  await q('update users set name = $2, phone = $3, passenger_category = $4 where id = $1', [u.id, p.data.name, p.data.phone, p.data.passenger_category]);
  revalidatePath('/account', 'layout');
  return { ok: 'Profile saved.' };
}

export async function changePassword(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser('/account/settings');
  const current = String(f.get('current') ?? ''), next = String(f.get('password') ?? '');
  if (next.length < 10 || next.length > 200) return { error: 'Use at least 10 characters for your new password.' };
  const [row] = await q<{ password_hash: string }>('select password_hash from users where id = $1', [u.id]);
  if (!(await verifyPassword(current, row.password_hash))) return { error: 'Your current password is wrong.' };
  await q('update users set password_hash = $2, must_change_password = false where id = $1', [u.id, await hashPassword(next)]);
  await q('delete from sessions where user_id = $1', [u.id]); // sign out other devices
  redirect('/login?changed=1');
}

/** Deletes the account and saved passengers. Bookings and shipments stay for accounting, unlinked from the account. */
export async function deleteAccount(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser('/account/settings');
  const [row] = await q<{ password_hash: string }>('select password_hash from users where id = $1', [u.id]);
  if (!(await verifyPassword(String(f.get('current') ?? ''), row.password_hash))) return { error: 'Your password is wrong.' };
  await endSession();
  await q('delete from users where id = $1', [u.id]);
  redirect('/?deleted=1');
}
