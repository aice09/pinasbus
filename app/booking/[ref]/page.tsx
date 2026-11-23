import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { byRef, syncFromPaymongo } from '@/lib/bookings';
import { clock, longDay, peso } from '@/lib/catalog';
import { seatName } from '@/lib/layouts';
import { PASSENGER_CATEGORIES } from '@/lib/seatpolicy';
import { legOf, stopTime, tripById } from '@/lib/trips';
import { addBags } from '@/app/actions/public';
import { BAG_CATEGORIES, BAG_STATUSES, DEFAULT_BAGGAGE, type Bag } from '@/lib/baggage';
import { q } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';

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
  const bags = await q<Bag>('select * from bags where booking_id = $1 order by created_at', [b.id]);
  const [org] = b.org_id ? await q<{ settings: { baggage?: Partial<typeof DEFAULT_BAGGAGE> } }>('select settings from organizations where id = $1', [b.org_id]) : [];
  const rules = { ...DEFAULT_BAGGAGE, ...(org?.settings.baggage ?? {}) };
  const canAddBags = b.status === 'paid' && trip && !['departed', 'arrived', 'cancelled'].includes(trip.status);

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
          <section id="bags" className="bags" aria-labelledby="bags-h">
            <h2 className="h3" id="bags-h">Baggage</h2>
            <p className="note">Free allowance: {rules.freeKgPerSeat} kg per seat, up to {rules.maxBagsPerSeat} bags per seat. Excess is {peso(rules.excessPerKgCentavos)} per kg, paid at check-in.</p>
            {bags.length > 0 && (
              <table className="fares small">
                <thead><tr><th scope="col">Tag</th><th scope="col">Bag</th><th scope="col">Weight</th><th scope="col">Where it is</th></tr></thead>
                <tbody>{bags.map((g) => <tr key={g.id}><td className="mono">{g.tag}</td><td>{g.description}<br /><span className="note">{g.passenger}, {BAG_CATEGORIES[g.category]}</span></td><td className="num">{g.weight_kg} kg{g.fee_centavos ? <><br /><span className="note">{peso(g.fee_centavos)} {g.fee_paid ? 'paid' : 'due'}</span></> : null}</td><td>{BAG_STATUSES[g.status]}</td></tr>)}</tbody>
              </table>
            )}
            {canAddBags && (
              <details className="no-print"><summary className="btn quiet small">Register bags</summary>
                <ActionForm action={addBags} submit="Register bags" reset>
                  <input type="hidden" name="ref" value={b.ref} />
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="row4">
                      <label className="field">Owner<select name="passenger" defaultValue={b.passengers[i % b.passengers.length]?.name ?? b.name}>{[...new Set([b.name, ...b.passengers.map((p) => p.name)])].map((n) => <option key={n}>{n}</option>)}</select></label>
                      <label className="field">What it is<input name="description" maxLength={120} placeholder={i === 0 ? 'Blue suitcase' : 'Optional'} required={i === 0} /></label>
                      <label className="field">Type<select name="category">{Object.entries(BAG_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                      <label className="field">Weight (kg)<input name="weight" type="number" step="0.1" min="0.1" required={i === 0} /></label>
                    </div>
                  ))}
                </ActionForm>
              </details>
            )}
          </section>
          <p className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {trip && b.status === 'paid' && <Link className="btn quiet" href={`/track/${trip.id}`}>Track this bus</Link>}
            <Link className="btn quiet" href={`/trips?${new URLSearchParams({ from: b.pickup, to: b.dropoff })}`}>Book this route again</Link>
          </p>
        </div>
      </article>
    </main>
  );
}
