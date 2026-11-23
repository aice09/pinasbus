import Link from 'next/link';
import type { Metadata } from 'next';
import { ackAlert } from '@/app/actions/ops';
import { clock, manilaNow } from '@/lib/catalog';
import { q } from '@/lib/db';
import { orgCtx } from '@/lib/tenancy';
import { liveSnapshot, routeGeometry, simulate } from '@/lib/tracking';
import { tripsOn } from '@/lib/trips';
import { ActionForm } from '@/components/ActionForm';
import { OrgField } from '@/components/OrgField';

export const metadata: Metadata = { title: 'Live tracking' };

export default async function Live({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await orgCtx(slug, 'tracking.view');
  const now = Date.now();
  const trips = (await tripsOn(manilaNow().date, c.org.id)).filter((t) => t.status !== 'cancelled' && new Date(t.departs_at).getTime() < now + 3600_000);
  const routeOf = new Map((await q<{ id: string; route_id: string }>('select id, route_id from schedules where org_id = $1', [c.org.id])).map((r) => [r.id, r.route_id]));
  const rows = [];
  for (const t of trips.slice(0, 40)) {
    const g = await routeGeometry(routeOf.get(t.schedule_id)!, t.stops);
    const s = (await liveSnapshot(t.id, g, t)) ?? (g ? simulate(t, g) : null);
    if (s && s.status === 'arrived' && t.status !== 'departed') continue;
    rows.push({ t, s });
  }
  const alerts = await q<{ id: number; trip_id: string; kind: string; detail: string; at: Date; code: string; route: string }>(
    `select a.id, a.trip_id, a.kind, a.detail, a.at, s.code, r.name route from trip_alerts a join trips t on t.id = a.trip_id join schedules s on s.id = t.schedule_id join routes r on r.id = s.route_id
      where a.org_id = $1 and not a.acknowledged order by a.at desc limit 50`, [c.org.id]);
  return (
    <>
      <h1 className="page-h">Live tracking</h1>
      <p className="lead">Buses on the road now. Rows marked simulated have no phone or GPS reporting yet; the crew can start sharing from the trip manifest.</p>
      {alerts.length > 0 && (
        <section className="section tight" aria-labelledby="al-h">
          <h2 id="al-h">Open alerts</h2>
          <ul className="cards">{alerts.map((a) => (
            <li key={a.id} className="card">
              <div className="card-main"><h3>{a.kind === 'speeding' ? 'Speeding' : a.kind === 'deviation' ? 'Off route' : 'Unusual stop'}: {a.detail}</h3><p className="meta">Trip {a.code}, {a.route}, {a.at.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}</p></div>
              <div className="card-actions"><Link className="btn quiet small" href={`/track/${a.trip_id}`}>Map</Link>
                <ActionForm action={ackAlert} submit="Acknowledge" quiet><OrgField slug={slug} /><input type="hidden" name="id" value={a.id} /></ActionForm></div>
            </li>))}</ul>
        </section>
      )}
      <div className="table-wrap">
        <table className="fares small">
          <thead><tr><th scope="col">Trip</th><th scope="col">Route</th><th scope="col">Status</th><th scope="col">Speed</th><th scope="col">Average / top</th><th scope="col">Remaining</th><th scope="col">ETA</th><th scope="col">Source</th><th scope="col"><span className="sr-only">Map</span></th></tr></thead>
          <tbody>{rows.map(({ t, s }) => (
            <tr key={t.id}>
              <td>{clock(new Date(t.departs_at))}<br /><span className="note">{t.code}{t.bus_code ? `, ${t.bus_code}` : ''}</span></td>
              <td>{t.route_name}</td><td>{t.status}</td>
              <td className="num">{s ? `${s.speedKph} km/h` : '—'}</td><td className="num">{s ? `${s.avgKph} / ${s.maxKph}` : '—'}</td>
              <td className="num">{s ? `${s.remainingKm} km` : '—'}</td><td className="num">{s?.eta ? clock(new Date(s.eta)) : '—'}</td>
              <td>{s ? (s.simulated ? <span className="chip no">simulated</span> : <span className="chip yes">live GPS</span>) : 'no map'}</td>
              <td><Link href={`/track/${t.id}`}>Map</Link></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="note">No buses on the road right now.</p>}
    </>
  );
}
