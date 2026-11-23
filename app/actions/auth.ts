'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { endSession, hashPassword, hashToken, safeNext, startMfaChallenge, startSession, takeMfaChallenge, verifyPassword } from '@/lib/auth';
import { randomBytes } from 'node:crypto';
import { notify } from '@/lib/notify';
import { open } from '@/lib/secretbox';
import { verifyTotp } from '@/lib/totp';
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
  const [u] = await q<{ id: string; password_hash: string; mfa_enabled: boolean; disabled: boolean }>('select id, password_hash, mfa_enabled, disabled from users where lower(email) = $1', [email]);
  // Same message and similar work either way, so the form doesn't reveal which emails have accounts.
  const ok = u ? await verifyPassword(password, u.password_hash) : (await hashPassword(password), false);
  if (!u || !ok || u.disabled) return { error: 'Email or password is wrong.' };
  if (u.mfa_enabled) {
    await startMfaChallenge(u.id, safeNext(f.get('next')));
    redirect('/login/mfa');
  }
  await startSession(u.id, email);
  redirect(safeNext(f.get('next')));
}

export async function verifyMfa(_: ActionResult, f: FormData): Promise<ActionResult> {
  if (!allow('mfa:' + (await ip()), 10, 10 * 60_000)) return { error: 'Too many attempts. Wait 10 minutes.' };
  const c = await takeMfaChallenge();
  if (!c) return { error: 'This sign-in expired. Start again.' };
  if (!c.mfa_secret || !verifyTotp(open(c.mfa_secret, `mfa:${c.user_id}`), String(f.get('code') ?? '').replace(/\s/g, ''))) return { error: 'That code is wrong or expired.' };
  await c.done();
  await startSession(c.user_id, c.email);
  redirect(c.next);
}

/** Always answers the same way, so the form does not reveal which emails have accounts. */
export async function requestReset(_: ActionResult, f: FormData): Promise<ActionResult> {
  if (!allow('reset:' + (await ip()), 5, 30 * 60_000)) return { error: 'Too many requests. Try again later.' };
  const email = String(f.get('email') ?? '').trim().toLowerCase().slice(0, 120);
  const [u] = await q<{ id: string }>('select id from users where lower(email) = $1 and not disabled', [email]);
  if (u) {
    const token = randomBytes(32).toString('base64url');
    await q(`insert into password_resets (token_hash, user_id, expires_at) values ($1,$2, now() + interval '30 minutes')`, [hashToken(token), u.id]);
    await notify({ emails: [email] }, { kind: 'password.reset', title: 'Reset your PINASBUS password', body: 'Someone asked to reset your password. The link works for 30 minutes. If it was not you, ignore this email.', link: `/reset?token=${token}` });
  }
  return { ok: 'If that email has an account, a reset link is on its way. It works for 30 minutes.' };
}

export async function resetPassword(_: ActionResult, f: FormData): Promise<ActionResult> {
  const token = String(f.get('token') ?? ''), pw = String(f.get('password') ?? '');
  if (pw.length < 10 || pw.length > 200) return { error: 'Use at least 10 characters.' };
  const [r] = await q<{ user_id: string }>(`update password_resets set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning user_id`, [hashToken(token)]);
  if (!r) return { error: 'This link expired or was already used. Ask for a new one.' };
  await q('update users set password_hash = $2, must_change_password = false where id = $1', [r.user_id, await hashPassword(pw)]);
  await q('delete from sessions where user_id = $1', [r.user_id]);
  redirect('/login?changed=1');
}

export async function signOut() {
  await endSession();
  redirect('/');
}
