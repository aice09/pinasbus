import Link from 'next/link';
import { addDays, BOOKING_WINDOW_DAYS, BUS_CLASSES, hasRestroom, manilaNow, network, peso } from '@/lib/catalog';
import { activeTrips } from '@/lib/routes';
import { SearchForm } from '@/components/SearchForm';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const trips = await activeTrips();
  const { date: today } = manilaNow();
  const { pairs } = network(trips);

  // Cheapest southbound fare per destination, with the bus classes serving it.
  const rows = new Map<string, { min: number; classes: Set<string>; trips: number }>();
  for (const t of trips.filter((t) => t.dir === 'south')) for (const d of t.dropoffs) {
    const r = rows.get(d) ?? { min: Infinity, classes: new Set<string>(), trips: 0 };
    r.min = Math.min(r.min, t.fare); r.classes.add(BUS_CLASSES[t.busClass].name); r.trips++;
    rows.set(d, r);
  }
  const fares = [...rows].sort((a, b) => a[1].min - b[1].min);

  return (
    <main>
      <section className="hero">
        <SearchForm pairs={pairs} today={today} maxDate={addDays(today, BOOKING_WINDOW_DAYS)} initial={{ from: 'EDSA Cubao', to: pairs['EDSA Cubao']?.includes('Naga CBD') ? 'Naga CBD' : '' }} />
        <div className="hero-copy">
          <h1>Your seat to Bicol, booked in a minute.</h1>
          <p>{trips.length} daily departures between Metro Manila and Camarines Sur, Albay, Sorsogon, Catanduanes and Masbate, from lie-flat sleeper berths to non-aircon coaches. The From and To lists only show routes a bus actually runs.</p>
        </div>
      </section>

      <section className="section" aria-labelledby="how-h">
        <h2 id="how-h">How booking works</h2>
        <ol className="steps">
          <li><h3>Find your trip</h3><p>Choose where you board and where you get off. Every departure shows its bus class, restroom and seats left.</p></li>
          <li><h3>Pick your seat</h3><p>Turn the 3D bus around and tap a seat. On sleepers, lift the upper deck to see the lower berths.</p></li>
          <li><h3>Pay and board</h3><p>Pay with GCash, Maya or card. Your ticket page and reference number are all you show at boarding.</p></li>
        </ol>
      </section>

      <section className="section" id="fares" aria-labelledby="fares-h">
        <h2 id="fares-h">Fares from Metro Manila</h2>
        <p>Lowest fare per seat, before the online convenience fee.</p>
        <div className="table-wrap">
          <table className="fares">
            <thead><tr><th scope="col">Destination</th><th scope="col">From</th><th scope="col">Bus classes</th><th scope="col">Daily trips</th><th scope="col"><span className="sr-only">Book</span></th></tr></thead>
            <tbody>
              {fares.map(([dest, r]) => (
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

      <section className="section split" aria-labelledby="classes-h">
        <div>
          <h2 id="classes-h">Six ways to ride</h2>
          <p>From the Ultimate Sleeper&apos;s curtained berths to the open-window Non-Aircon, every class is shown with its restroom and seat layout before you pay.</p>
          <p><Link className="btn quiet" href="/fleet">Compare our buses</Link></p>
        </div>
        <ul className="classlist">
          {Object.values(BUS_CLASSES).map((c) => (
            <li key={c.id}><strong>{c.name}</strong><span>{c.seats} {c.layout[0].berth ? 'berths, upper and lower' : 'seats'}, {hasRestroom(c) ? 'with restroom (CR)' : 'no restroom'}</span></li>
          ))}
        </ul>
      </section>

      <section className="section band" aria-labelledby="padala-h">
        <div>
          <h2 id="padala-h">Send a package on tonight&apos;s bus</h2>
          <p>BikolBus Padala carries boxes and documents between our terminals on the same buses you ride. Book and pay online, drop it off, and the recipient picks it up at the destination terminal. Track every step with your reference number.</p>
        </div>
        <p className="band-actions"><Link className="btn" href="/padala">Send a package</Link><Link className="btn quiet" href="/padala/track">Track a package</Link></p>
      </section>

      <section className="section" id="rules" aria-labelledby="rules-h">
        <h2 id="rules-h">Before you travel</h2>
        <div className="rules">
          <div><h3>Baggage</h3><p>Each ticket includes up to 20 kg of baggage. Infant tickets have no baggage allowance.</p></div>
          <div><h3>Discounts</h3><p>Student, senior citizen and PWD discounts are given only at terminal ticket booths, with a valid ID.</p></div>
          <div><h3>Pregnancy</h3><p>From 7 months you can&apos;t travel. Up to 6 months you need an OB-Gynecologist &quot;fit to travel&quot; certificate.</p></div>
          <div><h3>Pets and infants</h3><p>One small caged pet or one infant (under 3 ft) per adult. A pet needs its own seat, anti-rabies proof and a vet travel permit.</p></div>
          <div><h3>Seat holds</h3><p>Your seats are held for 15 minutes while you pay. If payment doesn&apos;t finish, they go back on sale.</p></div>
          <div><h3>Boarding</h3><p>Be at your pick-up point 30 minutes early and show the ticket page or your reference number with a valid ID.</p></div>
        </div>
      </section>
    </main>
  );
}
