import Link from 'next/link';
import type { Metadata } from 'next';
import { refundBooking } from '@/app/actions/ops';
import type { Booking } from '@/lib/bookings';
import { isDate, peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import { orgCtx } from '@/lib/tenancy';
import { ActionForm } from '@/components/ActionForm';
import { Email } from '@/components/Email';
import { OrgField } from '@/components/OrgField';

export const metadata: Metadata = { title: 'Bookings' };
const STATUSES = ['paid', 'pending', 'needs_refund', 'refunded', 'expired'];

export default async function Bookings({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string; q?: string; date?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const c = await orgCtx(slug, 'bookings.view');
  const status = STATUSES.includes(sp.status ?? '') ? sp.status! : '';
  const term = (sp.q ?? '').trim().slice(0, 80);
  const date = isDate(sp.date) ? sp.date : '';
  const rows = await q<Booking>(
    `select * from bookings where org_id = $1 and ($2 = '' or status = $2) and ($3 = '' or travel_date = $3::date)
       and ($4 = '' or ref ilike '%'||$4||'%' or name ilike '%'||$4||'%' or email ilike '%'||$4||'%' or phone like '%'||$4||'%')
     order by created_at desc limit 200`, [c.org.id, status, date, term]);
  return (
    <>
      <h1 className="page-h">Bookings</h1>
      <form className="filters four" method="get">
        <label className="field">Search<input name="q" defaultValue={term} placeholder="Reference, name, email or phone" /></label>
        <label className="field">Travel date<input name="date" type="date" defaultValue={date} /></label>
        <label className="field">Status<select name="status" defaultValue={status}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></label>
        <button className="btn quiet" type="submit">Filter</button>
      </form>
      <div className="table-wrap">
        <table className="fares small">
          <thead><tr><th scope="col">Reference</th><th scope="col">Travel</th><th scope="col">Segment</th><th scope="col">Seats</th><th scope="col">Contact</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td><Link className="mono" href={`/booking/${b.ref}`}>{b.ref}</Link><br /><span className="note">{b.channel}</span></td>
                <td>{b.travel_date}<br />{b.trip_uuid && <Link className="note" href={`/ops/${slug}/trips/${b.trip_uuid}`}>trip {b.trip_id}</Link>}</td>
                <td>{b.pickup} → {b.dropoff}</td>
                <td>{b.seats.join(', ')}</td>
                <td>{b.name}<br /><span className="note"><Email value={b.email} /><br />{b.phone}</span></td>
                <td className="num">{peso(b.total_centavos)}</td>
                <td><span className={`status ${b.status === 'refunded' ? 'expired' : b.status}`}>{b.status.replace('_', ' ')}</span></td>
                <td>{c.can('bookings.refund') && (b.status === 'needs_refund' || b.status === 'paid') && (
                  <ActionForm action={refundBooking} submit="Mark refunded" quiet confirm={`Mark ${b.ref} refunded? ${b.channel === 'online' ? 'Refund it in PayMongo first.' : 'Return the cash first.'}`}>
                    <OrgField slug={slug} /><input type="hidden" name="id" value={b.id} />
                  </ActionForm>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="note">No bookings match.</p>}
    </>
  );
}
