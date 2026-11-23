import Link from 'next/link';
import type { Metadata } from 'next';
import { createOrg, resetDemo, setOrgStatus } from '@/app/actions/platform';
import { requirePlatformAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Companies' };

const KIND = { bus_operator: 'Bus company', card_issuer: 'Card issuer', shipping_operator: 'Shipping operator', platform: 'Platform' } as const;

export default async function Orgs() {
  await requirePlatformAdmin();
  const orgs = await q<{ id: string; slug: string; name: string; kind: keyof typeof KIND; status: string; is_demo: boolean; members: number; created_at: Date; data_sources: { url: string; what: string; verified: boolean; verified_at: string }[] }>(
    `select o.*, (select count(*) from memberships m where m.org_id = o.id)::int members from organizations o where o.kind <> 'platform' order by o.kind, o.name`);
  return (
    <>
      <h1 className="page-h">Companies</h1>
      <p className="lead">Bus companies, card issuers and shipping operators on PINASBUS. Each works in its own isolated workspace; suspending one hides its trips and locks its staff out of it.</p>
      <section className="panel" aria-labelledby="new-h">
        <h2 id="new-h">Register a company</h2>
        <ActionForm action={createOrg} submit="Register company" reset>
          <div className="row3">
            <label className="field">Company name<input name="name" required maxLength={120} /></label>
            <label className="field">Short name (in web addresses)<input name="slug" required pattern="[a-z0-9\-]{2,40}" placeholder="dltb-co" /></label>
            <label className="field">Type<select name="kind"><option value="bus_operator">Bus company</option><option value="card_issuer">Card issuer</option><option value="shipping_operator">Shipping operator</option></select></label>
          </div>
          <div className="row2">
            <label className="field">Company email<input name="contact_email" type="email" required /></label>
            <label className="field">Company phone<input name="contact_phone" /></label>
          </div>
          <div className="row2">
            <label className="field">First administrator&apos;s name<input name="admin_name" required /></label>
            <label className="field">First administrator&apos;s email<input name="admin_email" type="email" required /></label>
          </div>
        </ActionForm>
      </section>
      <ul className="cards">
        {orgs.map((o) => (
          <li key={o.id} className={'card' + (o.status === 'suspended' ? ' off' : '')}>
            <div className="card-main">
              <h3>{o.kind === 'bus_operator' ? <Link href={`/ops/${o.slug}`}>{o.name}</Link> : o.name}</h3>
              <p className="meta"><span className="chip">{KIND[o.kind]}</span><span className="chip plain">{o.status}</span>{o.is_demo && <span className="chip no">demo, unaffiliated</span>} {o.members} staff, since {o.created_at.toLocaleDateString('en-PH')}</p>
              {o.data_sources.map((d, i) => <p key={i} className="note">{d.verified ? 'Verified' : 'Indicative'}: {d.what}. <a href={d.url} rel="noreferrer noopener" target="_blank">{new URL(d.url).hostname}</a>, {d.verified_at}</p>)}
            </div>
            <div className="card-actions">
              <ActionForm action={setOrgStatus} submit={o.status === 'suspended' ? 'Reactivate' : 'Suspend'} quiet confirm={`${o.status === 'suspended' ? 'Reactivate' : 'Suspend'} ${o.name}?`}>
                <input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value={o.status === 'suspended' ? 'active' : 'suspended'} />
              </ActionForm>
            </div>
          </li>
        ))}
      </ul>
      <section className="panel danger" aria-labelledby="demo-h">
        <h2 id="demo-h">Reset demo data</h2>
        <p>Deletes every demo company with its trips and bookings, and the demo accounts, then loads them again from the seed. Real companies are not touched.</p>
        <ActionForm action={resetDemo} submit="Reset demo data" quiet confirm="Reset all demo data?">
          <label className="field">Type RESET to confirm<input name="confirm" required pattern="RESET" /></label>
        </ActionForm>
      </section>
    </>
  );
}
