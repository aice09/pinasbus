'use client';
import { useState } from 'react';

type Props = { pickups: string[]; dropoffs: string[]; today: string; maxDate: string; initial?: { from?: string; to?: string; date?: string } };

/** Search form whose choices are echoed live on the destination sign above it. */
export function SearchForm({ pickups, dropoffs, today, maxDate, initial }: Props) {
  const [from, setFrom] = useState(initial?.from ?? 'EDSA Cubao');
  const [to, setTo] = useState(initial?.to ?? 'Naga CBD');
  const [date, setDate] = useState(initial?.date ?? today);
  const key = from + to;

  return (
    <>
      <div className="sign" role="img" aria-label={`Route: ${from || 'anywhere'} to ${to || 'anywhere'}`}>
        <div key={key} className="sign-route flip">
          <span>{from || 'Any terminal'}</span>
          <span className="arrow" aria-hidden="true">→</span>
          <span>{to || 'Bicol'}</span>
        </div>
        <p className="sign-sub">Pick your seat on the bus itself, then pay with GCash, Maya or card.</p>
      </div>
      <form className="search" action="/trips" method="get">
        <label className="field">From
          <select name="from" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Any terminal</option>
            {pickups.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">To
          <select name="to" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Anywhere</option>
            {dropoffs.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">Travel date
          <input type="date" name="date" value={date} min={today} max={maxDate} required onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn" type="submit">Find trips</button>
      </form>
    </>
  );
}
