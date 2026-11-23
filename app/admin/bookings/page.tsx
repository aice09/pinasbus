import Link from 'next/link';
import { Email } from '@/components/Email';
import type { Metadata } from 'next';
import { markRefunded } from '@/app/actions/admin';
import { requireAdmin } from '@/lib/auth';
import type { Booking } from '@/lib/bookings';
import { peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Bookings' };
const STATUSES = ['paid', 'pending', 'needs_refund', 'refunded', 'expired'];

export default async function Bookings({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; date?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status ?? '') ? sp.status! : '';
  const term = (sp.q ?? '').trim().slice(0, 80);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : '';
  const rows = await q<Booking>(
    `select * from bookings where ($1 = '' or status = $1) and ($2 = '' or travel_date = $2::date)
       and ($3 = '' or ref ilike '%' || $3 || '%' or name ilike '%' || $3 || '%' or email ilike '%' || $3 || '%' or phone like '%' || $3 || '%')
     order by created_at desc limit 200`, [status, date, term]);

  return (
    <>
      <h1 className="page-h">Bookings</h1>
      <form className="filters four" method="get">
        <label className="field">Search<input name="q" defaultValue={term} placeholder="Reference, name, email or phone" /></label>
        <label className="field">Travel date<input name="date" type="date" defaultValue={date} /></label>
        <label className="field">Status<select name="status" defaultValue={status}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></label>
        <button className="btn quiet" type="submit">Filter</button>
      </form>
      <p className="note">{rows.length === 200 ? 'Showing the latest 200. Narrow the filters to see older ones.' : `${rows.length} booking${rows.length === 1 ? '' : 's'}`}</p>
      <div className="table-wrap">
        <table className="fares small">
          <thead><tr><th scope="col">Reference</th><th scope="col">Travel</th><th scope="col">Route</th><th scope="col">Seats</th><th scope="col">Contact</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td><Link className="mono" href={`/booking/${b.ref}`}>{b.ref}</Link></td>
                <td>{b.travel_date}<br /><span className="note">{b.trip_id}</span></td>
                <td>{b.pickup} → {b.dropoff}</td>
                <td>{b.seats.join(', ')}</td>
                <td>{b.name}<br /><span className="note"><Email value={b.email} /><br />{b.phone}</span></td>
                <td className="num">{peso(b.total_centavos)}</td>
                <td><span className={`status ${b.status === 'refunded' ? 'expired' : b.status}`}>{b.status.replace('_', ' ')}</span></td>
                <td>{(b.status === 'needs_refund' || b.status === 'paid') && (
                  <ActionForm action={markRefunded} submit="Mark refunded" quiet confirm={`Mark ${b.ref} as refunded? Refund ${peso(b.total_centavos)} in the PayMongo dashboard first.`}>
                    <input type="hidden" name="id" value={b.id} />
                  </ActionForm>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
