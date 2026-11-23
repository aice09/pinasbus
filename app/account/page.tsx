import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { bookingsForUser } from '@/lib/bookings';
import { manilaNow } from '@/lib/catalog';
import { q } from '@/lib/db';
import type { Shipment } from '@/lib/padala';
import { allTrips } from '@/lib/routes';
import { BookingList, ShipmentList } from '@/components/Lists';

export const metadata: Metadata = { title: 'Your account' };

export default async function Overview() {
  const u = await requireUser();
  const [bookings, trips, shipments, [{ n: saved }]] = await Promise.all([
    bookingsForUser(u.id), allTrips(),
    q<Shipment>(`select * from shipments where user_id = $1 and status not in ('claimed','cancelled') order by created_at desc limit 5`, [u.id]),
    q<{ n: number }>('select count(*)::int n from passengers where user_id = $1', [u.id]),
  ]);
  const today = manilaNow().date;
  const upcoming = bookings.filter((b) => b.travel_date >= today && ['paid', 'pending'].includes(b.status)).reverse();
  const lastRoutes = [...new Map(bookings.filter((b) => b.status === 'paid').map((b) => [`${b.pickup}|${b.dropoff}`, b])).values()].slice(0, 3);

  return (
    <>
      <h1 className="page-h">Hello, {u.name.split(' ')[0]}</h1>
      {lastRoutes.length > 0 && (
        <section className="section tight" aria-labelledby="again-h">
          <h2 id="again-h">Book a route again</h2>
          <div className="quick">
            {lastRoutes.map((b) => (
              <Link key={b.id} className="quick-route" href={`/trips?${new URLSearchParams({ from: b.pickup, to: b.dropoff })}`}>
                <strong>{b.pickup} → {b.dropoff}</strong><span>Choose a new date</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="section tight" aria-labelledby="up-h">
        <h2 id="up-h">Upcoming trips</h2>
        <BookingList items={upcoming} trips={trips} />
      </section>
      <section className="section tight" aria-labelledby="pd-h">
        <h2 id="pd-h">Padala on the way</h2>
        <ShipmentList items={shipments} />
      </section>
      <p className="note">{saved ? `${saved} saved passenger${saved === 1 ? '' : 's'}. ` : 'No saved passengers yet. '}<Link href="/account/passengers">Manage passengers</Link></p>
    </>
  );
}
