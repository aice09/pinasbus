import type { Metadata } from 'next';
import { linkCard, startLoad, unlinkCard } from '@/app/actions/cards';
import { requireUser } from '@/lib/auth';
import { maskCard } from '@/lib/cards';
import { peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Transport cards' };

export default async function Cards({ searchParams }: { searchParams: Promise<{ loaded?: string }> }) {
  const u = await requireUser('/account/cards');
  const { loaded } = await searchParams;
  const cards = await q<{ id: string; number: string; status: string; balance_centavos: number; program: string; issuer: string; min: number; max: number }>(
    `select c.id, c.number, c.status, c.balance_centavos, p.name program, o.name issuer, p.min_load_centavos min, p.max_balance_centavos max
       from cards c join card_programs p on p.id = c.program_id join organizations o on o.id = c.org_id where c.user_id = $1 order by c.created_at`, [u.id]);
  const ledger = cards.length ? await q<{ card_id: string; kind: string; amount_centavos: number; balance_after: number; reference: string; channel: string; created_at: Date }>(
    'select card_id, kind, amount_centavos, balance_after, reference, channel, created_at from card_ledger where card_id = any($1) order by id desc limit 100', [cards.map((c) => c.id)]) : [];
  const trips = cards.length ? await q<{ ref: string; pickup: string; dropoff: string; travel_date: string; total_centavos: number; card_id: string }>(
    `select ref, pickup, dropoff, travel_date, total_centavos, card_id from bookings where card_id = any($1) order by created_at desc limit 50`, [cards.map((c) => c.id)]) : [];
  const [lastLoad] = loaded ? await q<{ status: string }>('select status from card_loads where ref = $1 and user_id = $2', [loaded, u.id]) : [];
  return (
    <>
      <h1 className="page-h">Transport cards</h1>
      <p className="lead">Link a stored-value card from a PINASBUS card issuer, load it with GCash, Maya or a bank card, and pay fares with it. The issuer keeps the balance; PINASBUS shows what the issuer reports.</p>
      {loaded && <p className={lastLoad?.status === 'paid' ? 'ok' : 'warnbox'} role="status">{lastLoad?.status === 'paid' ? 'Load complete.' : 'Payment received by PayMongo; the load appears here within a minute.'}</p>}
      <section className="panel"><h2>Link a card</h2>
        <ActionForm action={linkCard} submit="Link card" className="inline-form" reset>
          <label className="field grow">16-digit card number<input name="number" inputMode="numeric" required pattern="[0-9 ]{16,19}" placeholder="8800 1234 5678 9012" /></label>
        </ActionForm>
      </section>
      <ul className="cards">
        {cards.map((c) => (
          <li key={c.id} className="card col">
            <div className="tcard"><span className="tcard-issuer">{c.issuer}</span><span className="tcard-num mono">{c.number.replace(/(\d{4})(?=\d)/g, '$1 ')}</span><span className="tcard-bal">{peso(c.balance_centavos)}</span><span className="tcard-prog">{c.program}{c.status !== 'active' && `, ${c.status}`}</span></div>
            {c.status === 'active' && (
              <ActionForm action={startLoad} submit="Load with PayMongo" pending="Opening payment…" className="inline-form">
                <input type="hidden" name="id" value={c.id} />
                <label className="field">Amount (PHP)<input name="amount" type="number" min={c.min / 100} max={(c.max - c.balance_centavos) / 100} step="1" required defaultValue={500} /></label>
              </ActionForm>
            )}
            <details><summary className="note">History and trips</summary>
              <table className="fares small"><thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col">Amount</th><th scope="col">Balance</th></tr></thead>
                <tbody>{ledger.filter((l) => l.card_id === c.id).map((l, i) => <tr key={i}><td>{l.created_at.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td><td>{l.kind} <span className="note">{l.channel} {l.reference}</span></td><td className="num">{peso(l.amount_centavos)}</td><td className="num">{peso(l.balance_after)}</td></tr>)}</tbody></table>
              {trips.filter((t) => t.card_id === c.id).map((t) => <p key={t.ref} className="note">{t.travel_date}: {t.pickup} → {t.dropoff}, {peso(t.total_centavos)} ({t.ref})</p>)}
            </details>
            <ActionForm action={unlinkCard} submit="Remove from my account" quiet confirm={`Remove ${maskCard(c.number)}?`}><input type="hidden" name="id" value={c.id} /></ActionForm>
          </li>
        ))}
        {cards.length === 0 && <li className="note">No cards linked yet.</li>}
      </ul>
    </>
  );
}
