import type { Metadata } from 'next';
import { Email } from '@/components/Email';
import { setUserDisabled } from '@/app/actions/platform';
import { requirePlatformAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Users' };

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requirePlatformAdmin();
  const term = ((await searchParams).q ?? '').trim().slice(0, 80);
  const rows = await q<{ id: string; name: string; email: string; phone: string; platform_role: string; disabled: boolean; created_at: Date; bookings: number; work: string | null }>(
    `select u.id, u.name, u.email, u.phone, u.platform_role, u.disabled, u.created_at,
       (select count(*) from bookings b where b.user_id = u.id and b.status = 'paid')::int bookings,
       (select string_agg(o.name || ': ' || m.role, ', ') from memberships m join organizations o on o.id = m.org_id where m.user_id = u.id) work
     from users u where $1 = '' or u.email ilike '%'||$1||'%' or u.name ilike '%'||$1||'%' order by u.created_at desc limit 300`, [term]);
  return (
    <>
      <h1 className="page-h">Users</h1>
      <p className="lead">Everyone with an account. Company roles are assigned inside each company&apos;s workspace; platform admins come from the PLATFORM_ADMIN_EMAILS setting.</p>
      <form className="inline-form" method="get"><label className="field grow">Search<input name="q" defaultValue={term} placeholder="Name or email" /></label><button className="btn quiet" type="submit">Search</button></form>
      <div className="table-wrap">
        <table className="fares small">
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Works at</th><th scope="col">Paid bookings</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.name}{u.platform_role === 'platform_admin' && <span className="chip">platform admin</span>}<br /><span className="note">{u.phone}</span></td>
                <td><Email value={u.email} /></td>
                <td className="note">{u.work ?? 'Passenger'}</td>
                <td className="num">{u.bookings}</td>
                <td>{u.id === me.id ? 'you' : (
                  <ActionForm action={setUserDisabled} submit={u.disabled ? 'Enable' : 'Disable'} quiet confirm={`${u.disabled ? 'Enable' : 'Disable'} ${u.email}?`}>
                    <input type="hidden" name="id" value={u.id} /><input type="hidden" name="disabled" value={u.disabled ? 'false' : 'true'} />
                    <span className="note">{u.disabled ? 'disabled' : 'active'}</span>
                  </ActionForm>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
