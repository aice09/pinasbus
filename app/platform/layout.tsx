import Link from 'next/link';
import { Email } from '@/components/Email';
import { requirePlatformAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const u = await requirePlatformAdmin();
  return (
    <main className="dash wide">
      <aside className="side">
        <p className="side-who"><strong>PINASBUS platform</strong><span><Email value={u.email} /></span></p>
        <nav aria-label="Platform">
          <Link href="/platform">Overview</Link>
          <Link href="/platform/orgs">Companies</Link>
          <Link href="/platform/categories">Transport categories</Link>
          <Link href="/platform/bookings">All bookings</Link>
          <Link href="/platform/padala">Padala</Link>
          <Link href="/platform/users">Users</Link>
          <Link href="/platform/messages">Messages</Link>
          <Link href="/platform/appearance">Appearance</Link>
          <Link href="/platform/audit">Audit log</Link>
          <Link href="/account">My account</Link>
        </nav>
      </aside>
      <div className="dash-body">{children}</div>
    </main>
  );
}
