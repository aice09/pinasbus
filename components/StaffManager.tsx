import { addStaff, setStaffRole } from '@/app/actions/ops';
import { q } from '@/lib/db';
import { PERMISSIONS, ROLES, rolesFor, type Role } from '@/lib/rbac';
import { orgCtx } from '@/lib/tenancy';
import { ActionForm } from '@/components/ActionForm';
import { Email } from '@/components/Email';
import { OrgField } from '@/components/OrgField';

/** Staff list, role changes and the permission matrix; shared by bus, shipping and card-issuer workspaces. */
export async function StaffManager({ slug }: { slug: string }) {
  const c = await orgCtx(slug, 'users.manage');
  const kindRoles = rolesFor(c.org.kind);
  const staff = await q<{ id: string; name: string; email: string; role: Role; created_at: Date; last_seen: Date | null }>(
    `select u.id, u.name, u.email, m.role, m.created_at, (select max(s.created_at) from sessions s where s.user_id = u.id) last_seen
       from memberships m join users u on u.id = m.user_id where m.org_id = $1 order by m.role, u.name`, [c.org.id]);
  const roleOptions = kindRoles.map((k) => <option key={k} value={k}>{ROLES[k].name}</option>);
  const usedPerms = Object.entries(PERMISSIONS).filter(([p]) => kindRoles.some((r) => (ROLES[r].perms as string[]).includes(p)));
  return (
    <>
      <h1 className="page-h">Staff and roles</h1>
      <p className="lead">Add people and give each one a role. Roles are fixed by PINASBUS, so each role means the same in every company; see the table below.</p>
      <section className="panel" aria-labelledby="add-h">
        <h2 id="add-h">Add a staff member</h2>
        <ActionForm action={addStaff} submit="Add staff member" reset>
          <OrgField slug={slug} />
          <div className="row3">
            <label className="field">Full name<input name="name" required maxLength={80} /></label>
            <label className="field">Email<input name="email" type="email" required maxLength={120} /></label>
            <label className="field">Role<select name="role" defaultValue={kindRoles[1]}>{roleOptions}</select></label>
          </div>
          <p className="note">New people get a one-time password shown here once; they must change it when they first sign in.</p>
        </ActionForm>
      </section>
      <div className="table-wrap">
        <table className="fares small">
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Last sign-in</th><th scope="col">Role</th></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td><Email value={s.email} /></td>
                <td className="note">{s.last_seen ? s.last_seen.toLocaleDateString('en-PH') : 'never'}</td>
                <td>{s.id === c.user.id ? ROLES[s.role].name + ' (you)' : (
                  <ActionForm action={setStaffRole} submit="Apply" className="inline-form" quiet>
                    <OrgField slug={slug} /><input type="hidden" name="id" value={s.id} />
                    <label className="field"><span className="sr-only">Role for {s.name}</span><select name="role" defaultValue={s.role}>{roleOptions}<option value="remove">Remove from company</option></select></label>
                  </ActionForm>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="section tight" aria-labelledby="perm-h">
        <h2 id="perm-h">What each role can do</h2>
        <div className="table-wrap">
          <table className="fares small matrix">
            <thead><tr><th scope="col">Permission</th>{kindRoles.map((r) => <th key={r} scope="col"><span>{ROLES[r].name}</span></th>)}</tr></thead>
            <tbody>
              {usedPerms.map(([p, label]) => (
                <tr key={p}><th scope="row">{label}</th>{kindRoles.map((r) => <td key={r} className="num">{(ROLES[r].perms as string[]).includes(p) ? '✓' : ''}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
