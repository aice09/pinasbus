import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BUS_CLASSES, isBookable, manilaNow, price, time12, tripById } from '@/lib/catalog';
import { takenSeats } from '@/lib/bookings';
import { paymentsConfigured } from '@/lib/paymongo';
import { SeatPicker } from '@/components/SeatPicker';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Choose your seats' };

export default async function TripPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string; from?: string; to?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const trip = tripById(id);
  if (!trip) notFound();
  const date = sp.date ?? manilaNow().date;
  const cls = BUS_CLASSES[trip.busClass];
  const longDate = new Date(date + 'T00:00:00+08:00').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  if (!isBookable(trip, date)) {
    return (
      <main>
        <div className="empty" style={{ marginTop: 24 }}>
          <h1 style={{ fontSize: '1.6rem' }}>Online booking is closed for this departure</h1>
          <p>Booking closes an hour before the bus leaves its first stop and opens 60 days ahead. <Link href={`/trips?date=${manilaNow().date}`}>See other trips</Link>.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <p className="note" style={{ marginTop: 8 }}><Link href={`/trips?${new URLSearchParams({ date, ...(sp.from && { from: sp.from }), ...(sp.to && { to: sp.to }) })}`}>Back to trips</Link></p>
      <h1 style={{ fontSize: 'clamp(1.5rem,4vw,2.3rem)', marginTop: 6 }}>{cls.name}, trip {trip.code}</h1>
      <p className="note" style={{ fontSize: '1rem', marginTop: 4 }}>{longDate}. Leaves {trip.pickups.map((p) => `${p.station} ${time12(p.time)}`).join(', ')}.</p>
      <SeatPicker
        trip={trip}
        busClass={cls}
        date={date}
        taken={await takenSeats(trip.id, date)}
        perSeat={price(trip.fare, 1)}
        initialPickup={trip.pickups.some((p) => p.station === sp.from) ? sp.from! : trip.pickups[0].station}
        initialDropoff={trip.dropoffs.includes(sp.to ?? '') ? sp.to! : trip.dropoffs[0]}
        paymentsReady={paymentsConfigured()}
      />
    </main>
  );
}
