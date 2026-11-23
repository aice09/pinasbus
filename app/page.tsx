import Link from 'next/link';
import { addDays, BOOKING_WINDOW_DAYS, BUS_CLASSES, DROPOFF_STATIONS, manilaNow, METRO_MANILA, peso, PICKUP_STATIONS, price, TRIPS } from '@/lib/catalog';
import { SearchForm } from '@/components/SearchForm';

export const dynamic = 'force-dynamic';

/** Cheapest southbound fare per destination, with the bus classes that serve it. */
function fareTable() {
  const rows = new Map<string, { min: number; classes: Set<string>; trips: number }>();
  for (const t of TRIPS.filter((t) => t.dir === 'south')) {
    for (const d of t.dropoffs) {
      const r = rows.get(d) ?? { min: Infinity, classes: new Set<string>(), trips: 0 };
      r.min = Math.min(r.min, t.fare);
      r.classes.add(BUS_CLASSES[t.busClass].name);
      r.trips++;
      rows.set(d, r);
    }
  }
  return [...rows].sort((a, b) => a[1].min - b[1].min);
}

export default function Home() {
  const { date: today } = manilaNow();
  return (
    <main>
      <section className="hero">
        <SearchForm pickups={PICKUP_STATIONS} dropoffs={DROPOFF_STATIONS} today={today} maxDate={addDays(today, BOOKING_WINDOW_DAYS)} />
        <div className="hero-copy">
          <h1>Your seat to Bicol, booked in a minute.</h1>
          <p>{TRIPS.length} daily departures between Metro Manila and Camarines Sur, Albay, Sorsogon, Catanduanes and Masbate, from sleeper berths to non-aircon coaches.</p>
        </div>
      </section>

      <section className="section" id="fares" aria-labelledby="fares-h">
        <h2 id="fares-h">Fares from Metro Manila</h2>
        <p>Lowest fare per seat, before the online convenience fee. Board at {METRO_MANILA.slice(0, 5).join(', ')} and other Metro Manila stops.</p>
        <div className="table-wrap">
          <table className="fares">
            <thead><tr><th scope="col">Destination</th><th scope="col">From</th><th scope="col">Bus classes</th><th scope="col">Daily trips</th><th scope="col"><span className="sr-only">Book</span></th></tr></thead>
            <tbody>
              {fareTable().map(([dest, r]) => (
                <tr key={dest}>
                  <th scope="row">{dest}</th>
                  <td className="num">{peso(r.min * 100)}</td>
                  <td>{[...r.classes].join(', ')}</td>
                  <td className="num">{r.trips}</td>
                  <td><Link href={`/trips?to=${encodeURIComponent(dest)}&date=${today}`}>See trips</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" aria-labelledby="classes-h">
        <h2 id="classes-h">Bus classes</h2>
        <div className="rules">
          {Object.values(BUS_CLASSES).map((c) => {
            const fares = TRIPS.filter((t) => t.busClass === c.id).map((t) => t.fare);
            return (
              <div key={c.id}>
                <h3>{c.name}</h3>
                <p>{c.blurb} {c.seats} seats. {fares.length > 0 && <>From {peso(price(Math.min(...fares), 1).fare)}.</>}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section" id="rules" aria-labelledby="rules-h">
        <h2 id="rules-h">Before you travel</h2>
        <div className="rules">
          <div><h3>Baggage</h3><p>Each ticket includes up to 20 kg of baggage. Infant tickets have no baggage allowance.</p></div>
          <div><h3>Discounts</h3><p>Student, senior citizen and PWD discounts are given only at terminal ticket booths, with a valid ID.</p></div>
          <div><h3>Pregnancy</h3><p>From 7 months you can&apos;t travel. Up to 6 months you need an OB-Gynecologist &quot;fit to travel&quot; certificate.</p></div>
          <div><h3>Pets and infants</h3><p>One small caged pet or one infant (under 3 ft) per adult. A pet needs its own seat, anti-rabies proof and a vet travel permit.</p></div>
          <div><h3>Seat holds</h3><p>Your seats are held for 15 minutes while you pay. If payment doesn&apos;t finish, they go back on sale.</p></div>
          <div><h3>Boarding</h3><p>Be at your pick-up point 30 minutes early and show the ticket page or your reference number.</p></div>
        </div>
      </section>
    </main>
  );
}
