import Link from 'next/link';
import { Email } from '@/components/Email';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireAdmin();
  return (
    <main className="dash wide">
      <aside className="side">
        <p className="side-who"><strong>Admin</strong><span><Email value={u.email} /></span></p>
        <nav aria-label="Admin">
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/bookings">Bookings</Link>
          <Link href="/admin/trips">Routes and trips</Link>
          <Link href="/admin/padala">Padala</Link>
          <Link href="/admin/users">Users</Link>
          <Link href="/admin/messages">Messages</Link>
          <Link href="/account">My account</Link>
        </nav>
      </aside>
      <div className="dash-body">{children}</div>
    </main>
  );
}
