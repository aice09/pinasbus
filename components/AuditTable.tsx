import { q } from '@/lib/db';

type Row = { id: number; at: Date; action: string; entity: string; entity_id: string; data: object; ip: string; actor: string | null; org: string | null };

/** Audit log, newest first. `orgId` limits it to one company. */
export async function AuditTable({ orgId, limit = 300 }: { orgId?: string; limit?: number }) {
  const rows = await q<Row>(
    `select a.id, a.at, a.action, a.entity, a.entity_id, a.data, a.ip, u.email actor, o.name org
       from audit_log a left join users u on u.id = a.actor_id left join organizations o on o.id = a.org_id
      where $1::uuid is null or a.org_id = $1 order by a.id desc limit $2`, [orgId ?? null, limit]);
  if (!rows.length) return <p className="note">Nothing recorded yet.</p>;
  return (
    <div className="table-wrap">
      <table className="fares small">
        <thead><tr><th scope="col">When</th><th scope="col">Who</th>{!orgId && <th scope="col">Company</th>}<th scope="col">Action</th><th scope="col">Details</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="num">{r.at.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
              <td>{r.actor ? r.actor.replace('@', ' @ ') : 'system'}{r.ip && <><br /><span className="note">{r.ip}</span></>}</td>
              {!orgId && <td>{r.org ?? 'Platform'}</td>}
              <td><span className="mono">{r.action}</span></td>
              <td className="note">{r.entity} {r.entity_id.slice(0, 8)} {Object.keys(r.data).length ? JSON.stringify(r.data).slice(0, 160) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
