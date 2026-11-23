import Link from 'next/link';
import type { Metadata } from 'next';
import { ferryStep } from '@/app/actions/ferry';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { CREW_STEPS, LINK_STATUSES, linkByToken, nextSteps, SHIP_STEPS } from '@/lib/ferry';
import { can } from '@/lib/rbac';
import { ActionForm } from '@/components/ActionForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ferry boarding', robots: { index: false } };

/** Opened by scanning a ferry reservation QR. Bus crew and shipping staff each see only the steps they may record. */
export default async function Scan({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  const u = await requireUser(`/ferry/scan?token=${encodeURIComponent(token)}`);
  const link = token ? await linkByToken(token) : null;
  if (!link) return <main className="narrow"><h1 className="page-h">Ferry boarding</h1><p className="error">This code is not a valid ferry reservation. Scan the QR on the trip manifest again.</p></main>;
  const bus = u.memberships.find((m) => m.org_id === link.bus_org_id), ship = u.memberships.find((m) => m.org_id === link.ship_org_id);
  const isCrew = !!bus && (link.driver_id === u.id || link.conductor_id === u.id || can(bus.role, 'trips.dispatch'));
  const isShip = !!ship && can(ship.role, 'ships.operate');
  const steps = [...new Set([...(isCrew ? CREW_STEPS : []), ...(isShip ? SHIP_STEPS : [])])].filter((s) => s === 'cancelled' || nextSteps(link.status).includes(s) || (s === 'waiting' && link.status === 'reserved'));
  const events = await q<{ status: keyof typeof LINK_STATUSES; note: string; created_at: Date; actor: string | null }>(
    'select e.status, e.note, e.created_at, u.name actor from ferry_events e left join users u on u.id = e.actor_id join ferry_links l on l.id = e.link_id where l.qr_token = $1 order by e.id', [token]);
  return (
    <main className="narrow">
      <h1 className="page-h">Ferry {link.reference}</h1>
      <div className="ticket-grid">
        <div><small>Bus</small><strong>{link.bus_org}, trip {link.trip_code}{link.plate ? `, ${link.plate}` : ''}</strong></div>
        <div><small>Vessel</small><strong>{link.vessel} ({link.ship_org})</strong></div>
        <div><small>Crossing</small><strong>{link.from_port} → {link.to_port}</strong></div>
        <div><small>Sails</small><strong>{link.departs_at.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ({link.sailing_status})</strong></div>
      </div>
      <p><span className="status pending">{LINK_STATUSES[link.status]}</span> <span className="note">Reservation verified.</span></p>
      {!isCrew && !isShip && <p className="error">You are not crew on this trip or staff of this shipping company, so you can only view it.</p>}
      {steps.length > 0 && (
        <section className="panel">
          <h2>Record the next step</h2>
          <ActionForm action={ferryStep} submit="Record">
            <input type="hidden" name="token" value={token} />
            <label className="field">Step<select name="status">{steps.map((s) => <option key={s} value={s}>{LINK_STATUSES[s]}</option>)}</select></label>
            <label className="field">Note (optional)<input name="note" maxLength={200} placeholder="Lane 3, deck B" /></label>
          </ActionForm>
        </section>
      )}
      <ul className="timeline">{events.map((e, i) => <li key={i}><time>{e.created_at.toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}</time> {LINK_STATUSES[e.status]}{e.actor && `, ${e.actor}`}{e.note && `. ${e.note}`}</li>)}</ul>
      <p><Link href={`/track/${link.trip_id}`}>Trip map</Link></p>
    </main>
  );
}
