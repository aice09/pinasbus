import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { byRef, syncFromPaymongo } from '@/lib/bookings';
import { BUS_CLASSES, peso, time12, tripById } from '@/lib/catalog';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your booking', robots: { index: false } };

const STATUS = {
  paid: ['paid', 'Paid. This is your ticket.'],
  pending: ['pending', 'Waiting for payment'],
  expired: ['expired', 'Seat hold expired'],
  needs_refund: ['needs_refund', 'Paid, but the seats were taken. We will refund you.'],
} as const;

export default async function BookingPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const { ref } = await params;
  const { cancelled } = await searchParams;
  if (!/^BB[A-Z2-9]{10}$/.test(ref)) notFound();
  const found = await byRef(ref);
  if (!found) notFound();
  const b = await syncFromPaymongo(found);
  const trip = tripById(b.trip_id);
  const cls = trip && BUS_CLASSES[trip.busClass];
  const pick = trip?.pickups.find((p) => p.station === b.pickup);
  const [cssClass, text] = STATUS[b.status];
  const day = new Date(b.travel_date + 'T00:00:00+08:00').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <main>
      <article className="ticket">
        <div className="ticket-head">
          <span className="display">{b.pickup} → {b.dropoff}</span>
          <span>{day}{pick && `, ${time12(pick.time)}`}</span>
        </div>
        <div className="ticket-body">
          <p><span className={`status ${cssClass}`}>{text}</span></p>
          {b.status === 'pending' && (
            <p>{cancelled ? 'Payment was cancelled. ' : ''}Your seats are held until {b.expires_at.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}. If you already paid, refresh this page in a minute.</p>
          )}
          {b.status === 'expired' && <p>The 15-minute hold ran out before payment arrived. <Link href={`/trips/${b.trip_id}?date=${b.travel_date}`}>Choose seats again</Link>.</p>}
          {b.status === 'needs_refund' && <p>Keep this reference. A refund for {peso(b.total_centavos)} goes back to the account you paid with.</p>}
          <div className="ticket-grid">
            <div><small>Reference</small><strong className="ref">{b.ref}</strong></div>
            <div><small>Passenger</small><strong>{b.name}</strong></div>
            <div><small>{cls?.layout[0].berth ? 'Berths' : 'Seats'}</small><strong>{b.seats.join(', ')}</strong></div>
            <div><small>Bus</small><strong>{cls?.name ?? b.trip_id}, trip {trip?.code}</strong></div>
            <div><small>Board at</small><strong>{b.pickup}{pick && `, ${time12(pick.time)}`}</strong></div>
            <div><small>Total paid</small><strong>{peso(b.total_centavos)}</strong></div>
          </div>
          {b.status === 'paid' && <p className="note">Show this page or your reference number at the pick-up point, 30 minutes before departure. Bring a valid ID. A receipt was emailed to {b.email.replace(/^(.).*(@.*)$/, '$1•••$2')}.</p>}
          <p className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn quiet" href="/">Book another trip</Link>
          </p>
        </div>
      </article>
    </main>
  );
}
