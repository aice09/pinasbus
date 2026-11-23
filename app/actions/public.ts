'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { DEFAULT_BAGGAGE, registerBags, type BaggageRules } from '@/lib/baggage';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { createShipment, getRates, padalaFee } from '@/lib/padala';
import { createCheckout, paymentsConfigured } from '@/lib/paymongo';
import { allow } from '@/lib/ratelimit';
import { connects, network } from '@/lib/trips';
import type { ActionResult } from '@/components/ActionForm';

const ip = async () => (await headers()).get('cf-connecting-ip') ?? 'unknown';
const PHONE = z.string().trim().transform((s) => s.replace(/[\s-]/g, '')).refine((s) => /^(\+63|0)9\d{9}$/.test(s), 'Use a PH mobile number, e.g. 09171234567.');

const Message = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(80),
  email: z.string().trim().email('Enter a valid email.').max(120),
  subject: z.string().trim().min(3, 'Add a subject.').max(120),
  body: z.string().trim().min(10, 'Tell us a bit more (at least 10 characters).').max(4000),
});

export async function sendMessage(_: ActionResult, f: FormData): Promise<ActionResult> {
  if (String(f.get('website') ?? '')) return { ok: 'Message sent.' }; // honeypot
  if (!allow('msg:' + (await ip()), 3, 10 * 60_000)) return { error: 'Too many messages. Try again in a few minutes.' };
  const p = Message.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  await q('insert into messages (name, email, subject, body) values ($1,$2,$3,$4)', [p.data.name, p.data.email, p.data.subject, p.data.body]);
  return { ok: 'Message sent. We reply by email within one working day.' };
}

const Shipment = z.object({
  from: z.string().min(1, 'Choose the terminal you will drop the package at.').max(60),
  to: z.string().min(1, 'Choose the destination terminal.').max(60),
  sender_name: z.string().trim().min(2, 'Enter the sender’s name.').max(80),
  sender_phone: PHONE,
  sender_email: z.string().trim().email('Enter the sender’s email for the receipt.').max(120),
  recipient_name: z.string().trim().min(2, 'Enter the recipient’s name.').max(80),
  recipient_phone: PHONE,
  description: z.string().trim().min(3, 'Describe what is inside.').max(200),
  weight_kg: z.coerce.number().positive('Enter the weight in kg.'),
  declared_value: z.coerce.number().min(0).max(100000, 'Declared value can be at most ₱100,000.'),
});

export async function createPadala(_: ActionResult, f: FormData): Promise<ActionResult> {
  if (!allow('padala:' + (await ip()), 10, 60_000)) return { error: 'Too many attempts. Wait a minute.' };
  if (!paymentsConfigured()) return { error: 'Online payment is not available yet. Send your package at a terminal.' };
  const p = Shipment.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  const s = p.data;
  const rates = await getRates();
  if (s.weight_kg > rates.maxKg) return { error: `Packages up to ${rates.maxKg} kg only. Split heavier items into several shipments.` };
  if (!connects(await network(), s.from, s.to)) return { error: 'No bus runs between those terminals. Choose another pair.' };

  const fee = padalaFee(rates, s.weight_kg, Math.round(s.declared_value * 100));
  const user = await currentUser();
  const sh = await createShipment({
    user_id: user?.id ?? null, sender_name: s.sender_name, sender_phone: s.sender_phone, sender_email: s.sender_email,
    recipient_name: s.recipient_name, recipient_phone: s.recipient_phone, origin: s.from, destination: s.to,
    description: s.description, weight_kg: s.weight_kg, declared_value_centavos: Math.round(s.declared_value * 100), fee_centavos: fee,
  });
  const base = process.env.PUBLIC_BASE_URL ?? `https://${(await headers()).get('host')}`;
  let url: string;
  try {
    const c = await createCheckout({
      ref: sh.ref,
      description: `Padala ${sh.ref}: ${s.from} to ${s.to}, ${s.weight_kg} kg, ${s.description}`,
      lineItems: [{ name: `Padala ${s.from} to ${s.to} (${s.weight_kg} kg)`, amount: fee, quantity: 1 }],
      billing: { name: s.sender_name, email: s.sender_email, phone: s.sender_phone },
      successUrl: `${base}/padala/track?ref=${sh.ref}`,
      cancelUrl: `${base}/padala/track?ref=${sh.ref}&cancelled=1`,
    });
    await q('update shipments set checkout_id = $2 where id = $1', [sh.id, c.id]);
    url = c.url;
  } catch (e) {
    console.error('padala checkout failed', sh.ref, (e as Error).message);
    await q(`update shipments set status = 'cancelled' where id = $1`, [sh.id]);
    return { error: 'The payment page could not be opened. Try again.' };
  }
  redirect(url);
}

// ---------- baggage registration (by whoever holds the ticket reference, like the ticket page itself) ----------
const BagsIn = z.object({
  ref: z.string().regex(/^(PB|BB)[A-Z2-9]{10}$/),
  bags: z.array(z.object({ passenger: z.string().trim().max(80), description: z.string().trim().min(2, 'Describe each bag.').max(120),
    category: z.enum(['regular', 'fragile', 'oversized', 'sports', 'perishable']), weight: z.coerce.number().positive('Enter each bag’s weight.') })).min(1).max(10),
});
export async function addBags(_: ActionResult, f: FormData): Promise<ActionResult> {
  if (!allow('bags:' + (await ip()), 20, 10 * 60_000)) return { error: 'Too many attempts. Wait a few minutes.' };
  const rows = f.getAll('description').map((_, i) => ({ passenger: String(f.getAll('passenger')[i] ?? ''), description: String(f.getAll('description')[i] ?? ''), category: String(f.getAll('category')[i] ?? 'regular'), weight: String(f.getAll('weight')[i] ?? '') }))
    .filter((r) => r.description.trim() || r.weight);
  const p = BagsIn.safeParse({ ref: f.get('ref'), bags: rows });
  if (!p.success) return { error: p.error.issues[0].message };
  const [b] = await q<{ id: string; org_id: string; trip_uuid: string; seats: string[]; passengers: { name: string }[]; name: string; status: string; trip_status: string; settings: { baggage?: Partial<BaggageRules> } }>(
    `select b.id, b.org_id, b.trip_uuid, b.seats, b.passengers, b.name, b.status, t.status trip_status, o.settings
       from bookings b join trips t on t.id = b.trip_uuid join organizations o on o.id = b.org_id where b.ref = $1`, [p.data.ref]);
  if (!b || b.status !== 'paid') return { error: 'Bags can be added to paid tickets only.' };
  if (['departed', 'arrived', 'cancelled'].includes(b.trip_status)) return { error: 'This trip has already left.' };
  const user = await currentUser();
  const r = await registerBags(b, p.data.bags, { ...DEFAULT_BAGGAGE, ...(b.settings.baggage ?? {}) }, user?.id ?? null);
  if ('error' in r) return { error: r.error };
  revalidatePath(`/booking/${p.data.ref}`);
  return { ok: `${r.bags.length} bag${r.bags.length > 1 ? 's' : ''} registered${r.fee ? `. Excess baggage fee: PHP ${(r.fee / 100).toFixed(2)}, paid at the terminal check-in` : ', within your free allowance'}.` };
}
