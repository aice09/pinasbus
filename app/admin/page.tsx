import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
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
  await requireAdmin();
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

  return (
    <>
      <h1 className="page-h">Dashboard</h1>
      <p className="lead">Last 30 days, Manila time. Live operations numbers are also in Grafana (BikolBus dashboard).</p>

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
    </>
  );
}
