import Link from 'next/link';
import type { Metadata } from 'next';
import { manilaNow, peso, time12 } from '@/lib/catalog';
import { q } from '@/lib/db';
import type { Leg, Source, Stop } from '@/lib/trips';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Routes and schedules', description: 'Every daily departure on PINASBUS with its stops, roads, ferries, bus class and fare.' };

export default async function Routes() {
  const rows = await q<{ org: string; slug: string; route: string; code: string; departure: string; class_name: string; stops: Stop[]; itinerary: Leg[]; mode: string; sources: Source[] }>(
    `select o.name org, o.slug, r.name route, s.code, to_char(s.departure, 'HH24:MI') departure, s.class_name, r.stops, r.itinerary, r.mode, s.data_sources sources
       from schedules s join routes r on r.id = s.route_id join organizations o on o.id = s.org_id
      where s.active and r.active and o.status = 'active' order by r.stops->0->>'name', s.departure`);
  const today = manilaNow().date;
  const byOrigin = Map.groupBy(rows, (r) => r.stops[0].name);
  return (
    <main>
      <h1 className="page-h">Routes and schedules</h1>
      <p className="lead">Daily departures by starting terminal. Times are when the bus leaves its first stop; roads and ferries are the planned route. Rows marked indicative are demonstration values, not published schedules.</p>
      {[...byOrigin].map(([origin, list]) => (
        <section key={origin} className="section tight" aria-label={`From ${origin}`}>
          <h2>From {origin}</h2>
          <div className="table-wrap">
            <table className="fares small">
              <thead><tr><th scope="col">Leaves</th><th scope="col">Company and trip</th><th scope="col">Stops</th><th scope="col">Roads</th><th scope="col">Bus</th><th scope="col">Fare</th><th scope="col"><span className="sr-only">Book</span></th></tr></thead>
              <tbody>{list.map((r) => (
                <tr key={r.slug + r.code + r.departure}>
                  <td className="num">{time12(r.departure)}</td>
                  <td><Link href={`/operators/${r.slug}`}>{r.org}</Link><br /><span className="note">Trip {r.code}</span></td>
                  <td>{r.stops.map((s) => s.name).join(', ')}</td>
                  <td className="note">{r.itinerary.map((l) => l.name).join(', ') || 'Not published'}</td>
                  <td>{r.class_name}</td>
                  <td className="num">{peso(Math.max(...r.stops.map((s) => s.fare)) * 100)}{r.sources.some((s) => !s.verified) && <span className="chip no">indicative</span>}</td>
                  <td><Link href={`/trips?${new URLSearchParams({ from: origin, to: r.stops.at(-1)!.name, date: today })}`}>Book</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
