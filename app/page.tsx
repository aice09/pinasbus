import Link from 'next/link';
import { addDays, BOOKING_WINDOW_DAYS, manilaNow, peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import type { Stop } from '@/lib/trips';
import { network } from '@/lib/trips';
import { SearchForm } from '@/components/SearchForm';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { date: today } = manilaNow();
  const [pairs, routes, operators] = await Promise.all([
    network(),
    q<{ stops: Stop[]; org: string; verified: boolean }>(
      `select r.stops, o.name org, not (r.data_sources @> '[{"verified": false}]') verified from routes r join organizations o on o.id = r.org_id
        where r.active and o.status = 'active'`),
    q<{ slug: string; name: string; routes: number; schedules: number; is_demo: boolean }>(
      `select o.slug, o.name, o.is_demo, (select count(*) from routes r where r.org_id = o.id and r.active)::int routes,
              (select count(*) from schedules s where s.org_id = o.id and s.active)::int schedules
         from organizations o where o.kind = 'bus_operator' and o.status = 'active' order by o.name`),
  ]);

  // Cheapest full-fare segment to each destination, with the companies serving it.
  const dest = new Map<string, { min: number; orgs: Set<string>; indicative: boolean }>();
  for (const r of routes) r.stops.forEach((a, i) => {
    if (!a.boarding) return;
    for (const b of r.stops.slice(i + 1)) {
      if (!b.alighting) continue;
      const fare = b.fare - a.fare, d = dest.get(b.name) ?? { min: Infinity, orgs: new Set(), indicative: false };
      if (fare > 0 && fare < d.min) { d.min = fare; d.indicative = !r.verified; }
      d.orgs.add(r.org); dest.set(b.name, d);
    }
  });
  const fares = [...dest].filter(([, d]) => d.min < Infinity).sort((a, b) => a[1].min - b[1].min);

  return (
    <main>
      <section className="hero">
        <SearchForm pairs={pairs} today={today} maxDate={addDays(today, BOOKING_WINDOW_DAYS)} initial={{ from: pairs['EDSA Cubao'] ? 'EDSA Cubao' : '', to: pairs['EDSA Cubao']?.includes('Naga CBD') ? 'Naga CBD' : '' }} />
        <div className="hero-copy">
          <h1>Every bus home, in one place.</h1>
          <p>Compare {operators.length} bus companies and {operators.reduce((a, o) => a + o.schedules, 0)} daily departures, pick your exact seat, and pay with GCash, Maya or card. Senior citizen and PWD seats and discounts are built in.</p>
        </div>
      </section>

      <section className="section" aria-labelledby="ops-h">
        <h2 id="ops-h">Bus companies</h2>
        <ul className="opgrid">
          {operators.map((o) => (
            <li key={o.slug}>
              <Link href={`/operators/${o.slug}`} className="opcard">
                <strong>{o.name}</strong>
                <span>{o.routes} routes, {o.schedules} daily departures</span>
                {o.is_demo && <span className="chip plain">Not affiliated, public data</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" id="fares" aria-labelledby="fares-h">
        <h2 id="fares-h">Lowest fares by destination</h2>
        <p>Regular fare per seat before discounts and the online convenience fee.</p>
        <div className="table-wrap">
          <table className="fares">
            <thead><tr><th scope="col">Destination</th><th scope="col">From</th><th scope="col">Companies</th><th scope="col"><span className="sr-only">Book</span></th></tr></thead>
            <tbody>
              {fares.slice(0, 20).map(([name, d]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td className="num">{peso(d.min * 100)}{d.indicative && <span className="chip no">indicative</span>}</td>
                  <td>{[...d.orgs].join(', ')}</td>
                  <td><Link href={`/trips?to=${encodeURIComponent(name)}&date=${today}`}>See trips</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section band" aria-labelledby="ops2-h">
        <div>
          <h2 id="ops2-h">Run a bus company?</h2>
          <p>PINASBUS gives each company its own workspace: fleet and seat layouts, routes and schedules, dispatch, terminal sales, manifests and reports, with fixed roles for every crew member.</p>
        </div>
        <p className="band-actions"><Link className="btn" href="/contact?subject=Operator%20onboarding">Talk to us</Link><Link className="btn quiet" href="/about">How it works</Link></p>
      </section>
    </main>
  );
}
