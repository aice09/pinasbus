'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { issuerFor, newCardNumber, newLoadRef, validCardNumber } from '@/lib/cards';
import { q } from '@/lib/db';
import { createCheckout, paymentsConfigured } from '@/lib/paymongo';
import { allow } from '@/lib/ratelimit';
import { actionCtx, audit, isErr } from '@/lib/tenancy';
import type { ActionResult } from '@/components/ActionForm';

type R = Promise<ActionResult>;
const slug = (f: FormData) => String(f.get('org') ?? '');

// ---------- issuer workspace ----------
export async function saveProgram(_: ActionResult, f: FormData): R {
  const c = await actionCtx(slug(f), 'cards.manage'); if (isErr(c)) return c;
  const P = z.object({ name: z.string().trim().min(2).max(60), prefix: z.string().regex(/^\d{4}$/, 'Prefix: 4 digits.'),
    min_load: z.coerce.number().min(1).max(10000), max_balance: z.coerce.number().min(100).max(100000) });
  const p = P.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  try {
    await q(`insert into card_programs (org_id, name, prefix, min_load_centavos, max_balance_centavos) values ($1,$2,$3,$4,$5)
             on conflict (org_id, name) do update set prefix = $3, min_load_centavos = $4, max_balance_centavos = $5`,
      [c.org.id, p.data.name, p.data.prefix, Math.round(p.data.min_load * 100), Math.round(p.data.max_balance * 100)]);
  } catch (e) { if ((e as { code?: string }).code === '23514') return { error: 'Check the prefix.' }; throw e; }
  await audit(c.user.id, c.org.id, 'card_program.save', 'card_program', p.data.name, p.data);
  revalidatePath(`/cards/${c.org.slug}`, 'layout');
  return { ok: 'Program saved.' };
}

export async function issueCards(_: ActionResult, f: FormData): R {
  const c = await actionCtx(slug(f), 'cards.manage'); if (isErr(c)) return c;
  const count = Math.min(500, Math.max(1, Number(f.get('count')) || 0));
  const [prog] = await q<{ id: string; prefix: string }>('select id, prefix from card_programs where id = $1 and org_id = $2', [String(f.get('program')), c.org.id]);
  if (!prog) return { error: 'Choose a program.' };
  let made = 0;
  for (let i = 0; i < count; i++) made += (await q(`insert into cards (org_id, program_id, number, status) values ($1,$2,$3,'inventory') on conflict (number) do nothing returning id`, [c.org.id, prog.id, newCardNumber(prog.prefix)])).length;
  await audit(c.user.id, c.org.id, 'card.issue', 'card_program', prog.id, { count: made });
  revalidatePath(`/cards/${c.org.slug}`, 'layout');
  return { ok: `${made} cards added to inventory. Hand them out; holders link them in their account.` };
}

export async function setCardStatus(_: ActionResult, f: FormData): R {
  const c = await actionCtx(slug(f), 'cards.manage'); if (isErr(c)) return c;
  const status = String(f.get('status'));
  if (!['active', 'blocked'].includes(status)) return { error: 'Unknown status.' };
  const r = await q('update cards set status = $3 where id = $1 and org_id = $2 returning number', [String(f.get('id')), c.org.id, status]);
  if (!r.length) return { error: 'Card not found.' };
  await audit(c.user.id, c.org.id, `card.${status === 'blocked' ? 'block' : 'unblock'}`, 'card', String(f.get('id')));
  revalidatePath(`/cards/${c.org.slug}`, 'layout');
  return { ok: status === 'blocked' ? 'Card blocked: it can no longer pay or load.' : 'Card active.' };
}

