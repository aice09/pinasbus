import Link from 'next/link';
import type { Metadata } from 'next';
import { addDays, clock, manilaNow, peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import { canSeeTrip } from '@/lib/rbac';
import { orgCtx } from '@/lib/tenancy';
import { tripsOn } from '@/lib/trips';
import { BarChart } from '@/components/BarChart';

export const metadata: Metadata = { title: 'Company overview' };

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await orgCtx(slug);
  const today = manilaNow().date;
  const trips = (await tripsOn(today, c.org.id)).filter((t) => canSeeTrip(c.role, c.user.id, t));
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));

  let report = null;
  if (c.can('reports.view')) {
    const [rev, routes, [k]] = await Promise.all([
      q<{ d: string; v: number }>(`select (paid_at at time zone 'Asia/Manila')::date d, sum(total_centavos)::bigint v from bookings where org_id = $1 and status = 'paid' and paid_at >= $2::date - 1 group by 1`, [c.org.id, days[0]]),
      q<{ label: string; value: number }>(`select pickup || ' → ' || dropoff label, sum(cardinality(seats))::int value from bookings where org_id = $1 and status = 'paid' and paid_at >= $2::date group by 1 order by 2 desc limit 8`, [c.org.id, days[0]]),
      q<{ rev: number; seats: number; online: number; terminal: number; refunds: number }>(
        `select coalesce(sum(total_centavos) filter (where status = 'paid'), 0)::bigint rev, coalesce(sum(cardinality(seats)) filter (where status = 'paid'), 0)::int seats,
                count(*) filter (where status = 'paid' and channel = 'online')::int online, count(*) filter (where status = 'paid' and channel = 'terminal')::int terminal,
                count(*) filter (where status = 'needs_refund')::int refunds
           from bookings where org_id = $1 and created_at >= $2::date`, [c.org.id, days[0]]),
    ]);
    const m = new Map(rev.map((r) => [r.d, r.v]));
    report = { k, routes, series: days.map((d) => ({ label: new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }), value: m.get(d) ?? 0 })) };
  }

  return (
    <>
      <h1 className="page-h">{c.org.name}</h1>
      {c.org.is_demo && <p className="warnbox">Demo company built from public data; not affiliated with PINASBUS. {c.org.data_sources.map((s) => `${s.verified ? 'Verified' : 'Indicative'}: ${s.what} (${s.verified_at})`).join('. ')}.</p>}
      <div className="stats">
        <div className="stat"><span>{c.can('trips.view') ? 'Trips today' : 'Your trips today'}</span><strong>{trips.length}</strong></div>
        <div className="stat"><span>On the road now</span><strong>{trips.filter((t) => t.status === 'departed').length}</strong></div>
        {report && <><div className="stat"><span>Collected, 30 days</span><strong>{peso(report.k.rev)}</strong></div><div className="stat"><span>Seats sold, 30 days</span><strong>{report.k.seats.toLocaleString()}</strong></div></>}
      </div>
      {report && report.k.refunds > 0 && <ul className="todo"><li><Link href={`/ops/${slug}/bookings?status=needs_refund`}>{report.k.refunds} booking{report.k.refunds > 1 ? 's' : ''} waiting for a refund</Link></li></ul>}
      <section className="section tight" aria-labelledby="today-h">
        <h2 id="today-h">Today</h2>
        {trips.length === 0 ? <p className="note">No trips today{c.can('trips.view') ? '' : ' assigned to you'}.</p> : (
          <ul className="cards">
            {trips.slice(0, 12).map((t) => (
              <li key={t.id} className="card">
                <div className="card-main"><h3>{clock(new Date(t.departs_at))} {t.route_name}</h3><p className="meta"><span className="chip">{t.class_name}</span><span className="chip plain">{t.status}</span> Trip {t.code}{t.bus_code && `, bus ${t.bus_code}`}</p></div>
                <div className="card-actions"><Link className="btn quiet small" href={`/ops/${slug}/trips/${t.id}`}>Manifest</Link></div>
              </li>
            ))}
          </ul>
        )}
        {trips.length > 12 && <p><Link href={`/ops/${slug}/trips`}>All {trips.length} trips today</Link></p>}
      </section>
      {report && (
        <div className="charts">
          <BarChart title="Collected per day" data={report.series} format="peso" />
          <BarChart title="Top segments by seats sold, 30 days" data={report.routes} horizontal />
        </div>
      )}
      {report && <p className="note">Paid bookings in 30 days: {report.k.online} online, {report.k.terminal} at the terminal.</p>}
    </>
  );
}
