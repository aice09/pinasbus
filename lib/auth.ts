import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { q } from './db.ts';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = 'bb_session';
const SESSION_DAYS = 30;

export type User = { id: string; email: string; name: string; phone: string; role: 'customer' | 'admin'; created_at: Date };

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await scrypt(pw, salt, 64)).toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), want.length);
  return timingSafeEqual(got, want);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Emails listed in ADMIN_EMAILS become admins when they sign up or sign in. */
const adminEmails = () => (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function startSession(userId: string, email: string) {
  if (adminEmails().includes(email.toLowerCase())) await q(`update users set role = 'admin' where id = $1`, [userId]);
  const token = randomBytes(32).toString('base64url');
  await q(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`, [sha(token), userId, SESSION_DAYS]);
  await q(`delete from sessions where user_id = $1 and expires_at < now()`, [userId]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q('delete from sessions where token_hash = $1', [sha(token)]);
  jar.delete(COOKIE);
}

/** The signed-in user for this request, or null. Cached per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const rows = await q<User>(
    `select u.id, u.email, u.name, u.phone, u.role, u.created_at from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`, [sha(token)]);
  return rows[0] ?? null;
});

export async function requireUser(next = '/account') {
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export async function requireAdmin() {
  const u = await requireUser('/admin');
  if (u.role !== 'admin') redirect('/account');
  return u;
}

/** Only allow same-site relative redirects after sign-in. */
export const safeNext = (n: unknown) => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&%.]*$/.test(n) ? n : '/account');
