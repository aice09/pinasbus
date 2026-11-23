'use client';
import { useState } from 'react';
import { RouteSelects } from './RouteSelects';

type Props = { pairs: Record<string, string[]>; today: string; maxDate: string; initial?: { from?: string; to?: string; date?: string } };

/** Search form whose choices are echoed live on the destination sign above it. */
export function SearchForm({ pairs, today, maxDate, initial }: Props) {
  const [route, setRoute] = useState({ from: initial?.from ?? '', to: initial?.to ?? '' });
  const [date, setDate] = useState(initial?.date ?? today);

  return (
    <>
      <div className="sign" role="img" aria-label={`Route: ${route.from || 'any terminal'} to ${route.to || 'anywhere'}`}>
        <div key={route.from + route.to} className="sign-route flip">
          <span>{route.from || 'Metro Manila'}</span>
          <span className="arrow" aria-hidden="true">→</span>
          <span>{route.to || 'Bicol'}</span>
        </div>
        <p className="sign-sub">Pick your seat on the bus itself, then pay with GCash, Maya or card.</p>
      </div>
      <form className="search" action="/trips" method="get">
        <RouteSelects pairs={pairs} from={route.from} to={route.to} onChange={(from, to) => setRoute({ from, to })} />
        <label className="field">Travel date
          <input type="date" name="date" value={date} min={today} max={maxDate} required onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn" type="submit">Find trips</button>
      </form>
    </>
  );
}
