import type { Metadata } from 'next';
import { addDays, manilaNow, peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import { orgCtx } from '@/lib/tenancy';
import { BarChart } from '@/components/BarChart';

export const metadata: Metadata = { title: 'Card issuer overview' };

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await orgCtx(slug, 'cards.view');
  const days = Array.from({ length: 30 }, (_, i) => addDays(manilaNow().date, i - 29));
  const [[k], perDay, loads, mismatches] = await Promise.all([
    q<{ cards: number; active: number; holders: number; float: number; loaded: number; spent: number }>(
      `select count(*)::int cards, count(*) filter (where status = 'active')::int active, count(distinct user_id)::int holders, coalesce(sum(balance_centavos), 0)::bigint float,
              coalesce((select sum(amount_centavos) from card_ledger l join cards x on x.id = l.card_id where x.org_id = $1 and l.kind = 'load'), 0)::bigint loaded,
              coalesce((select -sum(amount_centavos) from card_ledger l join cards x on x.id = l.card_id where x.org_id = $1 and l.kind = 'fare'), 0)::bigint spent
         from cards where org_id = $1`, [c.org.id]),
    q<{ d: string; v: number }>(`select (l.created_at at time zone 'Asia/Manila')::date d, sum(amount_centavos)::bigint v from card_ledger l join cards x on x.id = l.card_id
       where x.org_id = $1 and l.kind = 'load' and l.created_at >= $2::date - 1 group by 1`, [c.org.id, days[0]]),
    q<{ ref: string; amount_centavos: number; status: string; payment_id: string | null; created_at: Date; number: string; ledger: number | null }>(
      `select l.ref, l.amount_centavos, l.status, l.payment_id, l.created_at, c.number,
              (select g.amount_centavos from card_ledger g where g.kind = 'load' and g.reference = l.ref) ledger
         from card_loads l join cards c on c.id = l.card_id where c.org_id = $1 order by l.created_at desc limit 50`, [c.org.id]),
    // Reconciliation: every paid PayMongo load must have exactly one ledger entry of the same amount, and vice versa.
    q<{ ref: string; problem: string }>(
      `select l.ref, case when g.id is null then 'paid in PayMongo, missing on the card' else 'amount differs' end problem
         from card_loads l join cards c on c.id = l.card_id left join card_ledger g on g.kind = 'load' and g.reference = l.ref
        where c.org_id = $1 and l.status = 'paid' and (g.id is null or g.amount_centavos <> l.amount_centavos)
       union all
       select g.reference, 'on the card, no paid PayMongo load' from card_ledger g join cards c on c.id = g.card_id left join card_loads l on l.ref = g.reference
        where c.org_id = $1 and g.kind = 'load' and g.channel = 'paymongo' and (l.id is null or l.status <> 'paid')`, [c.org.id]),
  ]);
  const m = new Map(perDay.map((r) => [r.d, r.v]));
  return (
    <>
      <h1 className="page-h">{c.org.name}</h1>
      {c.org.is_demo && <p className="warnbox">Demo card issuer. Balances live in this issuer&apos;s own ledger, which PINASBUS reaches through the issuer adapter.</p>}
      <div className="stats">
        <div className="stat"><span>Cards (active)</span><strong>{k.cards} ({k.active})</strong></div>
        <div className="stat"><span>Cardholders</span><strong>{k.holders}</strong></div>
        <div className="stat"><span>Stored value (float)</span><strong>{peso(k.float)}</strong></div>
        <div className="stat"><span>Spent on fares</span><strong>{peso(k.spent)}</strong></div>
      </div>
      <div className="charts"><BarChart title="Loads per day" data={days.map((d) => ({ label: new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }), value: m.get(d) ?? 0 }))} format="peso" /></div>
      <section className="section tight" aria-labelledby="rec-h">
        <h2 id="rec-h">Reconciliation</h2>
        {mismatches.length === 0 ? <p className="ok">All PayMongo loads match the card ledger ({peso(k.loaded)} loaded in total).</p>
          : <ul className="todo">{mismatches.map((x) => <li key={x.ref}><span>{x.ref}: {x.problem}</span></li>)}</ul>}
      </section>
      <section className="section tight" aria-labelledby="ld-h">
        <h2 id="ld-h">Recent loads</h2>
        <div className="table-wrap"><table className="fares small">
          <thead><tr><th scope="col">Load</th><th scope="col">Card</th><th scope="col">Amount</th><th scope="col">Payment</th><th scope="col">On card</th><th scope="col">When</th></tr></thead>
          <tbody>{loads.map((l) => <tr key={l.ref}><td className="mono">{l.ref}</td><td>•••• {l.number.slice(-4)}</td><td className="num">{peso(l.amount_centavos)}</td><td>{l.status}<br /><span className="note">{l.payment_id ?? ''}</span></td><td className="num">{l.ledger != null ? peso(l.ledger) : '—'}</td><td>{l.created_at.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td></tr>)}</tbody>
        </table></div>
      </section>
    </>
  );
}
