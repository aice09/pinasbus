import Link from 'next/link';
import type { Metadata } from 'next';
import { BUS_CLASSES, hasRestroom, manilaNow, peso, time12 } from '@/lib/catalog';
import { activeTrips } from '@/lib/routes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Routes and schedules', description: 'Every daily BikolBus departure between Metro Manila and Bicol, with pick-up times, drop-offs, bus class and fare.' };

export default async function Routes() {
  const trips = await activeTrips();
  const today = manilaNow().date;
  const groups = [
    { h: 'Metro Manila to Bicol', list: trips.filter((t) => t.dir === 'south') },
    { h: 'Bicol to Metro Manila', list: trips.filter((t) => t.dir === 'north') },
  ];
  return (
    <main>
      <h1 className="page-h">Routes and schedules</h1>
      <p className="lead">Daily departures, every day of the year unless announced. Times are when the bus leaves each pick-up point; arrive 30 minutes early.</p>
      {groups.map((g) => (
        <section key={g.h} className="section" aria-label={g.h}>
          <h2>{g.h}</h2>
          <div className="table-wrap">
            <table className="fares small">
              <thead><tr><th scope="col">Trip</th><th scope="col">Leaves</th><th scope="col">Drop-offs</th><th scope="col">Bus</th><th scope="col">Fare</th><th scope="col"><span className="sr-only">Book</span></th></tr></thead>
              <tbody>
                {g.list.sort((a, b) => a.pickups[0].time.localeCompare(b.pickups[0].time)).map((t) => (
                  <tr key={t.id}>
                    <th scope="row">{t.code}</th>
                    <td>{t.pickups.map((p) => <div key={p.station}>{p.station} <span className="num">{time12(p.time)}</span></div>)}</td>
                    <td>{t.dropoffs.join(', ')}</td>
                    <td>{BUS_CLASSES[t.busClass].name}<br /><span className="note">{hasRestroom(BUS_CLASSES[t.busClass]) ? 'With CR' : 'No CR'}</span></td>
                    <td className="num">{peso(t.fare * 100)}</td>
                    <td><Link href={`/trips/${t.id}?date=${today}`}>Book</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
