import Image from 'next/image';
import Link from 'next/link';
import { addDays, BOOKING_WINDOW_DAYS, manilaNow, peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import type { Seat } from '@/lib/layouts';
import { allPlaces, DEFAULT_PLACE, place, stationRegions } from '@/lib/places';
import type { Stop } from '@/lib/trips';
import { network } from '@/lib/trips';
import { FleetPreview } from '@/components/FleetPreview';
import { HeroSearch } from '@/components/HeroSearch';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { date: today } = manilaNow();
  const [pairs, regions, routes, operators, [showcase]] = await Promise.all([
    network(), stationRegions(),
    q<{ stops: Stop[]; itinerary: { type: string; name: string }[]; org: string; verified: boolean; walkup: boolean }>(
      `select r.stops, r.itinerary, o.name org, not (r.data_sources @> '[{"verified": false}]') verified, coalesce((c.rules->>'bookable')::boolean, true) = false walkup
         from routes r join organizations o on o.id = r.org_id left join categories c on c.id = r.category_id where r.active and o.status = 'active'`),
    q<{ slug: string; name: string; schedules: number; is_demo: boolean }>(
      `select o.slug, o.name, o.is_demo, (select count(*) from schedules s where s.org_id = o.id and s.active)::int schedules
         from organizations o where o.kind = 'bus_operator' and o.status = 'active' order by o.name`),
    q<{ seats: Seat[] }>(`select l.seats from seat_layouts l join organizations o on o.id = l.org_id where o.slug = 'bicol-isarog' and l.name = 'Ultimate Sleeper' limit 1`),
  ]);

  // Lowest fare to each destination that has a photo region, one card per region.
  const best = new Map<string, { dest: string; min: number; orgs: Set<string>; indicative: boolean }>();
  for (const r of routes) {
    if (r.walkup) continue;
    r.stops.forEach((a, i) => {
      if (!a.boarding) return;
      for (const b of r.stops.slice(i + 1)) {
        const region = regions[b.name];
        if (!b.alighting || !region || region === 'metro-manila') continue;
        const fare = b.fare - a.fare, cur = best.get(region);
        if (fare <= 0) continue;
        if (!cur || fare < cur.min) best.set(region, { dest: b.name, min: fare, orgs: new Set([...(cur?.orgs ?? []), r.org]), indicative: !r.verified });
        else cur.orgs.add(r.org);
      }
    });
  }
  // "via SLEX, Maharlika": the roads a route board would paint, from the first route serving each pair.
  const via: Record<string, string> = {};
  const short = (n: string) => n.match(/\(([^)]+)\)/)?.[1] ?? n.replace(/^Pan-Philippine Highway.*/, 'Maharlika').replace(/ (Expressway|Highway|Boulevard)$/, '');
  for (const r of routes) {
    const roads = [...new Set(r.itinerary.filter((l) => l.type !== 'city').map((l) => (l.type === 'ferry' ? 'ferry' : short(l.name))))].slice(0, 3).join(', ');
    if (!roads) continue;
    r.stops.forEach((a, i) => { if (a.boarding) for (const b of r.stops.slice(i + 1)) if (b.alighting) via[`${a.name}|${b.name}`] ??= roads; });
  }
  const placeName = (s: string) => s.replace(/^(Partas|Victory Liner)\s+/, '').replace(/ CBD$/, '');
  const popular = [...best].sort((a, b) => b[1].orgs.size - a[1].orgs.size || a[1].min - b[1].min).slice(0, 8);
  const places = Object.fromEntries(allPlaces().map((p) => [p.key, p]));
  const departures = operators.reduce((a, o) => a + o.schedules, 0);

  return (
    <main className="home">
      <HeroSearch pairs={pairs} regions={regions} places={places} today={today} maxDate={addDays(today, BOOKING_WINDOW_DAYS)}
        via={via} initial={{ from: pairs['EDSA Cubao'] ? 'EDSA Cubao' : '', to: '' }} fallback={DEFAULT_PLACE} />

      <section className="section" aria-labelledby="pop-h">
        <div className="section-head"><h2 id="pop-h">Where to next</h2><Link href="/routes">All routes</Link></div>
        <ul className="dest-grid">
          {popular.map(([region, d]) => {
            const p = place(region);
            return (
              <li key={region}>
                <Link href={`/trips?${new URLSearchParams({ to: d.dest, date: today })}`} className="dest">
                  <Image src={p.src} alt="" fill sizes="(max-width: 700px) 100vw, 25vw" className="dest-img" />
                  <span className="dest-text"><strong>{placeName(d.dest)}</strong><span>from {peso(d.min * 100)}{d.indicative ? ', indicative' : ''}, {d.orgs.size} {d.orgs.size === 1 ? 'company' : 'companies'}</span></span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section showcase" aria-labelledby="seat-h">
        <div className="showcase-copy">
          <h2 id="seat-h">Book the ride. Pick the exact seat.</h2>
          <p>Turn the real bus around and tap your seat. On sleepers, lift the upper deck to see the lower berths; see where the CR is before you pay. Blue ♿, amber SC and purple P seats are held for passengers who need them.</p>
          <p>Pay with GCash, Maya, a card or a PINASBUS transport card. Register your bags on the ticket, then follow the bus on a live map.</p>
          <p><Link className="btn" href="/trips">Find a trip</Link></p>
        </div>
        {showcase && <FleetPreview layout={showcase.seats} restroom start3d />}
      </section>

      <section className="section" aria-labelledby="ops-h">
        <div className="section-head"><h2 id="ops-h">{operators.length} bus companies, {departures} departures a day</h2><Link href="/operators">Compare</Link></div>
        <ul className="oplist">
          {operators.map((o) => (
            <li key={o.slug}><Link href={`/operators/${o.slug}`}><strong>{o.name}</strong><span>{o.schedules} a day</span></Link></li>
          ))}
        </ul>
        <p className="note">Listed from public timetables for this demonstration; none of these companies is affiliated with PINASBUS.</p>
      </section>

      <section className="section band" aria-labelledby="padala-h">
        <div><h2 id="padala-h">Send a package on tonight&apos;s bus</h2><p>Padala travels between terminals on the same buses you ride. Pay online, drop it off, and track it to the claim counter.</p></div>
        <p className="band-actions"><Link className="btn" href="/padala">Send a package</Link><Link className="btn quiet" href="/padala/track">Track a package</Link></p>
      </section>

      <section className="section band dark" aria-labelledby="ops2-h">
        <div><h2 id="ops2-h">Run a bus or ferry company?</h2><p>Each company gets its own workspace: fleet and seat layouts, routes and schedules, dispatch, terminal sales, baggage, live tracking, ferry connections and reports, with fixed roles for every crew member.</p></div>
        <p className="band-actions"><Link className="btn" href="/contact?subject=Operator%20onboarding">Talk to us</Link><Link className="btn quiet" href="/about">How it works</Link></p>
      </section>
    </main>
  );
}
