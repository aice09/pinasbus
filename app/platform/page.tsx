import Link from 'next/link';
import type { Metadata } from 'next';
import { requirePlatformAdmin } from '@/lib/auth';
import { addDays, manilaNow, peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import { BarChart } from '@/components/BarChart';

export const metadata: Metadata = { title: 'Admin dashboard' };

/** Fill missing days with zero so every chart has the same 30-day axis. */
function series(rows: { d: string; v: number }[], days: string[]) {
  const m = new Map(rows.map((r) => [r.d, r.v]));
  return days.map((d) => ({ label: new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }), value: m.get(d) ?? 0 }));
}

export default async function Admin() {
  await requirePlatformAdmin();
  const today = manilaNow().date;
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const since = days[0];
  const byDay = (sql: string) => q<{ d: string; v: number }>(sql, [since]);
  const local = `(paid_at at time zone 'Asia/Manila')::date`;

  const [revenue, seats, padala, signups, routes, [k], [pending]] = await Promise.all([
    byDay(`select ${local} d, sum(total_centavos)::bigint v from bookings where status = 'paid' and paid_at >= $1::date - 1 group by 1`),
    byDay(`select ${local} d, sum(cardinality(seats))::int v from bookings where status = 'paid' and paid_at >= $1::date - 1 group by 1`),
    byDay(`select ${local} d, count(*)::int v from shipments where paid_at is not null and paid_at >= $1::date - 1 group by 1`),
    byDay(`select (created_at at time zone 'Asia/Manila')::date d, count(*)::int v from users where created_at >= $1::date - 1 group by 1`),
    q<{ label: string; value: number }>(`select pickup || ' → ' || dropoff label, sum(cardinality(seats))::int value from bookings
      where status = 'paid' and paid_at >= $1::date group by 1 order by 2 desc limit 8`, [since]),
    q<{ rev: number; seats: number; bookings: number; fee: number }>(`select coalesce(sum(total_centavos),0)::bigint rev, coalesce(sum(cardinality(seats)),0)::int seats,
      count(*)::int bookings, coalesce(sum(fee_centavos),0)::bigint fee from bookings where status = 'paid' and paid_at >= $1::date`, [since]),
    q<{ refunds: number; msgs: number; parcels: number }>(`select (select count(*) from bookings where status = 'needs_refund')::int refunds,
      (select count(*) from messages where not handled)::int msgs,
      (select count(*) from shipments where status in ('paid','received','in_transit'))::int parcels`),
  ]);

  const companies = await q<{ slug: string; name: string; status: string; buses: number; routes: number; trips_today: number; seats: number; rev: number }>(
    `select o.slug, o.name, o.status,
       (select count(*) from buses b where b.org_id = o.id)::int buses,
       (select count(*) from routes r where r.org_id = o.id and r.active)::int routes,
       (select count(*) from trips t where t.org_id = o.id and t.service_date = $2)::int trips_today,
       coalesce((select sum(cardinality(seats)) from bookings b where b.org_id = o.id and b.status = 'paid' and b.paid_at >= $1::date), 0)::int seats,
       coalesce((select sum(total_centavos) from bookings b where b.org_id = o.id and b.status = 'paid' and b.paid_at >= $1::date), 0)::bigint rev
     from organizations o where o.kind = 'bus_operator' order by o.name`, [since, today]);
  return (
    <>
      <h1 className="page-h">Platform overview</h1>
      <p className="lead">Last 30 days, Manila time. Live operations numbers are also in Grafana (PINASBUS dashboard).</p>

      <div className="stats">
        <div className="stat"><span>Collected online</span><strong>{peso(k.rev)}</strong></div>
        <div className="stat"><span>Convenience fees</span><strong>{peso(k.fee)}</strong></div>
        <div className="stat"><span>Seats sold</span><strong>{k.seats.toLocaleString()}</strong></div>
        <div className="stat"><span>Paid bookings</span><strong>{k.bookings.toLocaleString()}</strong></div>
      </div>

      {(pending.refunds > 0 || pending.msgs > 0 || pending.parcels > 0) && (
        <ul className="todo">
          {pending.refunds > 0 && <li><Link href="/admin/bookings?status=needs_refund">{pending.refunds} booking{pending.refunds > 1 ? 's' : ''} waiting for a refund</Link></li>}
          {pending.parcels > 0 && <li><Link href="/admin/padala">{pending.parcels} Padala package{pending.parcels > 1 ? 's' : ''} to move</Link></li>}
          {pending.msgs > 0 && <li><Link href="/admin/messages">{pending.msgs} unanswered message{pending.msgs > 1 ? 's' : ''}</Link></li>}
        </ul>
      )}

      <div className="charts">
        <BarChart title="Revenue per day" data={series(revenue, days)} format="peso" />
        <BarChart title="Seats sold per day" data={series(seats, days)} />
        <BarChart title="Padala shipments paid per day" data={series(padala, days)} />
        <BarChart title="New accounts per day" data={series(signups, days)} />
        <BarChart title="Top routes by seats sold" data={routes} horizontal />
      </div>

      <section className="section tight" aria-labelledby="co-h">
        <h2 id="co-h">By company, last 30 days</h2>
        <div className="table-wrap">
          <table className="fares small">
            <thead><tr><th scope="col">Company</th><th scope="col">Status</th><th scope="col">Buses</th><th scope="col">Routes</th><th scope="col">Trips today</th><th scope="col">Seats sold</th><th scope="col">Collected</th></tr></thead>
            <tbody>{companies.map((c) => (
              <tr key={c.slug}><th scope="row"><Link href={`/ops/${c.slug}`}>{c.name}</Link></th><td>{c.status}</td><td className="num">{c.buses}</td><td className="num">{c.routes}</td><td className="num">{c.trips_today}</td><td className="num">{c.seats}</td><td className="num">{peso(c.rev)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
