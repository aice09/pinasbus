import Link from 'next/link';
import type { Metadata } from 'next';
import { updateBag } from '@/app/actions/ops';
import { BAG_FLOW, BAG_STATUSES, BAG_CATEGORIES, bagByTag, bagEvents, type Bag } from '@/lib/baggage';
import { clock, isDate, manilaNow, peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import { canSeeTrip } from '@/lib/rbac';
import { orgCtx } from '@/lib/tenancy';
import { tripsOn } from '@/lib/trips';
import { ActionForm } from '@/components/ActionForm';
import { BagLookup } from '@/components/BagLookup';
import { OrgField } from '@/components/OrgField';

export const metadata: Metadata = { title: 'Baggage' };

export default async function Baggage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tag?: string; trip?: string; date?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const c = await orgCtx(slug, 'baggage.manage');
  const bag = sp.tag ? await bagByTag(sp.tag) : null;
  const mine = bag && bag.org_id === c.org.id && canSeeTrip(c.role, c.user.id, bag);
  const events = mine ? await bagEvents(bag.id) : [];
  const date = isDate(sp.date) ? sp.date : manilaNow().date;
  const trips = (await tripsOn(date, c.org.id)).filter((t) => canSeeTrip(c.role, c.user.id, t));
  const tripId = sp.trip && trips.some((t) => t.id === sp.trip) ? sp.trip : null;
  const list = tripId ? await q<Bag & { ref: string }>('select g.*, b.ref from bags g join bookings b on b.id = g.booking_id where g.trip_id = $1 order by g.created_at', [tripId]) : [];
  const next = mine ? BAG_FLOW[Math.min(BAG_FLOW.indexOf(bag.status as (typeof BAG_FLOW)[number]) + 1, BAG_FLOW.length - 1)] ?? 'checked_in' : 'checked_in';

  return (
    <>
      <h1 className="page-h">Baggage</h1>
      <p className="lead">Scan a bag tag or type it, then record the next step. Every step notes who, when and where, and the passenger sees it on their ticket.</p>
      <section className="panel"><BagLookup slug={slug} initial={sp.tag ?? ''} /></section>
      {sp.tag && !mine && <p className="error" role="alert">No bag {sp.tag.toUpperCase()} on {c.can('trips.view') ? 'this company’s trips' : 'your trips'}.</p>}
      {mine && (
        <section className="panel" aria-labelledby="bag-h">
          <h2 id="bag-h"><span className="mono">{bag.tag}</span> {bag.description}</h2>
          <p className="meta"><span className="chip">{BAG_STATUSES[bag.status]}</span><span className="chip plain">{BAG_CATEGORIES[bag.category]}</span>
            {bag.weight_kg} kg, {bag.passenger}, ticket <Link href={`/booking/${bag.ref}`}>{bag.ref}</Link>, {bag.pickup} → {bag.dropoff}.
            {bag.fee_centavos > 0 && <span className={'chip ' + (bag.fee_paid ? 'yes' : 'no')}>Excess fee {peso(bag.fee_centavos)} {bag.fee_paid ? 'paid' : 'to collect'}</span>}</p>
          <ActionForm action={updateBag} submit="Record step" className="inline-form">
            <OrgField slug={slug} /><input type="hidden" name="tag" value={bag.tag} />
            <label className="field">Step<select name="status" defaultValue={next}>{Object.entries(BAG_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="field">Where<input name="location" maxLength={80} placeholder={bag.pickup} /></label>
            <label className="field grow">Note<input name="note" maxLength={200} placeholder="Hold bay 2, left side" /></label>
            {bag.fee_centavos > 0 && !bag.fee_paid && <label className="check"><input type="checkbox" name="fee_paid" /> Fee collected</label>}
          </ActionForm>
          <p><Link className="btn quiet small" href={`/ops/${slug}/baggage/tag/${bag.tag}`}>Print tag</Link></p>
          <ul className="timeline">{events.map((e, i) => <li key={i}><time>{e.created_at.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time> {BAG_STATUSES[e.status]}{e.location && ` at ${e.location}`}{e.actor && `, ${e.actor}`}{e.note && `. ${e.note}`}</li>)}</ul>
        </section>
      )}
      <section className="section tight" aria-labelledby="trip-h">
        <h2 id="trip-h">Bags by trip</h2>
        <form className="inline-form" method="get">
          <label className="field">Date<input type="date" name="date" defaultValue={date} /></label>
          <label className="field grow">Trip<select name="trip" defaultValue={tripId ?? ''}><option value="">Choose a trip</option>{trips.map((t) => <option key={t.id} value={t.id}>{clock(new Date(t.departs_at))} {t.route_name} ({t.code})</option>)}</select></label>
          <button className="btn quiet" type="submit">Show</button>
        </form>
        {tripId && (
          <div className="table-wrap">
            <table className="fares small">
              <thead><tr><th scope="col">Tag</th><th scope="col">Passenger</th><th scope="col">Bag</th><th scope="col">Weight</th><th scope="col">Fee</th><th scope="col">Status</th></tr></thead>
              <tbody>{list.map((g) => (
                <tr key={g.id}><td><Link className="mono" href={`/ops/${slug}/baggage?tag=${g.tag}&trip=${tripId}&date=${date}`}>{g.tag}</Link></td><td>{g.passenger}<br /><span className="note">{g.ref}</span></td>
                  <td>{g.description} <span className="note">{BAG_CATEGORIES[g.category]}</span></td><td className="num">{g.weight_kg} kg</td>
                  <td className="num">{g.fee_centavos ? `${peso(g.fee_centavos)} ${g.fee_paid ? 'paid' : 'due'}` : 'free'}</td><td>{BAG_STATUSES[g.status]}</td></tr>
              ))}</tbody>
            </table>
            {list.length === 0 && <p className="note">No bags registered on this trip.</p>}
            {list.length > 0 && <p className="note">{list.length} bags, {list.reduce((a, g) => a + Number(g.weight_kg), 0).toFixed(1)} kg in the hold.</p>}
          </div>
        )}
      </section>
    </>
  );
}
