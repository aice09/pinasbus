import Link from 'next/link';
import { peso } from '@/lib/catalog';
import type { Booking } from '@/lib/bookings';
import { seatName } from '@/lib/layouts';
import { STATUS_TEXT, type Shipment } from '@/lib/padala';

const day = (d: string) => new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const BOOKING_STATUS: Record<Booking['status'], string> = { paid: 'Paid', pending: 'Waiting for payment', expired: 'Expired', needs_refund: 'Refund due', refunded: 'Refunded' };

/** Trip history rows with a "Book again" link that keeps the route and asks for a new date. */
export function BookingList({ items, orgs = {} }: { items: Booking[]; orgs?: Record<string, string> }) {
  if (!items.length) return <div className="empty"><p>No trips here.</p><p><Link className="btn" href="/trips">Find a trip</Link></p></div>;
  return (
    <ul className="cards">
      {items.map((b) => (
        <li key={b.id} className="card">
          <div className="card-main">
            <h3>{b.pickup} to {b.dropoff}</h3>
            <p className="meta">{day(b.travel_date)}. {b.org_id && orgs[b.org_id] ? `${orgs[b.org_id]}, ` : ''}trip {b.trip_id}. {b.seats.map(seatName).join(', ')}</p>
            <p className="meta"><span className={`status ${b.status === 'refunded' ? 'expired' : b.status}`}>{BOOKING_STATUS[b.status]}</span> <span className="mono">{b.ref}</span> {peso(b.total_centavos)}</p>
          </div>
          <div className="card-actions">
            <Link className="btn quiet small" href={`/booking/${b.ref}`}>Ticket</Link>
            <Link className="btn small" href={`/trips?${new URLSearchParams({ from: b.pickup, to: b.dropoff })}`}>Book again</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ShipmentList({ items }: { items: Shipment[] }) {
  if (!items.length) return <div className="empty"><p>No Padala shipments yet.</p><p><Link className="btn" href="/padala">Send a package</Link></p></div>;
  return (
    <ul className="cards">
      {items.map((s) => (
        <li key={s.id} className="card">
          <div className="card-main">
            <h3>{s.origin} to {s.destination}</h3>
            <p className="meta">To {s.recipient_name}, {s.description}, {s.weight_kg} kg. Sent {s.created_at.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}</p>
            <p className="meta"><span className={`status ${s.status === 'claimed' || s.status === 'arrived' ? 'paid' : s.status === 'cancelled' ? 'expired' : 'pending'}`}>{STATUS_TEXT[s.status]}</span> <span className="mono">{s.ref}</span> {peso(s.fee_centavos)}</p>
          </div>
          <div className="card-actions">
            <Link className="btn quiet small" href={`/padala/track?ref=${s.ref}`}>Track</Link>
            <Link className="btn small" href={`/padala?again=${s.ref}`}>Send again</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