export async function adjustCard(_: ActionResult, f: FormData): R {
  const c = await actionCtx(slug(f), 'cards.manage'); if (isErr(c)) return c;
  const amount = Math.round(Number(f.get('amount')) * 100), reason = String(f.get('reason') ?? '').trim().slice(0, 120);
  const [card] = await q<{ id: string }>('select id from cards where id = $1 and org_id = $2', [String(f.get('id')), c.org.id]);
  if (!card || !amount || reason.length < 3) return { error: 'Enter a non-zero amount and a reason.' };
  const ref = `ADJ-${Date.now()}`;
  const r = amount > 0 ? await issuerFor(c.org.id).load({ cardId: card.id, amount, reference: ref, channel: `adjustment: ${reason}` })
    : await issuerFor(c.org.id).charge({ cardId: card.id, amount: -amount, reference: ref, channel: `adjustment: ${reason}` });
  if (!r.ok) return { error: r.error };
  await audit(c.user.id, c.org.id, 'card.adjust', 'card', card.id, { amount, reason });
  revalidatePath(`/cards/${c.org.slug}`, 'layout');
  return { ok: `Adjusted. New balance PHP ${(r.balance / 100).toFixed(2)}.` };
}

// ---------- passengers ----------
export async function linkCard(_: ActionResult, f: FormData): R {
  const u = await requireUser('/account/cards');
  if (!allow('cardlink:' + u.id, 10, 10 * 60_000)) return { error: 'Too many attempts. Wait 10 minutes.' };
  const number = String(f.get('number') ?? '').replace(/\D/g, '');
  if (!validCardNumber(number)) return { error: 'That is not a valid 16-digit card number. Check the digits on the back of the card.' };
  const r = await q(`update cards set user_id = $2, holder_name = $3, status = case when status = 'inventory' then 'active' else status end
                     where number = $1 and (user_id is null or user_id = $2) and status <> 'blocked' returning id`, [number, u.id, u.name]);
  if (!r.length) return { error: 'This card cannot be linked. It may belong to someone else or be blocked; ask the card issuer.' };
  revalidatePath('/account/cards');
  return { ok: 'Card linked to your account.' };
}

export async function unlinkCard(_: ActionResult, f: FormData): R {
  const u = await requireUser('/account/cards');
  await q('update cards set user_id = null where id = $1 and user_id = $2', [String(f.get('id')), u.id]);
  revalidatePath('/account/cards');
  return { ok: 'Card removed from your account. Its balance stays on the card.' };
}

export async function startLoad(_: ActionResult, f: FormData): R {
  const u = await requireUser('/account/cards');
  if (!paymentsConfigured()) return { error: 'Online payment is not available.' };
  const [card] = await q<{ id: string; number: string; status: string; min: number; max: number; balance: number; issuer: string }>(
    `select c.id, c.number, c.status, p.min_load_centavos min, p.max_balance_centavos max, c.balance_centavos balance, o.name issuer
       from cards c join card_programs p on p.id = c.program_id join organizations o on o.id = c.org_id where c.id = $1 and c.user_id = $2`, [String(f.get('id')), u.id]);
  if (!card || card.status !== 'active') return { error: 'Choose one of your active cards.' };
  const amount = Math.round(Number(f.get('amount')) * 100);
  if (!(amount >= card.min)) return { error: `Load at least PHP ${(card.min / 100).toFixed(2)}.` };
  if (card.balance + amount > card.max) return { error: `The card can hold at most PHP ${(card.max / 100).toFixed(2)}.` };
  const ref = newLoadRef();
  const [l] = await q<{ id: string }>('insert into card_loads (ref, card_id, user_id, amount_centavos) values ($1,$2,$3,$4) returning id', [ref, card.id, u.id, amount]);
  const base = process.env.PUBLIC_BASE_URL ?? `https://${(await headers()).get('host')}`;
  let url: string;
  try {
    const co = await createCheckout({ ref, description: `Load ${card.issuer} card •••• ${card.number.slice(-4)}`, lineItems: [{ name: `Card load •••• ${card.number.slice(-4)}`, amount, quantity: 1 }],
      billing: { name: u.name, email: u.email, phone: u.phone || '09170000000' }, successUrl: `${base}/account/cards?loaded=${ref}`, cancelUrl: `${base}/account/cards` });
    await q('update card_loads set checkout_id = $2 where id = $1', [l.id, co.id]);
    url = co.url;
  } catch (e) {
    console.error('card load checkout failed', (e as Error).message);
    await q(`update card_loads set status = 'failed' where id = $1`, [l.id]);
    return { error: 'The payment page could not be opened. Try again.' };
  }
  redirect(url);
}
