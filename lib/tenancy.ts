// Tenant context. Every company-scoped page and action resolves the organization from the URL slug and
// checks the caller's membership + permission on the server. Queries then filter by org.id.
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { PRIVILEGED_ROLES, requireMfa, requireUser, type User } from './auth.ts';
import { q } from './db.ts';
import { can, ROLES, type Permission, type Role } from './rbac.ts';
import { DEFAULT_DISCOUNTS, DEFAULT_POLICY, type Discounts, type SeatPolicy } from './seatpolicy.ts';

export type Org = {
  id: string; kind: 'platform' | 'bus_operator' | 'card_issuer' | 'shipping_operator'; name: string; slug: string;
  status: 'pending' | 'active' | 'suspended'; contact_email: string; contact_phone: string; address: string;
  settings: { seatPolicy?: SeatPolicy; discounts?: Discounts; baggage?: { freeKgPerSeat: number; excessPerKgCentavos: number; maxBagsPerSeat: number }; tracking?: { speedLimitKph: number; deviationKm: number; unusualStopMinutes: number }; payments?: { online: boolean; cards: boolean; cash: boolean } }; is_demo: boolean; data_sources: { url: string; verified_at: string; what: string; verified: boolean }[];
};
export type Ctx = { user: User; org: Org; role: Role; can: (p: Permission) => boolean; platform: boolean };

export class Forbidden extends Error {}

export const orgBySlug = async (slug: string) => (await q<Org>('select * from organizations where slug = $1', [slug]))[0] ?? null;
export const orgPolicy = (o: Pick<Org, 'settings'>) => ({ ...DEFAULT_POLICY, ...(o.settings.seatPolicy ?? {}) });
export const orgDiscounts = (o: Pick<Org, 'settings'>) => ({ ...DEFAULT_DISCOUNTS, ...(o.settings.discounts ?? {}) });

/**
 * Resolves the company and the caller's role. Platform admins act as an auditor (read-only) inside any company.
 * Pages: redirects/404s. Actions: pass `throwing` to get a Forbidden error instead.
 */
export async function orgCtx(slug: string, perm?: Permission, opts: { throwing?: boolean } = {}): Promise<Ctx> {
  const user = await requireUser(`/ops/${slug}`);
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const m = user.memberships.find((x) => x.org_id === org.id);
  const platform = user.platform_role === 'platform_admin';
  const role: Role | null = m?.role ?? (platform ? 'auditor' : null);
  const ok = !!role && (org.status === 'active' || platform) && (!perm || can(role, perm));
  if (!ok) {
    if (opts.throwing) throw new Forbidden(`missing ${perm ?? 'membership'}`);
    redirect('/account?denied=1');
  }
  if (PRIVILEGED_ROLES.includes(role!) || platform) requireMfa(user);
  return { user, org, role: role!, can: (p) => can(role, p), platform };
}

/** For server actions: returns {error} instead of throwing, so the form can show it. */
export async function actionCtx(slug: string, perm: Permission): Promise<Ctx | { error: string }> {
  try { return await orgCtx(slug, perm, { throwing: true }); }
  catch (e) { if (e instanceof Forbidden) return { error: 'You do not have permission to do that.' }; throw e; }
}
export const isErr = (x: unknown): x is { error: string } => !!x && typeof x === 'object' && 'error' in x;

export async function audit(actorId: string | null, orgId: string | null, action: string, entity = '', entityId = '', data: object = {}) {
  const h = await headers().catch(() => null);
  const ip = h?.get('cf-connecting-ip') ?? h?.get('x-forwarded-for')?.split(',')[0] ?? '';
  await q('insert into audit_log (actor_id, org_id, action, entity, entity_id, data, ip) values ($1,$2,$3,$4,$5,$6,$7)',
    [actorId, orgId, action, entity, entityId, JSON.stringify(data), ip]);
}

export const roleName = (r: Role) => ROLES[r].name;
