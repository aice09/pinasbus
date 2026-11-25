import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { bookingsForUser } from '@/lib/bookings';
import { manilaNow } from '@/lib/catalog';
import { q } from '@/lib/db';
import type { Shipment } from '@/lib/padala';
import { roleName } from '@/lib/tenancy';
import { orgNames } from '@/lib/orgs';
import { BookingList, ShipmentList } from '@/components/Lists';
import { Avatar } from '@/components/Avatar';

export const metadata: Metadata = { title: 'Your account' };

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const u = await requireUser();
  const { denied } = await searchParams;
  const [bookings, orgs, shipments, [{ n: saved }]] = await Promise.all([
    bookingsForUser(u.id), orgNames(),
    q<Shipment>(`select * from shipments where user_id = $1 and status not in ('claimed','cancelled') order by created_at desc limit 5`, [u.id]),
    q<{ n: number }>('select count(*)::int n from passengers where user_id = $1', [u.id]),
  ]);
  const today = manilaNow().date;
  const upcoming = bookings.filter((b) => b.travel_date >= today && ['paid', 'pending'].includes(b.status)).reverse();
  const lastRoutes = [...new Map(bookings.filter((b) => b.status === 'paid').map((b) => [`${b.pickup}|${b.dropoff}`, b])).values()].slice(0, 3);
  const work = u.memberships.filter((m) => m.org_kind === 'bus_operator');

  return (
    <>
      <section className="profile" aria-labelledby="hello">
        <Avatar style={u.avatar_style} seed={u.avatar_seed} name={u.name} size={84} />
        <div>
          <h1 id="hello">Hello, {u.name.split(' ')[0]}</h1>
          <p>{u.bio || <Link href="/account/settings">Add a line about yourself</Link>}</p>
          <p className="profile-facts">{bookings.filter((b) => b.status === 'paid').length} trips booked, member since {new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(u.created_at)}</p>
        </div>
        <Link className="btn quiet small" href="/account/settings">Edit profile</Link>
      </section>
      {denied && <p className="error" role="alert">You don&apos;t have access to that page.</p>}
      {u.must_change_password && <p className="warnbox">This is a demo account with a shared password. <Link href="/account/settings">Change your password</Link> before using it.</p>}
      {(work.length > 0 || u.platform_role === 'platform_admin') && (
        <section className="section tight" id="work" aria-labelledby="work-h">
          <h2 id="work-h">Your work</h2>
          <div className="quick">
            {u.platform_role === 'platform_admin' && <Link className="quick-route" href="/platform"><strong>PINASBUS platform</strong><span>Platform administrator</span></Link>}
            {work.map((m) => <Link key={m.org_id} className="quick-route" href={`/ops/${m.org_slug}`}><strong>{m.org_name}</strong><span>{roleName(m.role)}</span></Link>)}
          </div>
        </section>
      )}
      {lastRoutes.length > 0 && (
        <section className="section tight" aria-labelledby="again-h">
          <h2 id="again-h">Book a route again</h2>
          <div className="quick">
            {lastRoutes.map((b) => (
              <Link key={b.id} className="quick-route" href={`/trips?${new URLSearchParams({ from: b.pickup, to: b.dropoff })}`}><strong>{b.pickup} → {b.dropoff}</strong><span>Choose a new date</span></Link>
            ))}
          </div>
        </section>
      )}
      <section className="section tight" aria-labelledby="up-h"><h2 id="up-h">Upcoming trips</h2><BookingList items={upcoming} orgs={orgs} /></section>
      <section className="section tight" aria-labelledby="pd-h"><h2 id="pd-h">Padala on the way</h2><ShipmentList items={shipments} /></section>
      <p className="note">{saved ? `${saved} saved passenger${saved === 1 ? '' : 's'}. ` : 'No saved passengers yet. '}<Link href="/account/passengers">Manage passengers</Link></p>
    </>
  );
}
