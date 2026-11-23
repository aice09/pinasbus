// PayMongo Checkout Sessions: https://developers.paymongo.com/reference/checkout-session-resource
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.paymongo.com/v1';

export const paymentsConfigured = () => Boolean(process.env.PAYMONGO_SECRET_KEY);

async function call(path: string, init: RequestInit = {}) {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new Error('PAYMONGO_SECRET_KEY is not set');
  const res = await fetch(API + path, {
    ...init,
    headers: { authorization: 'Basic ' + Buffer.from(key + ':').toString('base64'), 'content-type': 'application/json', accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PayMongo ${init.method ?? 'GET'} ${path} ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 500)}`);
  return body.data;
}

export type CheckoutInput = {
  ref: string;
  description: string;
  lineItems: { name: string; amount: number; quantity: number }[];
  billing: { name: string; email: string; phone: string };
  successUrl: string;
  cancelUrl: string;
};

export async function createCheckout(i: CheckoutInput): Promise<{ id: string; url: string }> {
  const methods = (process.env.PAYMONGO_METHODS ?? 'card,gcash,paymaya').split(',').map((s) => s.trim()).filter(Boolean);
  const data = await call('/checkout_sessions', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: i.lineItems.map((l) => ({ ...l, currency: 'PHP' })),
          payment_method_types: methods,
          description: i.description,
          reference_number: i.ref,
          billing: i.billing,
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          success_url: i.successUrl,
          cancel_url: i.cancelUrl,
          metadata: { booking_ref: i.ref },
        },
      },
    }),
  });
  return { id: data.id, url: data.attributes.checkout_url };
}

/** Returns the paid payment id and amount, or null while unpaid. */
export async function paidPayment(checkoutId: string): Promise<{ id: string; amount: number } | null> {
  const data = await call(`/checkout_sessions/${encodeURIComponent(checkoutId)}`);
  const p = (data.attributes.payments ?? []).find((x: { attributes: { status: string } }) => x.attributes.status === 'paid');
  return p ? { id: p.id, amount: p.attributes.amount } : null;
}

export async function expireCheckout(checkoutId: string) {
  await call(`/checkout_sessions/${encodeURIComponent(checkoutId)}/expire`, { method: 'POST' });
}

/**
 * Verifies the Paymongo-Signature header: "t=<unix>,te=<test hmac>,li=<live hmac>",
 * hmac = HMAC-SHA256(webhook secret, `${t}.${rawBody}`) in hex.
 */
export function verifySignature(header: string | null, rawBody: string, secret: string, livemode: boolean): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]; }));
  const given = livemode ? parts.li : parts.te;
  if (!parts.t || !given) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
