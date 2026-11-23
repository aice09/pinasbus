import Link from 'next/link';
import type { Metadata } from 'next';
import { addDays, BOOKING_WINDOW_DAYS, BUS_CLASSES, DROPOFF_STATIONS, isBookable, manilaNow, matchTrips, peso, PICKUP_STATIONS, time12 } from '@/lib/catalog';
import { takenCounts } from '@/lib/bookings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Trips' };

type SP = Promise<{ from?: string; to?: string; date?: string }>;

const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', ...opts });

export default async function Trips({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { date: today } = manilaNow();
  const maxDate = addDays(today, BOOKING_WINDOW_DAYS);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date >= today && sp.date <= maxDate ? sp.date : today;
  const from = sp.from && PICKUP_STATIONS.includes(sp.from) ? sp.from : '';
  const to = sp.to && DROPOFF_STATIONS.includes(sp.to) ? sp.to : '';

  const pickupTime = (t: ReturnType<typeof matchTrips>[number]) => (t.pickups.find((p) => p.station === from) ?? t.pickups[0]);
  const trips = matchTrips(from, to).sort((a, b) => pickupTime(a).time.localeCompare(pickupTime(b).time));
  const taken = await takenCounts(trips.map((t) => t.id), date);

  const q = (d: string) => `/trips?${new URLSearchParams({ ...(from && { from }), ...(to && { to }), date: d })}`;
  const start = date > today ? addDays(date, -2) < today ? today : addDays(date, -2) : today;
  const days = Array.from({ length: 9 }, (_, i) => addDays(start, i)).filter((d) => d <= maxDate);

  return (
    <main>
      <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2.4rem)', marginTop: 8 }}>{from || 'Any terminal'} to {to || 'anywhere'}</h1>

      <form className="filters" action="/trips" method="get">
        <label className="field">From
          <select name="from" defaultValue={from}><option value="">Any terminal</option>{PICKUP_STATIONS.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <label className="field">To
          <select name="to" defaultValue={to}><option value="">Anywhere</option>{DROPOFF_STATIONS.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <input type="hidden" name="date" value={date} />
        <button className="btn quiet" type="submit">Update</button>
      </form>

      <nav className="dates" aria-label="Travel date">
        {days.map((d) => (
          <Link key={d} href={q(d)} aria-current={d === date ? 'date' : undefined}>
            <small>{d === today ? 'Today' : fmtDay(d, { weekday: 'short' })}</small>
            <strong>{fmtDay(d, { day: 'numeric' })}</strong>
            <small>{fmtDay(d, { month: 'short' })}</small>
          </Link>
        ))}
      </nav>

      {trips.length === 0 ? (
        <div className="empty">
          <h2>No direct trips on this route</h2>
          <p>Try a nearby terminal, or <Link href={`/trips?date=${date}`}>see every trip on {fmtDay(date, { month: 'long', day: 'numeric' })}</Link>.</p>
        </div>
      ) : (
        <ul className="trips">
          {trips.map((t) => {
            const c = BUS_CLASSES[t.busClass];
            const left = c.seats - (taken.get(t.id) ?? 0);
            const open = isBookable(t, date) && left > 0;
            const p = pickupTime(t);
            const href = `/trips/${t.id}?${new URLSearchParams({ date, from: p.station, ...(to && { to }) })}`;
            return (
              <li key={t.id} className={'trip' + (open ? '' : ' closed')}>
                <div className="trip-time">{time12(p.time)}<small>{p.station}</small></div>
                <div className="trip-main">
                  <h3>{t.pickups.map((x) => x.station).join(', ')} to {t.dropoffs.join(', ')}</h3>
                  <p className="meta"><span className="chip">{c.name}</span>Trip {t.code}, {c.amenities.join(', ').toLowerCase()}</p>
                </div>
                <div className="trip-buy">
                  <span className="fare">{peso(t.fare * 100)}</span>
                  <span className={'left' + (left <= 5 ? ' low' : '')}>{left > 0 ? `${left} of ${c.seats} seats left` : 'Full'}</span>
                  {open ? <Link className="btn" href={href}>Choose seats</Link> : <span className="note">{left > 0 ? 'Booking closed' : 'Sold out'}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
