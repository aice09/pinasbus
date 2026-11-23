import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { hasCR, manilaNow, peso, time12 } from '@/lib/catalog';
import { q } from '@/lib/db';
import type { Seat } from '@/lib/layouts';
import { orgBySlug } from '@/lib/tenancy';
import type { Leg, Stop } from '@/lib/trips';
import { FleetPreview } from '@/components/FleetPreview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bus company' };

export default async function Operator({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const o = await orgBySlug(slug);
  if (!o || o.kind !== 'bus_operator' || o.status !== 'active') notFound();
  const [scheds, classes] = await Promise.all([
    q<{ code: string; departure: string; class_name: string; route: string; stops: Stop[]; itinerary: Leg[]; mode: string; days: number[] }>(
      `select s.code, to_char(s.departure, 'HH24:MI') departure, s.class_name, r.name route, r.stops, r.itinerary, r.mode, s.days
         from schedules s join routes r on r.id = s.route_id where s.org_id = $1 and s.active and r.active order by r.name, s.departure`, [o.id]),
    q<{ name: string; seats: Seat[]; amenities: string[] }>(
      `select distinct on (l.id) coalesce(nullif(s.class_name, ''), l.name) name, l.seats,
         coalesce((select array_agg(a.name order by a.name) from amenities a where a.id = any (s.amenity_ids)), '{}') amenities
         from schedules s join seat_layouts l on l.id = s.layout_id where s.org_id = $1 and s.active order by l.id`, [o.id]),
  ]);
  const today = manilaNow().date;
  return (
    <main>
      <h1 className="page-h">{o.name}</h1>
      {o.is_demo && <p className="warnbox">Listed from public data for this demonstration; not affiliated with PINASBUS. {o.data_sources.map((s) => `${s.verified ? 'Verified' : 'Indicative'}: ${s.what} (${s.verified_at})`).join('. ')}.</p>}
      <section className="section tight" aria-labelledby="dep-h">
        <h2 id="dep-h">Daily departures</h2>
        <div className="table-wrap">
          <table className="fares small">
            <thead><tr><th scope="col">Trip</th><th scope="col">Leaves</th><th scope="col">Route</th><th scope="col">Bus</th><th scope="col">Fare to last stop</th><th scope="col"><span className="sr-only">Book</span></th></tr></thead>
            <tbody>{scheds.map((s) => (
              <tr key={s.code + s.departure}>
                <th scope="row">{s.code}</th><td className="num">{time12(s.departure)}</td>
                <td>{s.route}{s.mode === 'road_ferry' && <span className="chip plain">ferry</span>}<br /><span className="note">{s.itinerary.filter((l) => l.type !== 'city').map((l) => l.name.replace(/ \(.*\)/, '')).join(' → ')}</span></td>
                <td>{s.class_name}</td><td className="num">{peso(Math.max(...s.stops.map((x) => x.fare)) * 100)}</td>
                <td><Link href={`/trips?${new URLSearchParams({ from: s.stops[0].name, to: s.stops.at(-1)!.name, date: today })}`}>Find</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="section" aria-labelledby="buses-h">
        <h2 id="buses-h">Bus classes</h2>
        {classes.map((c) => (
          <div key={c.name} className="fleet">
            <div><h3>{c.name}</h3><p>{hasCR(c.amenities) ? 'Restroom (CR) on board.' : 'No restroom on board.'} {c.amenities.filter((a) => a !== 'Restroom / CR').join(', ')}.</p></div>
            <FleetPreview layout={c.seats} restroom={hasCR(c.amenities)} />
          </div>
        ))}
      </section>
    </main>
  );
}
