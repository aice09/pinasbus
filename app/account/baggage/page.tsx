import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { BAG_STATUSES, type Bag } from '@/lib/baggage';
import { q } from '@/lib/db';

export const metadata: Metadata = { title: 'Your baggage' };

export default async function Baggage() {
  const u = await requireUser('/account/baggage');
  const bags = await q<Bag & { ref: string; pickup: string; dropoff: string; travel_date: string; last: string | null }>(
    `select g.*, b.ref, b.pickup, b.dropoff, b.travel_date, (select e.location from bag_events e where e.bag_id = g.id and e.location <> '' order by e.id desc limit 1) last
       from bags g join bookings b on b.id = g.booking_id where b.user_id = $1 order by g.created_at desc limit 100`, [u.id]);
  return (
    <>
      <h1 className="page-h">Your baggage</h1>
      <p className="lead">Bags registered on your tickets. Staff scan the tag at each step, so you can see where each bag is.</p>
      <ul className="cards">{bags.map((g) => (
        <li key={g.id} className="card"><div className="card-main"><h3><span className="mono">{g.tag}</span> {g.description}</h3>
          <p className="meta"><span className="chip">{BAG_STATUSES[g.status]}</span>{g.last && <span className="chip plain">{g.last}</span>} {g.weight_kg} kg, {g.pickup} → {g.dropoff}, {g.travel_date}</p></div>
          <div className="card-actions"><Link className="btn quiet small" href={`/booking/${g.ref}#bags`}>Ticket</Link></div></li>))}
        {bags.length === 0 && <li className="note">No bags yet. Register bags from a paid ticket.</li>}
      </ul>
    </>
  );
}
