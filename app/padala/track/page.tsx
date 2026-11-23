import Link from 'next/link';
import type { Metadata } from 'next';
import { currentUser } from '@/lib/auth';
import { peso } from '@/lib/catalog';
import { maskName, shipmentByRef, shipmentEvents, STATUS_TEXT, syncShipment } from '@/lib/padala';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Track a package', robots: { index: false } };

const FLOW = ['paid', 'received', 'in_transit', 'arrived', 'claimed'] as const;

export default async function Track({ searchParams }: { searchParams: Promise<{ ref?: string; cancelled?: string }> }) {
  const sp = await searchParams;
  const ref = (sp.ref ?? '').trim().toUpperCase();
  const found = /^PD[A-Z2-9]{10}$/.test(ref) ? await shipmentByRef(ref) : null;
  const s = found ? await syncShipment(found) : null;
  const events = s ? await shipmentEvents(s.id) : [];
  const user = await currentUser();
  const mine = s && user && (s.user_id === user.id || user.platform_role === 'platform_admin');
  const step = s ? FLOW.indexOf(s.status as (typeof FLOW)[number]) : -1;

  return (
    <main className="narrow">
      <h1 className="page-h">Track a package</h1>
      <form className="inline-form" action="/padala/track" method="get">
        <label className="field grow">Reference number<input name="ref" defaultValue={ref} placeholder="PD…" required pattern="[Pp][Dd][A-Za-z2-9]{10}" /></label>
        <button className="btn" type="submit">Track</button>
      </form>
      {ref && !s && <p className="error" role="alert">No package with that reference. Check the 12 characters on your receipt.</p>}
      {s && (
        <article className="ticket">
          <div className="ticket-head">
            <span className="display">{s.origin} → {s.destination}</span>
            <span className="mono">{s.ref}</span>
          </div>
          <div className="ticket-body">
            {sp.cancelled && s.status === 'pending_payment' && <p className="note">Payment was cancelled. Start again from the Padala page when you are ready.</p>}
            <p><span className={`status ${s.status === 'cancelled' ? 'expired' : step >= 3 ? 'paid' : 'pending'}`}>{STATUS_TEXT[s.status]}</span></p>
            <ol className="progress" aria-label="Progress">
              {FLOW.map((f, i) => <li key={f} className={i <= step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>{STATUS_TEXT[f]}</li>)}
            </ol>
            <div className="ticket-grid">
              <div><small>From</small><strong>{mine ? s.sender_name : maskName(s.sender_name)}</strong></div>
              <div><small>To</small><strong>{mine ? s.recipient_name : maskName(s.recipient_name)}</strong></div>
              <div><small>Package</small><strong>{s.weight_kg} kg{mine ? `, ${s.description}` : ''}</strong></div>
              {mine && <div><small>Fee</small><strong>{peso(s.fee_centavos)}</strong></div>}
            </div>
            <h2 className="h3">Timeline</h2>
            <ul className="timeline">
              {events.map((e, i) => (
                <li key={i}><time>{e.created_at.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time> {STATUS_TEXT[e.status]}{e.note && `. ${e.note}`}</li>
              ))}
            </ul>
            <p className="note">The recipient claims the package at {s.destination} with a valid ID and this reference.</p>
            {mine && <p><Link className="btn quiet" href={`/padala?again=${s.ref}`}>Send again</Link></p>}
          </div>
        </article>
      )}
    </main>
  );
}
