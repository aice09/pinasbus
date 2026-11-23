import type { Metadata } from 'next';
import { saveSchedule } from '@/app/actions/ops';
import { manilaNow, time12 } from '@/lib/catalog';
import { q } from '@/lib/db';
import { orgCtx } from '@/lib/tenancy';
import type { Source } from '@/lib/trips';
import { ActionForm } from '@/components/ActionForm';
import { OrgField } from '@/components/OrgField';

export const metadata: Metadata = { title: 'Schedules' };

type Sched = { id: string; route_id: string; code: string; departure: string; days: number[]; valid_from: string; valid_to: string | null; bus_id: string | null; layout_id: string;
  class_name: string; amenity_ids: string[]; fare_adjust_pct: number; active: boolean; data_sources: Source[]; route: string };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function Schedules({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await orgCtx(slug);
  if (!c.can('schedules.manage') && !c.can('trips.view')) return <p className="error">You do not have access to schedules.</p>;
  const [rows, routes, layouts, buses, amenities] = await Promise.all([
    q<Sched>(`select s.*, to_char(s.departure, 'HH24:MI') departure, r.code || ' ' || r.name route from schedules s join routes r on r.id = s.route_id where s.org_id = $1 order by r.code, s.departure`, [c.org.id]),
    q<{ id: string; label: string }>(`select id, code || ' ' || name label from routes where org_id = $1 order by code`, [c.org.id]),
    q<{ id: string; name: string }>('select id, name from seat_layouts where org_id = $1 order by name', [c.org.id]),
    q<{ id: string; code: string; plate: string }>(`select id, code, plate from buses where org_id = $1 and status <> 'retired' order by code`, [c.org.id]),
    q<{ id: string; name: string }>('select id, name from amenities where org_id is null or org_id = $1 order by name', [c.org.id]),
  ]);
  const manage = c.can('schedules.manage');
  const Fields = ({ s }: { s?: Sched }) => (
    <>
      <OrgField slug={slug} />{s && <input type="hidden" name="id" value={s.id} />}
      <div className="row4">
        <label className="field">Route<select name="route_id" required defaultValue={s?.route_id}>{routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
        <label className="field">Trip code<input name="code" required maxLength={30} defaultValue={s?.code} /></label>
        <label className="field">Departs (first stop)<input name="departure" type="time" required defaultValue={s?.departure} /></label>
        <label className="field">Fare adjustment (%)<input name="fare_adjust_pct" type="number" step="0.5" min="-50" max="100" defaultValue={s?.fare_adjust_pct ?? 0} /></label>
      </div>
      <fieldset><legend>Runs on</legend><div className="checks">{DAYS.map((d, i) => <label key={d} className="check"><input type="checkbox" name="days" value={i} defaultChecked={s ? s.days.includes(i) : true} /> {d}</label>)}</div></fieldset>
      <div className="row4">
        <label className="field">From<input name="valid_from" type="date" required defaultValue={s?.valid_from ?? manilaNow().date} /></label>
        <label className="field">Until (empty = ongoing; use for seasonal or holiday runs)<input name="valid_to" type="date" defaultValue={s?.valid_to ?? ''} /></label>
        <label className="field">Seat layout<select name="layout_id" required defaultValue={s?.layout_id}>{layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="field">Default bus<select name="bus_id" defaultValue={s?.bus_id ?? ''}><option value="">Assign at dispatch</option>{buses.map((b) => <option key={b.id} value={b.id}>{b.code} {b.plate}</option>)}</select></label>
      </div>
      <div className="row2">
        <label className="field">Class shown to passengers<input name="class_name" maxLength={40} defaultValue={s?.class_name} /></label>
        <label className="check"><input type="checkbox" name="active" defaultChecked={s?.active ?? true} /> Selling</label>
      </div>
      <fieldset><legend>Amenities when no bus is assigned</legend><div className="checks">{amenities.map((a) => <label key={a.id} className="check"><input type="checkbox" name="amenity" value={a.id} defaultChecked={s?.amenity_ids.includes(a.id)} /> {a.name}</label>)}</div></fieldset>
    </>
  );
  return (
    <>
      <h1 className="page-h">Schedules</h1>
      <p className="lead">A schedule is a recurring departure on a route. PINASBUS creates a dated trip for each operating day; changes reach future trips that have not sold seats yet.</p>
      {manage && (routes.length && layouts.length
        ? <section className="panel"><h2>New schedule</h2><ActionForm action={saveSchedule} submit="Save schedule" reset><Fields /></ActionForm></section>
        : <p className="warnbox">Create a route and a seat layout first.</p>)}
      <ul className="cards">
        {rows.map((s) => (
          <li key={s.id} className={'card col' + (s.active ? '' : ' off')}>
            <details>
              <summary>
                <strong>{time12(s.departure)}</strong> {s.route} <span className="chip">{s.class_name}</span>
                {s.data_sources.some((d) => !d.verified) && <span className="chip no">indicative</span>}
                <span className="note">Trip {s.code}, {s.days.length === 7 ? 'daily' : s.days.map((d) => DAYS[d]).join(' ')}{s.valid_to ? ` until ${s.valid_to}` : ''}{Number(s.fare_adjust_pct) ? `, fare ${Number(s.fare_adjust_pct) > 0 ? '+' : ''}${s.fare_adjust_pct}%` : ''}</span>
              </summary>
              {manage && <ActionForm action={saveSchedule} submit="Save schedule"><Fields s={s} /></ActionForm>}
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
