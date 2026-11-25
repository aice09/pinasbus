import Link from 'next/link';
import { Email } from '@/components/Email';
import { signOut } from '@/app/actions/auth';
import { requireUser } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  return (
    <main className="dash">
      <aside className="side">
        <p className="side-who"><Avatar style={u.avatar_style} seed={u.avatar_seed} name={u.name} size={44} /><strong>{u.name}</strong><span><Email value={u.email} /></span></p>
        <nav aria-label="Your account">
          <Link href="/account">Overview</Link>
          <Link href="/account/trips">Trips</Link>
          <Link href="/account/baggage">Baggage</Link>
          <Link href="/account/padala">Padala</Link>
          <Link href="/account/passengers">Saved passengers</Link>
          <Link href="/account/notifications">Notifications</Link>
          <Link href="/account/cards">Transport cards</Link>
          <Link href="/account/settings">Settings</Link>
          <Link href="/account/security">Security</Link>
          {u.platform_role === 'platform_admin' && <Link href="/platform">Platform</Link>}
          {u.memberships.filter((m) => m.org_kind === 'bus_operator').map((m) => <Link key={m.org_id} href={`/ops/${m.org_slug}`}>{m.org_name.split(' (')[0]}</Link>)}
        </nav>
        <form action={signOut}><button className="linkbtn" type="submit">Sign out</button></form>
      </aside>
      <div className="dash-body">{children}</div>
    </main>
  );
}
