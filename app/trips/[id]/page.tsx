import Link from 'next/link';
import { liveryOf } from '@/lib/livery';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { currentUser } from '@/lib/auth';
import { bookable, clock, hasCR, longDay } from '@/lib/catalog';
import { q } from '@/lib/db';
import { paymentsConfigured } from '@/lib/paymongo';
import type { PassengerCategory } from '@/lib/seatpolicy';
import { availability, discountsOf, legOf, stopTime, tripById } from '@/lib/trips';
import { Itinerary } from '@/components/Itinerary';
import { SeatPicker } from '@/components/SeatPicker';
import { RouteLine } from '@/components/RouteLine';
import { TrackMap } from '@/components/TrackMap';
import { peso } from '@/lib/catalog';
import { segmentFare } from '@/lib/trips';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Choose your seats' };

export default async function TripPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const trip = await tripById(id);
  if (!trip) notFound();
  const leg = legOf(trip, sp.from, sp.to) ?? legOf(trip);
  const boards = leg ? stopTime(trip, leg.i) ?? new Date(trip.departs_at) : null;
  const user = await currentUser();
  const saved = user ? await q<{ id: string; full_name: string; label: string; category: PassengerCategory }>('select id, full_name, label, category from passengers where user_id = $1 order by full_name', [user.id]) : [];
  const { taken, released } = await availability(trip);
  const cards = user ? await q<{ id: string; label: string; balance: number }>(
    `select c.id, o.name || ' card •••• ' || right(c.number, 4) label, c.balance_centavos balance from cards c join organizations o on o.id = c.org_id where c.user_id = $1 and c.status = 'active'`, [user.id]) : [];
  const indicative = trip.sources.filter((s) => !s.verified);

  const head = (
    <>
      <p className="note" style={{ marginTop: 8 }}><Link href={`/trips?${new URLSearchParams({ date: trip.service_date, ...(sp.from && { from: sp.from }), ...(sp.to && { to: sp.to }) })}`}>Back to trips</Link></p>
      <p className="trip-org">{trip.org_name}</p>
      <h1 className="page-h">{trip.class_name}, trip {trip.code}</h1>
      <p className="note" style={{ fontSize: '1rem' }}>{longDay(trip.service_date)}. {trip.route_name}.</p>
      <p className="meta" style={{ marginTop: 8 }}>
        {trip.category_rules?.bookable !== false && <span className={'chip ' + (hasCR(trip.amenities) ? 'yes' : 'no')}>{hasCR(trip.amenities) ? 'Restroom (CR) on board, at the back' : 'No restroom on board; the bus makes rest stops'}</span>}
        {trip.seats.some((s) => s.berth) && <span className="chip">Sleeper: L = lower berth, U = upper berth</span>}
        {trip.amenities.filter((a) => a !== 'Restroom / CR').map((a) => <span key={a} className="chip plain">{a}</span>)}
      </p>
      {indicative.length > 0 && <p className="warnbox">Indicative demo time and fare. {indicative[0].what}. Checked {indicative[0].verified_at}.</p>}
    </>
  );

  if (trip.category_rules?.bookable === false) {
    return (
      <main>
        {head}
        <p className="warnbox">{trip.category_rules.note ?? 'Walk-up service: pay on board'}. Fare from {leg ? trip.stops[leg.i].name : 'here'} to {leg ? trip.stops[leg.j].name : 'there'}: {leg ? peso(segmentFare(trip, leg.i, leg.j)) : '—'}.</p>
        <div className="split">
          <RouteLine stops={trip.stops} from={leg ? trip.stops[leg.i].name : undefined} to={leg ? trip.stops[leg.j].name : undefined} departsAt={new Date(trip.departs_at)} title={trip.route_name} />
          <TrackMap tripId={trip.id} height={520} livery={liveryOf(trip.org_slug, trip.org_settings)} />
        </div>
      </main>
    );
  }

  if (!leg || !bookable(boards) || trip.status !== 'scheduled') {
    return <main>{head}<div className="empty" style={{ marginTop: 16 }}><h2>Online booking is closed for this departure</h2><p>Booking closes an hour before the bus leaves your stop. <Link href="/trips">See other trips</Link>.</p></div></main>;
  }

  return (
    <main>
      {head}
      <SeatPicker
        tripId={trip.id}
        layout={trip.seats}
        taken={taken}
        released={released}
        stops={trip.stops.map((s, k) => ({ name: s.name, fare: s.fare, boarding: s.boarding, alighting: s.alighting, time: stopTime(trip, k) ? clock(stopTime(trip, k)) : null }))}
        fareAdjust={Number(trip.fare_adjust_pct)}
        minFare={trip.min_fare}
        discounts={discountsOf(trip)}
        restroom={hasCR(trip.amenities)}
        initialPickup={trip.stops[leg.i].name}
        initialDropoff={trip.stops[leg.j].name}
        paymentsReady={paymentsConfigured()}
        account={user ? { name: user.name, email: user.email, phone: user.phone, category: user.passenger_category } : null}
        saved={saved}
        cards={cards}
        livery={liveryOf(trip.org_slug, trip.org_settings)}
      />
      <section className="section" aria-labelledby="route-h">
        <h2 id="route-h">Planned route</h2>
        <Itinerary trip={trip} />
      </section>
    </main>
  );
}
