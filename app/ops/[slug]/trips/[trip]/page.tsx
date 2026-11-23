import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { checkIn, sellTicket } from '@/app/actions/ops';
import type { Booking } from '@/lib/bookings';
import { clock, longDay, peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import { PASSENGER_KINDS, SEAT_KINDS, seatName } from '@/lib/layouts';
import { canSeeTrip } from '@/lib/rbac';
import { PASSENGER_CATEGORIES } from '@/lib/seatpolicy';
import { orgCtx } from '@/lib/tenancy';
import { availability, tripById } from '@/lib/trips';
import { ActionForm } from '@/components/ActionForm';
import { Itinerary } from '@/components/Itinerary';
import { OrgField } from '@/components/OrgField';
import { ShareLocation } from '@/components/ShareLocation';
import QRCode from 'qrcode';
import { bookFerry } from '@/app/actions/ferry';
import { candidateSailings, LINK_STATUSES, linksForTrip } from '@/lib/ferry';

export const metadata: Metadata = { title: 'Trip manifest' };

export default async function Manifest({ params }: { params: Promise<{ slug: string; trip: string }> }) {
  const { slug, trip: tripId } = await params;
  const c = await orgCtx(slug);
  const t = await tripById(tripId);
  if (!t || t.org_id !== c.org.id || !canSeeTrip(c.role, c.user.id, t)) notFound();
  const { taken, released } = await availability(t);
  const bookings = c.can('bookings.view') || c.can('bookings.checkin')
    ? await q<Booking>(`select * from bookings where trip_uuid = $1 and status in ('paid', 'pending') order by pickup, ref`, [t.id]) : [];
  // Regular seats first, so a plain cash sale doesn't default to a priority seat.
  const free = t.seats.filter((s) => PASSENGER_KINDS.includes(s.kind) && !taken.includes(s.id)).sort((a, b) => Number(a.kind !== 'regular' && !released.includes(a.id)) - Number(b.kind !== 'regular' && !released.includes(b.id)));
  const sell = c.can('bookings.sell') && !['departed', 'arrived', 'cancelled'].includes(t.status);
  const checkin = c.can('bookings.checkin');
  const links = await linksForTrip(t.id);
  const sailings = t.mode === 'road_ferry' && c.can('ferry.link') ? await candidateSailings(t) : [];
  const base = process.env.PUBLIC_BASE_URL ?? 'https://pinasbus.phlopentech.org';
  const qrs = Object.fromEntries(await Promise.all(links.map(async (l) => [l.id, await QRCode.toDataURL(`${base}/ferry/scan?token=${l.qr_token}`, { margin: 1, width: 150 })])));

  return (
    <>
      <p className="note"><Link href={`/ops/${slug}/trips?date=${t.service_date}`}>Back to trips</Link></p>
      <h1 className="page-h">{clock(new Date(t.departs_at))} {t.route_name}</h1>
      <p className="meta"><span className="chip">{t.class_name}</span><span className="chip plain">{t.status}</span> {longDay(t.service_date)}. Trip {t.code}. Bus {t.bus_code ?? 'unassigned'}{t.plate ? ` (${t.plate})` : ''}.</p>
      <p className="meta"><Link className="btn quiet small" href={`/track/${t.id}`}>Live map</Link>{c.can('baggage.manage') && <Link className="btn quiet small" href={`/ops/${slug}/baggage?trip=${t.id}&date=${t.service_date}`}>Baggage</Link>}</p>
      {c.can('tracking.report') && (t.driver_id === c.user.id || t.conductor_id === c.user.id) && ['boarding', 'departed'].includes(t.status) && <ShareLocation tripId={t.id} />}
      <div className="stats">
        <div className="stat"><span>Seats sold or held</span><strong>{taken.length}</strong></div>
        <div className="stat"><span>Seats free</span><strong>{free.length}</strong></div>
        <div className="stat"><span>Checked in</span><strong>{bookings.reduce((a, b) => a + b.checked_in.length, 0)}</strong></div>
        <div className="stat"><span>Priority seats released</span><strong>{released.length}</strong></div>
      </div>

      {bookings.length > 0 && (
        <section className="section tight" aria-labelledby="pax-h">
          <h2 id="pax-h">Passenger manifest</h2>
          <div className="table-wrap">
            <table className="fares small">
              <thead><tr><th scope="col">Seat</th><th scope="col">Passenger</th><th scope="col">Type and ID to check</th><th scope="col">From → to</th><th scope="col">Ticket</th><th scope="col">Boarding</th></tr></thead>
              <tbody>
                {bookings.flatMap((b) => b.seats.map((s) => {
                  const p = b.passengers.find((x) => x.seat === s);
                  const isIn = b.checked_in.includes(s);
                  return (
                    <tr key={b.id + s}>
                      <td>{seatName(s)}</td>
                      <td>{p?.name ?? b.name}</td>
                      <td>{PASSENGER_CATEGORIES[p?.category ?? 'regular']}{p?.id_type ? `: ${p.id_type} ending ${p.id_last4}` : ''}</td>
                      <td>{b.pickup} → {b.dropoff}</td>
                      <td><span className="mono">{b.ref}</span> <span className="note">{b.channel}{b.status === 'pending' ? ', unpaid hold' : ''}</span></td>
                      <td>{isIn ? <span className="status paid">Checked in</span> : checkin && b.status === 'paid' ? (
                        <ActionForm action={checkIn} submit="Check in" quiet><OrgField slug={slug} /><input type="hidden" name="id" value={b.id} /><input type="hidden" name="seat" value={s} /></ActionForm>
                      ) : null}</td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {sell && (
        <section className="panel" aria-labelledby="sell-h">
          <h2 id="sell-h">Sell at the terminal</h2>
          <p className="note">Cash sale with no online fee. Priority seats go only to eligible passengers until released. Check discount IDs before selling.</p>
          <ActionForm action={sellTicket} submit="Sell ticket" reset>
            <OrgField slug={slug} /><input type="hidden" name="trip" value={t.id} />
            <div className="row4">
              <label className="field">From<select name="pickup">{t.stops.filter((s) => s.boarding).map((s) => <option key={s.name}>{s.name}</option>)}</select></label>
              <label className="field">To<select name="dropoff" defaultValue={t.stops.at(-1)!.name}>{t.stops.filter((s) => s.alighting).map((s) => <option key={s.name}>{s.name}</option>)}</select></label>
              <label className="field">Seat<select name="seat" required>{free.map((s) => <option key={s.id} value={s.id}>{seatName(s.id)}{s.kind !== 'regular' && !released.includes(s.id) ? ` (${SEAT_KINDS[s.kind]})` : ''}</option>)}</select></label>
              <label className="field">Passenger type<select name="category">{Object.entries(PASSENGER_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            </div>
            <div className="row4">
              <label className="field">Passenger name<input name="name" required maxLength={80} /></label>
              <label className="field">Mobile (optional)<input name="phone" maxLength={20} /></label>
              <label className="field">Discount ID type<input name="id_type" maxLength={40} placeholder="OSCA ID, PWD ID" /></label>
              <label className="field">ID last 4<input name="id_last4" maxLength={4} /></label>
            </div>
          </ActionForm>
        </section>
      )}

      {t.mode === 'road_ferry' && (
        <section className="panel" aria-labelledby="fr-h">
          <h2 id="fr-h">Ferry connection</h2>
          {links.map((l) => (
            <div key={l.id} className="ferry-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrs[l.id]} alt={`QR for ferry reservation ${l.reference}`} width={150} height={150} />
              <div><p><strong className="mono">{l.reference}</strong> {l.vessel}, {l.from_port} → {l.to_port}, sails {clock(l.departs_at)}</p>
                <p><span className="status pending">{LINK_STATUSES[l.status]}</span></p>
                <p className="note">Crew: scan this at the port (or open it) to record approaching, waiting and back on the road. Port staff scan it to board, load and unload.</p></div>
            </div>
          ))}
          {links.length === 0 && c.can('ferry.link') && (sailings.length ? (
            <ActionForm action={bookFerry} submit="Book ferry" className="inline-form">
              <OrgField slug={slug} /><input type="hidden" name="trip" value={t.id} />
              <label className="field grow">Sailing<select name="sailing">{sailings.map((s) => <option key={s.id} value={s.id} disabled={s.free < 1}>{clock(s.departs_at)} {s.from_port} → {s.to_port}, {s.vessel} ({s.operator}), {s.free} vehicle slots</option>)}</select></label>
            </ActionForm>
          ) : <p className="note">No sailings with space within 36 hours from this trip&apos;s ferry port.</p>)}
        </section>
      )}

      <section className="section tight" aria-labelledby="it-h"><h2 id="it-h">Planned route</h2><Itinerary trip={t} /></section>
      {bookings.length > 0 && <p className="note">Collected for this trip: {peso(bookings.filter((b) => b.status === 'paid').reduce((a, b) => a + b.total_centavos, 0))}.</p>}
    </>
  );
}
