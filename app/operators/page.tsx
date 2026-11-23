import Link from 'next/link';
import type { Metadata } from 'next';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bus companies', description: 'Bus companies on PINASBUS, their routes, buses and where their data comes from.' };

export default async function Operators() {
  const ops = await q<{ slug: string; name: string; is_demo: boolean; routes: number; schedules: number; buses: number; classes: string[]; data_sources: { verified: boolean; what: string }[] }>(
    `select o.slug, o.name, o.is_demo, o.data_sources,
       (select count(*) from routes r where r.org_id = o.id and r.active)::int routes,
       (select count(*) from schedules s where s.org_id = o.id and s.active)::int schedules,
       (select count(*) from buses b where b.org_id = o.id and b.status = 'active')::int buses,
       coalesce((select array_agg(distinct s.class_name) from schedules s where s.org_id = o.id and s.active), '{}') classes
     from organizations o where o.kind = 'bus_operator' and o.status = 'active' order by o.name`);
  return (
    <main>
      <h1 className="page-h">Bus companies</h1>
      <p className="lead">Every company runs its own fleet, routes and fares on PINASBUS. Companies marked “not affiliated” are listed from public data for this demonstration and have no agreement with PINASBUS.</p>
      <ul className="cards">
        {ops.map((o) => (
          <li key={o.slug} className="card">
            <div className="card-main">
              <h2 className="h3"><Link href={`/operators/${o.slug}`}>{o.name}</Link></h2>
              <p className="meta">{o.is_demo && <span className="chip no">Not affiliated, public data</span>}{o.data_sources.some((s) => !s.verified) && <span className="chip plain">Indicative fares</span>} {o.routes} routes, {o.schedules} daily departures, {o.classes.join(', ')}</p>
            </div>
            <div className="card-actions"><Link className="btn quiet small" href={`/operators/${o.slug}`}>Routes and buses</Link></div>
          </li>
        ))}
      </ul>
    </main>
  );
}
