'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { endSession, hashPassword, safeNext, startSession, verifyPassword } from '@/lib/auth';
import { q } from '@/lib/db';
import { allow } from '@/lib/ratelimit';
import type { ActionResult } from '@/components/ActionForm';

const ip = async () => (await headers()).get('cf-connecting-ip') ?? (await headers()).get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
const PHONE = /^(\+63|0)9\d{9}$/;

const SignUp = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email.').max(120),
  phone: z.string().trim().transform((s) => s.replace(/[\s-]/g, '')).refine((s) => PHONE.test(s), 'Use a PH mobile number, e.g. 09171234567.'),
  password: z.string().min(10, 'Use at least 10 characters for your password.').max(200),
  agree: z.literal('on', { message: 'Accept the terms and privacy notice to continue.' }),
});

export async function signUp(_: ActionResult, f: FormData): Promise<ActionResult> {
  if (!allow('signup:' + (await ip()), 5, 10 * 60_000)) return { error: 'Too many sign-ups from this network. Try again later.' };
  const p = SignUp.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  const exists = await q('select 1 from users where lower(email) = $1', [p.data.email]);
  if (exists.length) return { error: 'An account with this email already exists. Sign in instead.' };
  const [u] = await q<{ id: string }>('insert into users (email, name, phone, password_hash) values ($1,$2,$3,$4) returning id',
    [p.data.email, p.data.name, p.data.phone, await hashPassword(p.data.password)]);
  await startSession(u.id, p.data.email);
  redirect(safeNext(f.get('next')));
}

export async function signIn(_: ActionResult, f: FormData): Promise<ActionResult> {
  const email = String(f.get('email') ?? '').trim().toLowerCase().slice(0, 120);
  const password = String(f.get('password') ?? '').slice(0, 200);
  if (!allow('login:' + (await ip()), 10, 10 * 60_000) || !allow('login:' + email, 5, 10 * 60_000)) {
    return { error: 'Too many attempts. Wait 10 minutes and try again.' };
  }
  const [u] = await q<{ id: string; password_hash: string }>('select id, password_hash from users where lower(email) = $1', [email]);
  // Same message and similar work either way, so the form doesn't reveal which emails have accounts.
  const ok = u ? await verifyPassword(password, u.password_hash) : (await hashPassword(password), false);
  if (!u || !ok) return { error: 'Email or password is wrong.' };
  await startSession(u.id, email);
  redirect(safeNext(f.get('next')));
}

export async function signOut() {
  await endSession();
  redirect('/');
}
