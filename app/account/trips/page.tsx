import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { bookingsForUser } from '@/lib/bookings';
import { manilaNow } from '@/lib/catalog';
import { allTrips } from '@/lib/routes';
import { BookingList } from '@/components/Lists';

export const metadata: Metadata = { title: 'Your trips' };

export default async function Trips() {
  const u = await requireUser('/account/trips');
  const [bookings, trips] = await Promise.all([bookingsForUser(u.id), allTrips()]);
  const today = manilaNow().date;
  return (
    <>
      <h1 className="page-h">Your trips</h1>
      <p className="lead">Every booking made while signed in. Use Book again to keep the route and choose a new date, time and seats.</p>
      <section className="section tight" aria-labelledby="up-h"><h2 id="up-h">Upcoming</h2>
        <BookingList items={bookings.filter((b) => b.travel_date >= today).reverse()} trips={trips} /></section>
      <section className="section tight" aria-labelledby="past-h"><h2 id="past-h">Past trips</h2>
        <BookingList items={bookings.filter((b) => b.travel_date < today)} trips={trips} /></section>
    </>
  );
}
