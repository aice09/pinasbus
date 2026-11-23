import Link from 'next/link';
import type { Metadata } from 'next';
import { METRO_MANILA, time12 } from '@/lib/catalog';
import { activeTrips } from '@/lib/routes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Terminals', description: 'Where to board and get off: BikolBus terminals in Metro Manila and Bicol, with the departures from each.' };

const REGION: Record<string, string> = {
  'Naga CBD': 'Camarines Sur', Iriga: 'Camarines Sur', Lagonoy: 'Camarines Sur', 'San Isidro Libmanan': 'Camarines Sur', Sipocot: 'Camarines Sur', Ocampo: 'Camarines Sur', 'Naga Puregold': 'Camarines Sur',
  Legazpi: 'Albay', Tabaco: 'Albay', 'Tabaco Pier': 'Albay', Daraga: 'Albay',
  Gubat: 'Sorsogon', Bulan: 'Sorsogon',
  Virac: 'Catanduanes', 'San Andres': 'Catanduanes',
  'Masbate City': 'Masbate',
  Tacloban: 'Leyte', Allen: 'Northern Samar',
};

export default async function Terminals() {
  const trips = await activeTrips();
  const stations = new Map<string, { departs: { code: string; time: string }[]; arrives: number }>();
  for (const t of trips) {
    for (const p of t.pickups) { const s = stations.get(p.station) ?? { departs: [], arrives: 0 }; s.departs.push({ code: t.code, time: p.time }); stations.set(p.station, s); }
    for (const d of t.dropoffs) { const s = stations.get(d) ?? { departs: [], arrives: 0 }; s.arrives++; stations.set(d, s); }
  }
  const region = (n: string) => (METRO_MANILA.includes(n) ? 'Metro Manila' : REGION[n] ?? 'Bicol');
  const regions = [...new Set([...stations.keys()].map(region))].sort((a, b) => (a === 'Metro Manila' ? -1 : b === 'Metro Manila' ? 1 : a.localeCompare(b)));

  return (
    <main>
      <h1 className="page-h">Terminals</h1>
      <p className="lead">Board at any pick-up point on your trip. Every terminal also accepts Padala packages for the routes it serves.</p>
      {regions.map((r) => (
        <section key={r} className="section tight" aria-labelledby={`r-${r}`}>
          <h2 id={`r-${r}`}>{r}</h2>
          <div className="terminals">
            {[...stations].filter(([n]) => region(n) === r).sort(([a], [b]) => a.localeCompare(b)).map(([n, s]) => (
              <article key={n} className="panel">
                <h3>{n}</h3>
                <p className="note">{s.departs.length} departure{s.departs.length === 1 ? '' : 's'} a day{s.arrives ? `, ${s.arrives} arrival${s.arrives === 1 ? '' : 's'}` : ''}</p>
                {s.departs.length > 0 && <p>First bus {time12(s.departs.map((d) => d.time).sort()[0])}, last {time12(s.departs.map((d) => d.time).sort().at(-1)!)}</p>}
                <p><Link href={s.departs.length ? `/trips?from=${encodeURIComponent(n)}` : `/trips?to=${encodeURIComponent(n)}`}>{s.departs.length ? 'Trips from here' : 'Trips to here'}</Link></p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
