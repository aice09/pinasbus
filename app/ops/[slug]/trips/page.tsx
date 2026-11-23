import Link from 'next/link';
import type { Metadata } from 'next';
import { dispatchTrip } from '@/app/actions/ops';
import { addDays, clock, isDate, manilaNow } from '@/lib/catalog';
import { q } from '@/lib/db';
import { PASSENGER_KINDS } from '@/lib/layouts';
import { canSeeTrip } from '@/lib/rbac';
import { orgCtx } from '@/lib/tenancy';
import { takenOn, tripsOn } from '@/lib/trips';
import { ActionForm } from '@/components/ActionForm';
import { OrgField } from '@/components/OrgField';

export const metadata: Metadata = { title: 'Trips and dispatch' };

export default async function Trips({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ date?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const c = await orgCtx(slug);
  if (!c.can('trips.view') && !c.can('trips.view_assigned')) return <p className="error">You do not have access to trips.</p>;
  const today = manilaNow().date;
  const date = isDate(sp.date) ? sp.date : today;
  const trips = (await tripsOn(date, c.org.id)).filter((t) => canSeeTrip(c.role, c.user.id, t));
  const taken = await takenOn(trips.map((t) => t.id));
  const dispatch = c.can('trips.dispatch');
  const [buses, crew] = dispatch ? await Promise.all([
    q<{ id: string; code: string; plate: string; class_name: string }>(`select id, code, plate, class_name from buses where org_id = $1 and status = 'active' order by code`, [c.org.id]),
    q<{ id: string; name: string; role: string }>(`select u.id, u.name, m.role from memberships m join users u on u.id = m.user_id where m.org_id = $1 and m.role in ('driver','assistant_driver','conductor') order by u.name`, [c.org.id]),
  ]) : [[], []];

  return (
    <>
      <h1 className="page-h">{c.can('trips.view') ? 'Trips and dispatch' : 'My trips'}</h1>
      <nav className="dates" aria-label="Service date">
        {Array.from({ length: 9 }, (_, i) => addDays(date, i - 2)).map((d) => (
          <Link key={d} href={`/ops/${slug}/trips?date=${d}`} aria-current={d === date ? 'date' : undefined}>
            <small>{d === today ? 'Today' : new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { weekday: 'short' })}</small><strong>{d.slice(8)}</strong><small>{new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { month: 'short' })}</small>
          </Link>
        ))}
      </nav>
      {trips.length === 0 && <p className="note">No trips {c.can('trips.view') ? 'on this date' : 'assigned to you on this date'}.</p>}
      <ul className="cards">
        {trips.map((t) => {
          const seats = t.seats.filter((s) => PASSENGER_KINDS.includes(s.kind)).length;
          return (
            <li key={t.id} className={'card col' + (t.status === 'cancelled' ? ' off' : '')}>
              <details>
                <summary>
                  <strong>{clock(new Date(t.departs_at))}</strong> {t.route_name}
                  <span className="chip">{t.class_name}</span><span className="chip plain">{t.status}</span>
                  <span className="note">Trip {t.code}. {taken.get(t.id) ?? 0} of {seats} sold. Bus {t.bus_code ?? 'unassigned'}{t.plate ? ` (${t.plate})` : ''}.</span>
                  <Link className="btn quiet small" href={`/ops/${slug}/trips/${t.id}`}>Manifest</Link>
                </summary>
                {dispatch && (
                  <ActionForm action={dispatchTrip} submit="Save dispatch" className="inline-form">
                    <OrgField slug={slug} /><input type="hidden" name="id" value={t.id} />
                    <label className="field">Bus<select name="bus_id" defaultValue={t.bus_id ?? ''}><option value="">Unassigned</option>{buses.map((b) => <option key={b.id} value={b.id}>{b.code} {b.plate} ({b.class_name})</option>)}</select></label>
                    <label className="field">Driver<select name="driver_id" defaultValue={t.driver_id ?? ''}><option value="">None</option>{crew.filter((x) => x.role !== 'conductor').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                    <label className="field">Conductor<select name="conductor_id" defaultValue={t.conductor_id ?? ''}><option value="">None</option>{crew.filter((x) => x.role === 'conductor').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                    <label className="field">Status<select name="status" defaultValue={t.status}>{['scheduled', 'boarding', 'departed', 'arrived', 'cancelled'].map((s) => <option key={s}>{s}</option>)}</select></label>
                  </ActionForm>
                )}
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}
