import Link from 'next/link';
import { redirect } from 'next/navigation';
import { orgCtx, roleName } from '@/lib/tenancy';

export const dynamic = 'force-dynamic';

export default async function ShipLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await orgCtx(slug);
  if (c.org.kind !== 'shipping_operator') redirect(`/ops/${slug}`);
  return (
    <main className="dash wide">
      <aside className="side">
        <p className="side-who"><strong>{c.org.name}</strong><span>{roleName(c.role)}</span></p>
        <nav aria-label="Shipping company">
          <Link href={`/ship/${slug}`}>Sailings and manifests</Link>
          {c.can('users.manage') && <Link href={`/ship/${slug}/staff`}>Staff and roles</Link>}
          <Link href="/account">My account</Link>
        </nav>
      </aside>
      <div className="dash-body">{children}</div>
    </main>
  );
}
