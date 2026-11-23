import Link from 'next/link';
import type { Metadata } from 'next';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Terminals', description: 'Bus terminals, stops and ports on PINASBUS routes, with addresses and the companies serving them.' };

export default async function Terminals() {
  const rows = await q<{ name: string; city: string; province: string; kind: string; address: string; source_url: string; verified_at: string | null; companies: string[] }>(
    `select s.name, s.city, s.province, s.kind, s.address, s.source_url, s.verified_at::text,
       coalesce((select array_agg(distinct o.name) from routes r join organizations o on o.id = r.org_id
                  where r.active and o.status = 'active' and r.stops @> jsonb_build_array(jsonb_build_object('name', s.name))), '{}') companies
       from stations s order by s.province, s.name`);
  const used = rows.filter((r) => r.companies.length);
  const byProvince = Map.groupBy(used, (r) => r.province || 'Other');
  return (
    <main>
      <h1 className="page-h">Terminals and stops</h1>
      <p className="lead">{used.length} places where you can board or get off. Addresses come from the cited public sources; confirm with the bus company before you travel.</p>
      {[...byProvince].sort(([a], [b]) => (a === 'Metro Manila' ? -1 : b === 'Metro Manila' ? 1 : a.localeCompare(b))).map(([prov, list]) => (
        <section key={prov} className="section tight" aria-label={prov}>
          <h2>{prov}</h2>
          <div className="terminals">
            {list.map((s) => (
              <article key={s.name} className="panel">
                <h3>{s.name}</h3>
                <p className="note">{[s.address, s.city].filter(Boolean).join(', ')}{s.kind !== 'terminal' && ` (${s.kind.replace('_', ' ')})`}</p>
                <p className="note">{s.companies.join(', ')}</p>
                <p><Link href={`/trips?from=${encodeURIComponent(s.name)}`}>Trips from here</Link></p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
