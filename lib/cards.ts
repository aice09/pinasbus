// Stored-value transport cards. PINASBUS never owns a card balance: every balance change goes through an IssuerAdapter,
// the issuer's authoritative system. The bundled LocalIssuer is the demo issuer's own ledger; a real issuer plugs in
// another adapter that calls its API (see docs/card-issuer-guide.md).
import { randomBytes } from 'node:crypto';
import { q, tx } from './db.ts';

export type CardOp = { cardId: string; amount: number; reference: string; channel: string };
export interface IssuerAdapter {
  balance(cardId: string): Promise<number>;
  /** Idempotent by reference: repeating a load or charge with the same reference changes nothing. */
  load(op: CardOp): Promise<{ ok: true; balance: number } | { ok: false; error: string }>;
  charge(op: CardOp): Promise<{ ok: true; balance: number } | { ok: false; error: string }>;
  refund(op: CardOp): Promise<{ ok: true; balance: number } | { ok: false; error: string }>;
}

async function post(kind: 'load' | 'fare' | 'refund', op: CardOp, sign: 1 | -1) {
  return tx(async (c) => {
    const { rows: [card] } = await c.query<{ balance_centavos: number; status: string; max: number }>(
      `select c.balance_centavos, c.status, p.max_balance_centavos max from cards c join card_programs p on p.id = c.program_id where c.id = $1 for update of c`, [op.cardId]);
    if (!card) return { ok: false as const, error: 'Unknown card.' };
    const { rows: done } = await c.query<{ balance_after: number }>('select balance_after from card_ledger where kind = $1 and reference = $2', [kind, op.reference]);
    if (done.length) return { ok: true as const, balance: card.balance_centavos };
    if (card.status !== 'active') return { ok: false as const, error: 'This card is blocked or not activated.' };
    const next = card.balance_centavos + sign * op.amount;
    if (next < 0) return { ok: false as const, error: 'Not enough balance on the card.' };
    if (sign > 0 && next > card.max) return { ok: false as const, error: `The card can hold at most PHP ${(card.max / 100).toFixed(2)}.` };
    await c.query('update cards set balance_centavos = $2 where id = $1', [op.cardId, next]);
    await c.query('insert into card_ledger (card_id, kind, amount_centavos, balance_after, reference, channel) values ($1,$2,$3,$4,$5,$6)',
      [op.cardId, kind, sign * op.amount, next, op.reference, op.channel]);
    return { ok: true as const, balance: next };
  });
}

export const LocalIssuer: IssuerAdapter = {
  balance: async (cardId) => (await q<{ b: number }>('select balance_centavos b from cards where id = $1', [cardId]))[0]?.b ?? 0,
  load: (op) => post('load', op, 1),
  charge: (op) => post('fare', op, -1),
  refund: (op) => post('refund', op, 1),
};

/** The adapter for a card's issuer. Only the bundled demo issuer exists today. */
export const issuerFor = (_issuerOrgId: string): IssuerAdapter => LocalIssuer;

/** Luhn check digit, so typos in a 16-digit card number are caught before lookup. */
export function luhnDigit(body: string) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}
export const validCardNumber = (n: string) => /^\d{16}$/.test(n) && luhnDigit(n.slice(0, 15)) === n[15];
export function newCardNumber(prefix: string) {
  const body = prefix + [...randomBytes(11)].map((b) => b % 10).join('');
  return body + luhnDigit(body);
}
export const maskCard = (n: string) => `•••• ${n.slice(-4)}`;

export const newLoadRef = () => 'LD' + [...randomBytes(10)].map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

/** Called when PayMongo confirms a card-load payment. Idempotent. */
export async function markLoadPaid(checkoutId: string, paymentId: string, amount: number) {
  const [l] = await q<{ id: string; ref: string; card_id: string; org_id: string; amount_centavos: number; status: string; user_id: string | null }>(
    `select l.id, l.ref, l.card_id, c.org_id, l.amount_centavos, l.status, l.user_id from card_loads l join cards c on c.id = l.card_id where l.checkout_id = $1`, [checkoutId]);
  if (!l) return null;
  if (l.status !== 'pending') return { ref: l.ref, status: l.status, changed: false, user_id: l.user_id, amount: l.amount_centavos };
  if (amount !== l.amount_centavos) { await q(`update card_loads set status = 'failed', payment_id = $2 where id = $1`, [l.id, paymentId]); return { ref: l.ref, status: 'failed', changed: true, user_id: l.user_id, amount }; }
  const r = await issuerFor(l.org_id).load({ cardId: l.card_id, amount, reference: l.ref, channel: 'paymongo' });
  await q(`update card_loads set status = $2, payment_id = $3 where id = $1`, [l.id, r.ok ? 'paid' : 'failed', paymentId]);
  return { ref: l.ref, status: r.ok ? 'paid' : 'failed', changed: true, user_id: l.user_id, amount };
}
