import type { Metadata } from 'next';
import { Email } from '@/components/Email';
import { setRole } from '@/app/actions/admin';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Users' };

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireAdmin();
  const term = ((await searchParams).q ?? '').trim().slice(0, 80);
  const rows = await q<{ id: string; name: string; email: string; phone: string; role: string; created_at: Date; bookings: number; passengers: number }>(
    `select u.id, u.name, u.email, u.phone, u.role, u.created_at,
       (select count(*) from bookings b where b.user_id = u.id and b.status = 'paid')::int bookings,
       (select count(*) from passengers p where p.user_id = u.id)::int passengers
     from users u where $1 = '' or u.email ilike '%'||$1||'%' or u.name ilike '%'||$1||'%' order by u.created_at desc limit 200`, [term]);
  return (
    <>
      <h1 className="page-h">Users</h1>
      <form className="inline-form" method="get"><label className="field grow">Search<input name="q" defaultValue={term} placeholder="Name or email" /></label><button className="btn quiet" type="submit">Search</button></form>
      <div className="table-wrap">
        <table className="fares small">
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Joined</th><th scope="col">Paid bookings</th><th scope="col">Saved passengers</th><th scope="col">Role</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.name}<br /><span className="note">{u.phone}</span></td>
                <td><Email value={u.email} /></td>
                <td>{u.created_at.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}</td>
                <td className="num">{u.bookings}</td>
                <td className="num">{u.passengers}</td>
                <td>{u.id === me.id ? 'admin (you)' : (
                  <ActionForm action={setRole} submit={u.role === 'admin' ? 'Remove admin' : 'Make admin'} quiet confirm={`${u.role === 'admin' ? 'Remove admin rights from' : 'Give admin rights to'} ${u.email}?`}>
                    <input type="hidden" name="id" value={u.id} /><input type="hidden" name="role" value={u.role === 'admin' ? 'customer' : 'admin'} />
                    <span className="note">{u.role}</span>
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
