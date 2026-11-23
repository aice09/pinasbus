import Link from 'next/link';
import { orgCtx, roleName } from '@/lib/tenancy';

export const dynamic = 'force-dynamic';

export default async function OpsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await orgCtx(slug);
  const base = `/ops/${slug}`;
  const nav: [string, string, boolean][] = [
    ['', 'Overview', true],
    ['/trips', c.can('trips.view') ? 'Trips and dispatch' : 'My trips', c.can('trips.view') || c.can('trips.view_assigned')],
    ['/bookings', 'Bookings', c.can('bookings.view')],
    ['/fleet', 'Fleet', c.can('fleet.view')],
    ['/layouts', 'Seat layouts', c.can('fleet.view')],
    ['/routes', 'Routes', c.can('routes.manage') || c.can('trips.view')],
    ['/schedules', 'Schedules', c.can('schedules.manage') || c.can('trips.view')],
    ['/staff', 'Staff and roles', c.can('users.manage')],
    ['/settings', 'Company settings', c.can('org.manage')],
    ['/audit', 'Audit log', c.can('audit.view')],
  ];
  return (
    <main className="dash wide">
      <aside className="side">
        <p className="side-who"><strong>{c.org.name}</strong><span>{roleName(c.role)}{c.platform && ' (platform, read-only)'}</span></p>
        {c.org.status !== 'active' && <p className="error">This company is {c.org.status}.</p>}
        <nav aria-label="Company">
          {nav.filter(([, , ok]) => ok).map(([href, label]) => <Link key={href} href={base + href}>{label}</Link>)}
          <Link href="/account">My account</Link>
        </nav>
      </aside>
      <div className="dash-body">{children}</div>
    </main>
  );
}
