import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { q } from './db.ts';
import type { Role } from './rbac.ts';
import type { PassengerCategory } from './seatpolicy.ts';

export { hashPassword, verifyPassword } from './password.ts';

const COOKIE = 'pb_session';
const SESSION_DAYS = 30;

export type Membership = { org_id: string; role: Role; org_name: string; org_slug: string; org_kind: string; org_status: string };
export type User = {
  id: string; email: string; name: string; phone: string; created_at: Date;
  platform_role: 'none' | 'platform_admin'; passenger_category: PassengerCategory; id_type: string; id_last4: string;
  must_change_password: boolean; mfa_enabled: boolean; memberships: Membership[];
};

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Emails listed in PLATFORM_ADMIN_EMAILS (or the older ADMIN_EMAILS) become platform admins when they sign in. */
const adminEmails = () => (process.env.PLATFORM_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function startSession(userId: string, email: string) {
  if (adminEmails().includes(email.toLowerCase())) await q(`update users set platform_role = 'platform_admin', role = 'admin' where id = $1`, [userId]);
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

/** The signed-in user for this request with their organization memberships, or null. Cached per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const rows = await q<Omit<User, 'memberships'>>(
    `select u.id, u.email, u.name, u.phone, u.created_at, u.platform_role, u.passenger_category, u.id_type, u.id_last4, u.must_change_password, u.mfa_enabled
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now() and not u.disabled`, [sha(token)]);
  if (!rows[0]) return null;
  const memberships = await q<Membership>(
    `select m.org_id, m.role, o.name org_name, o.slug org_slug, o.kind org_kind, o.status org_status
       from memberships m join organizations o on o.id = m.org_id where m.user_id = $1 order by o.name`, [rows[0].id]);
  return { ...rows[0], memberships };
});

export async function requireUser(next = '/account') {
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export async function requirePlatformAdmin() {
  const u = await requireUser('/platform');
  if (u.platform_role !== 'platform_admin') redirect('/account');
  requireMfa(u);
  return u;
}

/** Privileged roles must use two-step sign-in (set MFA_REQUIRED=false only for local development). */
export const PRIVILEGED_ROLES = ['company_admin', 'finance_officer', 'shipping_admin', 'card_admin'];
export function requireMfa(u: User) {
  if (process.env.MFA_REQUIRED !== 'false' && !u.mfa_enabled) redirect('/account/security?required=1');
}

const MFA_COOKIE = 'pb_mfa';
/** First factor passed: park the user in a 10-minute challenge until the authenticator code arrives. */
export async function startMfaChallenge(userId: string, next: string) {
  const token = randomBytes(32).toString('base64url');
  await q(`insert into mfa_challenges (token_hash, user_id, next, expires_at) values ($1,$2,$3, now() + interval '10 minutes')`, [sha(token), userId, next]);
  (await cookies()).set(MFA_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 });
}
export async function takeMfaChallenge() {
  const token = (await cookies()).get(MFA_COOKIE)?.value;
  if (!token) return null;
  const [c] = await q<{ user_id: string; next: string; email: string; mfa_secret: string }>(
    `select c.user_id, c.next, u.email, u.mfa_secret from mfa_challenges c join users u on u.id = c.user_id where c.token_hash = $1 and c.expires_at > now()`, [sha(token)]);
  return c ? { ...c, done: async () => { await q('delete from mfa_challenges where token_hash = $1', [sha(token)]); (await cookies()).delete(MFA_COOKIE); } } : null;
}
export const hashToken = sha;

/** Only allow same-site relative redirects after sign-in. */
export const safeNext = (n: unknown) => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&%.]*$/.test(n) ? n : '/account');
