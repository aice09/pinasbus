import Link from 'next/link';
import type { Metadata } from 'next';
import { markNotificationsRead } from '@/app/actions/account';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Notifications' };

export default async function Notifications() {
  const u = await requireUser('/account/notifications');
  const rows = await q<{ id: number; title: string; body: string; link: string; read_at: Date | null; created_at: Date }>(
    'select id, title, body, link, read_at, created_at from notifications where user_id = $1 order by id desc limit 100', [u.id]);
  return (
    <>
      <h1 className="page-h">Notifications</h1>
      <p className="lead">Bookings, payments, trip changes, baggage, ferries and card loads. Important ones are also emailed to you.</p>
      {rows.some((r) => !r.read_at) && <ActionForm action={markNotificationsRead} submit="Mark all as read" quiet><span /></ActionForm>}
      <ul className="cards">
        {rows.map((n) => (
          <li key={n.id} className={'card col' + (n.read_at ? ' off' : '')}>
            <h3>{n.link ? <Link href={n.link}>{n.title}</Link> : n.title}</h3>
            {n.body && <p>{n.body}</p>}
            <p className="note">{n.created_at.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
          </li>
        ))}
        {rows.length === 0 && <li className="note">Nothing yet.</li>}
      </ul>
    </>
  );
}
