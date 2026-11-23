import type { Metadata } from 'next';
import { markHandled } from '@/app/actions/admin';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Messages' };

export default async function Messages() {
  await requireAdmin();
  const rows = await q<{ id: number; name: string; email: string; subject: string; body: string; handled: boolean; created_at: Date }>(
    'select * from messages order by handled, created_at desc limit 200');
  return (
    <>
      <h1 className="page-h">Messages</h1>
      <p className="lead">From the contact form. Reply by email, then mark the message done.</p>
      <ul className="cards">
        {rows.map((m) => (
          <li key={m.id} className={'card col' + (m.handled ? ' off' : '')}>
            <h3>{m.subject}</h3>
            <p className="meta">{m.name}, <a href={`mailto:${m.email}?subject=${encodeURIComponent('Re: ' + m.subject)}`}>{m.email}</a>, {m.created_at.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
            <p className="pre">{m.body}</p>
            <ActionForm action={markHandled} submit={m.handled ? 'Mark as open' : 'Mark as done'} quiet><input type="hidden" name="id" value={m.id} /></ActionForm>
          </li>
        ))}
        {rows.length === 0 && <li className="note">No messages yet.</li>}
      </ul>
    </>
  );
}
