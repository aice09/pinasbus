import Link from 'next/link';
import type { Metadata } from 'next';
import { addDays, bookable, BOOKING_WINDOW_DAYS, clock, hasCR, isDate, manilaNow, peso } from '@/lib/catalog';
import { PASSENGER_KINDS } from '@/lib/layouts';
import { legOf, network, segmentFare, stopTime, takenOn, tripsOn } from '@/lib/trips';
import { RouteSelects } from '@/components/RouteSelects';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Trips' };

const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', ...opts });

export default async function Trips({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; date?: string }> }) {
  const sp = await searchParams;
  const pairs = await network();
  const { date: today } = manilaNow();
  const maxDate = addDays(today, BOOKING_WINDOW_DAYS);
  const date = isDate(sp.date) && sp.date >= today && sp.date <= maxDate ? sp.date : today;
  const from = sp.from && pairs[sp.from] ? sp.from : '';
  const to = sp.to && Object.values(pairs).some((l) => l.includes(sp.to!)) ? sp.to : '';

  const all = await tripsOn(date);
  const found = all.map((t) => ({ t, leg: legOf(t, from || undefined, to || undefined) })).filter((x) => x.leg && x.t.status !== 'cancelled')
    .map(({ t, leg }) => ({ t, leg: leg!, boards: stopTime(t, leg!.i) ?? new Date(t.departs_at) }))
    .sort((a, b) => a.boards.getTime() - b.boards.getTime());
  const taken = await takenOn(found.map((x) => x.t.id));

  const href = (d: string) => `/trips?${new URLSearchParams({ ...(from && { from }), ...(to && { to }), date: d })}`;
  const start = date > today ? (addDays(date, -2) < today ? today : addDays(date, -2)) : today;
  const days = Array.from({ length: 9 }, (_, i) => addDays(start, i)).filter((d) => d <= maxDate);

  return (
    <main>
      <h1 className="page-h">{from || 'Any terminal'} to {to || 'anywhere'}</h1>
      <form className="filters" action="/trips" method="get">
        <RouteSelects pairs={pairs} from={from} to={to} />
        <input type="hidden" name="date" value={date} />
        <button className="btn quiet" type="submit">Update</button>
      </form>
      <nav className="dates" aria-label="Travel date">
        {days.map((d) => (
          <Link key={d} href={href(d)} aria-current={d === date ? 'date' : undefined}>
            <small>{d === today ? 'Today' : fmtDay(d, { weekday: 'short' })}</small><strong>{fmtDay(d, { day: 'numeric' })}</strong><small>{fmtDay(d, { month: 'short' })}</small>
          </Link>
        ))}
      </nav>
      {found.length === 0 ? (
        <div className="empty"><h2>No trips on this route that day</h2><p>Try another date or a nearby terminal, or <Link href={`/trips?date=${date}`}>see every trip that day</Link>.</p></div>
      ) : (
        <ul className="trips">
          {found.map(({ t, leg, boards }) => {
            const seats = t.seats.filter((s) => PASSENGER_KINDS.includes(s.kind)).length;
            const left = seats - (taken.get(t.id) ?? 0);
            const open = bookable(boards) && left > 0 && t.status === 'scheduled';
            const indicative = t.sources.some((s) => !s.verified);
            const sleeper = t.seats.some((s) => s.berth);
            return (
              <li key={t.id} className={'trip' + (open ? '' : ' closed')}>
                <div className="trip-time">{clock(boards)}<small>{t.stops[leg.i].name}</small></div>
                <div className="trip-main">
                  <p className="trip-org">{t.org_name}</p>
                  <h3>{t.stops[leg.i].name} to {t.stops[leg.j].name}</h3>
                  <p className="meta">
                    <span className="chip">{t.class_name}</span>
                    <span className={'chip ' + (hasCR(t.amenities) ? 'yes' : 'no')}>{hasCR(t.amenities) ? 'With CR' : 'No CR'}</span>
                    {sleeper && <span className="chip">Upper and lower berths</span>}
                    {t.mode === 'road_ferry' && <span className="chip plain">Includes a ferry</span>}
                    {indicative && <span className="chip no">Indicative time and fare</span>}
                    Trip {t.code}
                  </p>
                </div>
                <div className="trip-buy">
                  <span className="fare">{peso(segmentFare(t, leg.i, leg.j))}</span>
                  <span className={'left' + (left <= 5 ? ' low' : '')}>{left > 0 ? `${left} of ${seats} left` : 'Full'}</span>
                  {open ? <Link className="btn" href={`/trips/${t.id}?${new URLSearchParams({ from: t.stops[leg.i].name, to: t.stops[leg.j].name })}`}>Choose seats</Link>
                    : <span className="note">{left > 0 ? 'Booking closed' : 'Sold out'}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
