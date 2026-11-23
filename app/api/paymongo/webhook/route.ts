import { NextResponse, type NextRequest } from 'next/server';
import { markPaid } from '@/lib/bookings';
import { markShipmentPaid } from '@/lib/padala';
import { markLoadPaid } from '@/lib/cards';
import { notify } from '@/lib/notify';
import { verifySignature } from '@/lib/paymongo';

// PayMongo event: checkout_session.payment.paid. Register this URL in the PayMongo dashboard (Developers > Webhooks).
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 1_000_000) return new NextResponse(null, { status: 413 });
  let event;
  try { event = JSON.parse(raw); } catch { return new NextResponse(null, { status: 400 }); }

  const attrs = event?.data?.attributes;
  const livemode = attrs?.livemode === true;
  if (!verifySignature(req.headers.get('paymongo-signature'), raw, process.env.PAYMONGO_WEBHOOK_SECRET ?? '', livemode)) {
    return new NextResponse(null, { status: 401 });
  }
  if (attrs?.type === 'checkout_session.payment.paid') {
    const session = attrs.data;
    const paid = (session?.attributes?.payments ?? []).find((p: { attributes: { status: string } }) => p.attributes.status === 'paid');
    if (session?.id && paid) {
      const amount = paid.attributes.amount;
      const done = (await markPaid(session.id, paid.id, amount)) ?? (await markShipmentPaid(session.id, paid.id, amount));
      if (!done) {
        const l = await markLoadPaid(session.id, paid.id, amount);
        if (l?.changed) await notify({ userIds: [l.user_id] }, { kind: 'card.load', title: l.status === 'paid' ? `Card loaded: PHP ${(l.amount / 100).toFixed(2)}` : 'Card load failed', body: l.status === 'paid' ? `Load ${l.ref} is on your card.` : `Load ${l.ref} could not be applied; you will be refunded.`, link: '/account/cards' });
        console.log('webhook paid', session.id, l?.ref ?? 'unknown checkout', l?.status);
      } else console.log('webhook paid', session.id, done.ref, done.status);
    }
  }
  return NextResponse.json({ received: true });
}
