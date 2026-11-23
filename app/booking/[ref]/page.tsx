import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { byRef, syncFromPaymongo } from '@/lib/bookings';
import { clock, longDay, peso } from '@/lib/catalog';
import { seatName } from '@/lib/layouts';
import { PASSENGER_CATEGORIES } from '@/lib/seatpolicy';
import { legOf, stopTime, tripById } from '@/lib/trips';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your booking', robots: { index: false } };

const STATUS = {
  paid: ['paid', 'Paid. This is your ticket.'],
  pending: ['pending', 'Waiting for payment'],
  expired: ['expired', 'Seat hold expired'],
  needs_refund: ['needs_refund', 'Paid, but the seats were taken. You will be refunded.'],
  refunded: ['expired', 'Refunded'],
} as const;

export default async function BookingPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const [{ ref }, { cancelled }] = await Promise.all([params, searchParams]);
  if (!/^(PB|BB)[A-Z2-9]{10}$/.test(ref)) notFound();
  const found = await byRef(ref);
  if (!found) notFound();
  const b = await syncFromPaymongo(found);
  const trip = b.trip_uuid ? await tripById(b.trip_uuid) : null;
  const leg = trip ? legOf(trip, b.pickup, b.dropoff) : null;
  const boards = trip && leg ? stopTime(trip, leg.i) : null;
  const [cssClass, text] = STATUS[b.status];

  return (
    <main>
      <article className="ticket">
        <div className="ticket-head">
          <span className="display">{b.pickup} → {b.dropoff}</span>
          <span>{longDay(b.travel_date)}{boards && `, boards ${clock(boards)}`}</span>
        </div>
        <div className="ticket-body">
          <p><span className={`status ${cssClass}`}>{text}</span></p>
          {b.status === 'pending' && <p>{cancelled ? 'Payment was cancelled. ' : ''}Your seats are held until {b.expires_at.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}. If you already paid, refresh this page in a minute.</p>}
          {b.status === 'expired' && <p>The 15-minute hold ran out before payment arrived. {trip && <Link href={`/trips/${trip.id}?${new URLSearchParams({ from: b.pickup, to: b.dropoff })}`}>Choose seats again</Link>}</p>}
          {b.status === 'needs_refund' && <p>Keep this reference. A refund for {peso(b.total_centavos)} goes back to the account you paid with.</p>}
          <div className="ticket-grid">
            <div><small>Reference</small><strong className="ref">{b.ref}</strong></div>
            <div><small>Bus company</small><strong>{trip?.org_name ?? 'Unknown'}</strong></div>
            <div><small>Bus</small><strong>{trip ? `${trip.class_name}, trip ${trip.code}` : b.trip_id}</strong></div>
            <div><small>Board at</small><strong>{b.pickup}{boards && `, ${clock(boards)}`}</strong></div>
            <div><small>Contact</small><strong>{b.name}</strong></div>
            <div><small>Total paid</small><strong>{peso(b.total_centavos)}</strong></div>
          </div>
          <table className="fares small">
            <thead><tr><th scope="col">Seat</th><th scope="col">Passenger</th><th scope="col">Type</th><th scope="col">Fare</th></tr></thead>
            <tbody>{b.seats.map((s) => {
              const p = b.passengers.find((x) => x.seat === s);
              return <tr key={s}><td>{seatName(s)}</td><td>{p?.name ?? b.name}</td><td>{PASSENGER_CATEGORIES[p?.category ?? 'regular']}{p?.id_type ? ` (${p.id_type} ending ${p.id_last4})` : ''}</td><td className="num">{p?.fare ? peso(p.fare) : ''}</td></tr>;
            })}</tbody>
          </table>
          {b.status === 'paid' && <p className="note">Show this page or the reference at the pick-up point 30 minutes before departure, with a valid ID{b.passengers.some((p) => p.category && p.category !== 'regular') ? ' and the discount ID listed above' : ''}.</p>}
          <p className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn quiet" href={`/trips?${new URLSearchParams({ from: b.pickup, to: b.dropoff })}`}>Book this route again</Link>
          </p>
        </div>
      </article>
    </main>
  );
}
