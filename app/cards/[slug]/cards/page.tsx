import type { Metadata } from 'next';
import { adjustCard, issueCards, saveProgram, setCardStatus } from '@/app/actions/cards';
import { peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import { orgCtx } from '@/lib/tenancy';
import { ActionForm } from '@/components/ActionForm';
import { OrgField } from '@/components/OrgField';

export const metadata: Metadata = { title: 'Programs and cards' };

export default async function Cards({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const c = await orgCtx(slug, 'cards.view');
  const term = (sp.q ?? '').replace(/[^0-9a-zA-Z@. ]/g, '').slice(0, 40);
  const [programs, cards] = await Promise.all([
    q<{ id: string; name: string; prefix: string; min_load_centavos: number; max_balance_centavos: number; n: number }>(
      `select p.*, (select count(*) from cards c where c.program_id = p.id)::int n from card_programs p where p.org_id = $1 order by p.name`, [c.org.id]),
    q<{ id: string; number: string; status: string; balance_centavos: number; holder_name: string; email: string | null; program: string }>(
      `select c.id, c.number, c.status, c.balance_centavos, c.holder_name, u.email, p.name program from cards c join card_programs p on p.id = c.program_id left join users u on u.id = c.user_id
        where c.org_id = $1 and ($2 = '' or c.number like '%'||$2||'%' or c.holder_name ilike '%'||$2||'%' or u.email ilike '%'||$2||'%') order by c.user_id is null, c.created_at desc limit 200`, [c.org.id, term]),
  ]);
  const manage = c.can('cards.manage');
  return (
    <>
      <h1 className="page-h">Programs and cards</h1>
      {manage && (
        <section className="panel"><h2>Card programs</h2>
          {programs.map((p) => <p key={p.id}><strong>{p.name}</strong> <span className="note">prefix {p.prefix}, load from {peso(p.min_load_centavos)}, holds up to {peso(p.max_balance_centavos)}, {p.n} cards</span></p>)}
          <ActionForm action={saveProgram} submit="Save program">
            <OrgField slug={slug} />
            <div className="row4"><label className="field">Name<input name="name" required maxLength={60} placeholder="Commuter card" /></label><label className="field">Number prefix (4 digits)<input name="prefix" required pattern="[0-9]{4}" placeholder="8800" /></label>
              <label className="field">Minimum load (PHP)<input name="min_load" type="number" min="1" defaultValue={100} /></label><label className="field">Maximum balance (PHP)<input name="max_balance" type="number" min="100" defaultValue={10000} /></label></div>
          </ActionForm>
          {programs.length > 0 && (
            <ActionForm action={issueCards} submit="Add cards to inventory" className="inline-form">
              <OrgField slug={slug} />
              <label className="field">Program<select name="program">{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label className="field">How many<input name="count" type="number" min="1" max="500" defaultValue={20} /></label>
            </ActionForm>
          )}
        </section>
      )}
      <form className="inline-form" method="get"><label className="field grow">Find a card<input name="q" defaultValue={term} placeholder="Number, holder or email" /></label><button className="btn quiet" type="submit">Search</button></form>
      <div className="table-wrap"><table className="fares small">
        <thead><tr><th scope="col">Card</th><th scope="col">Holder</th><th scope="col">Program</th><th scope="col">Balance</th><th scope="col">Status</th>{manage && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
        <tbody>{cards.map((x) => (
          <tr key={x.id}><td className="mono">{x.number.replace(/(\d{4})(?=\d)/g, '$1 ')}</td><td>{x.holder_name || 'unassigned'}<br /><span className="note">{x.email?.replace('@', ' @ ') ?? ''}</span></td><td>{x.program}</td><td className="num">{peso(x.balance_centavos)}</td><td>{x.status}</td>
            {manage && <td>
              {x.status !== 'inventory' && <ActionForm action={setCardStatus} submit={x.status === 'blocked' ? 'Unblock' : 'Block'} quiet confirm={`${x.status === 'blocked' ? 'Unblock' : 'Block'} card ${x.number.slice(-4)}?`}><OrgField slug={slug} /><input type="hidden" name="id" value={x.id} /><input type="hidden" name="status" value={x.status === 'blocked' ? 'active' : 'blocked'} /></ActionForm>}
              <details><summary className="note">Adjust balance</summary><ActionForm action={adjustCard} submit="Adjust"><OrgField slug={slug} /><input type="hidden" name="id" value={x.id} />
                <label className="field">Amount (PHP, negative to deduct)<input name="amount" type="number" step="0.01" required /></label><label className="field">Reason<input name="reason" required maxLength={120} /></label></ActionForm></details>
            </td>}
          </tr>))}</tbody>
      </table></div>
    </>
  );
}
