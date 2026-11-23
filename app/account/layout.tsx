import Link from 'next/link';
import { Email } from '@/components/Email';
import { signOut } from '@/app/actions/auth';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  return (
    <main className="dash">
      <aside className="side">
        <p className="side-who"><strong>{u.name}</strong><span><Email value={u.email} /></span></p>
        <nav aria-label="Your account">
          <Link href="/account">Overview</Link>
          <Link href="/account/trips">Trips</Link>
          <Link href="/account/padala">Padala</Link>
          <Link href="/account/passengers">Saved passengers</Link>
          <Link href="/account/settings">Settings</Link>
          {u.role === 'admin' && <Link href="/admin">Admin dashboard</Link>}
        </nav>
        <form action={signOut}><button className="linkbtn" type="submit">Sign out</button></form>
      </aside>
      <div className="dash-body">{children}</div>
    </main>
  );
}
