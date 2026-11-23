import type { Metadata } from 'next';
import { saveRoute } from '@/app/actions/ops';
import { peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import { orgCtx } from '@/lib/tenancy';
import type { Leg, Source, Stop } from '@/lib/trips';
import { ActionForm } from '@/components/ActionForm';
import { OrgField } from '@/components/OrgField';

export const metadata: Metadata = { title: 'Routes' };

type Route = { id: string; code: string; name: string; min_fare: number; category_id: string | null; stops: Stop[]; itinerary: Leg[]; mode: string; active: boolean; data_sources: Source[]; schedules: number };

export default async function Routes({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await orgCtx(slug);
  if (!c.can('routes.manage') && !c.can('trips.view')) return <p className="error">You do not have access to routes.</p>;
  const [routes, cats] = await Promise.all([
    q<Route>(`select r.*, (select count(*) from schedules s where s.route_id = r.id)::int schedules from routes r where r.org_id = $1 order by r.code`, [c.org.id]),
    q<{ id: string; name: string }>('select id, name from categories where active order by sort'),
  ]);
  const manage = c.can('routes.manage');

  const Fields = ({ r }: { r?: Route }) => (
    <>
      <OrgField slug={slug} />{r && <input type="hidden" name="id" value={r.id} />}
      <div className="row4">
        <label className="field">Route code<input name="code" required maxLength={20} defaultValue={r?.code} /></label>
        <label className="field">Name<input name="name" required maxLength={120} defaultValue={r?.name} placeholder="Cubao – Naga via SLEX" /></label>
        <label className="field">Category<select name="category_id" defaultValue={r?.category_id ?? 'provincial'}>{cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field">Minimum fare (PHP)<input name="min_fare" type="number" min="0" defaultValue={r?.min_fare ?? 0} /></label>
      </div>
      <label className="check"><input type="checkbox" name="active" defaultChecked={r?.active ?? true} /> Running</label>
      <div className="row2">
        <label className="field">Stops in order: station | minutes after departure | fare from the first stop (PHP) | P pick-up, D drop-off
          <textarea name="stops" rows={6} required defaultValue={r?.stops.map((s) => `${s.name} | ${s.offset_min ?? ''} | ${s.fare} | ${s.boarding ? 'P' : ''}${s.alighting ? 'D' : ''}`).join('\n')}
            placeholder={'EDSA Cubao | 0 | 0 | P\nAlabang | 60 | 0 | P\nSipocot | 420 | 1100 | D\nNaga CBD | 480 | 1185 | D'} /></label>
        <label className="field">Roads and crossings: type (expressway, highway, ferry, city) | name | from | to | toll
          <textarea name="itinerary" rows={6} defaultValue={r?.itinerary.map((l) => `${l.type} | ${l.name} | ${l.from} | ${l.to}${l.toll ? ' | toll' : ''}`).join('\n')}
            placeholder={'expressway | South Luzon Expressway (SLEX) | Magallanes | Santo Tomas | toll\nhighway | Pan-Philippine Highway | Santo Tomas | Naga'} /></label>
      </div>
      <p className="note">Segment fares come from the differences: a passenger from Alabang to Sipocot above pays PHP 1,100. Leave minutes empty when a stop&apos;s time isn&apos;t published.</p>
    </>
  );

  return (
    <>
      <h1 className="page-h">Routes</h1>
      <p className="lead">A route is the ordered list of stops with cumulative fares, plus the roads and ferries it uses. Schedules put buses on it; its stops decide which From → To pairs passengers can choose.</p>
      {manage && <section className="panel"><h2>New route</h2><ActionForm action={saveRoute} submit="Save route" reset><Fields /></ActionForm></section>}
      <ul className="cards">
        {routes.map((r) => (
          <li key={r.id} className={'card col' + (r.active ? '' : ' off')}>
            <details>
              <summary>
                <strong>{r.code}</strong> {r.name}
                {r.mode === 'road_ferry' && <span className="chip plain">ferry</span>}
                {r.data_sources.some((s) => !s.verified) && <span className="chip no">indicative</span>}
                <span className="note">{r.stops.length} stops, up to {peso(Math.max(...r.stops.map((s) => s.fare)) * 100)}, {r.schedules} schedules</span>
              </summary>
              {r.data_sources.map((s, i) => <p key={i} className="note">Source: {s.what} ({s.verified_at}) <a href={s.url} target="_blank" rel="noreferrer noopener">{new URL(s.url).hostname}</a></p>)}
              {manage ? <ActionForm action={saveRoute} submit="Save route"><Fields r={r} /></ActionForm>
                : <ol className="stops">{r.stops.map((s, i) => <li key={i}>{s.name} <span className="note">{peso(s.fare * 100)}</span></li>)}</ol>}
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
