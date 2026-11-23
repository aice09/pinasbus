import Link from 'next/link';
import type { Metadata } from 'next';
import { BUS_CLASSES, hasRestroom, peso } from '@/lib/catalog';
import { activeTrips } from '@/lib/routes';
import { FleetPreview } from '@/components/FleetPreview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Our buses', description: 'Ultimate Sleeper, Regular Sleeper, Elite 26, Skybus, Regular Aircon and Non-Aircon: seat layouts, restrooms and fares.' };

export default async function Fleet() {
  const trips = await activeTrips();
  return (
    <main>
      <h1 className="page-h">Our buses</h1>
      <p className="lead">Six classes for every budget and every hour of the road. Each one is shown below with its real seat layout, where the restroom (CR) is, and the fare it starts at.</p>
      {Object.values(BUS_CLASSES).map((c) => {
        const fares = trips.filter((t) => t.busClass === c.id).map((t) => t.fare);
        return (
          <section key={c.id} className="section fleet" aria-labelledby={`c-${c.id}`}>
            <div>
              <h2 id={`c-${c.id}`}>{c.name}</h2>
              <p>{c.blurb}</p>
              <ul className="facts">
                <li><strong>{c.seats}</strong> {c.layout[0].berth ? `berths: ${c.seats / 2} lower (L) and ${c.seats / 2} upper (U)` : 'seats'}</li>
                <li>{hasRestroom(c) ? 'Restroom (CR) on board, at the back' : 'No restroom; the bus stops at rest areas every 3 to 4 hours'}</li>
                <li>{c.amenities.filter((a) => a !== 'Restroom').join(', ')}</li>
                <li>{fares.length ? <>From <strong>{peso(Math.min(...fares) * 100)}</strong> on {fares.length} trips</> : 'No trips running right now'}</li>
              </ul>
              {fares.length > 0 && <p><Link className="btn quiet" href="/trips">Find a {c.name} trip</Link></p>}
            </div>
            <FleetPreview cls={c} />
          </section>
        );
      })}
    </main>
  );
}
