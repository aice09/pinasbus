'use client';
import { useState } from 'react';

type Props = {
  pairs: Record<string, string[]>; // pick-up -> reachable drop-offs, from the admin-managed timetable
  from?: string;
  to?: string;
  allowAny?: boolean;
  fromLabel?: string;
  toLabel?: string;
  onChange?: (from: string, to: string) => void;
};

/** From/To selects that only offer pairs a bus actually runs. Changing one clears the other if it no longer fits. */
export function RouteSelects({ pairs, from: f0 = '', to: t0 = '', allowAny = true, fromLabel = 'From', toLabel = 'To', onChange }: Props) {
  const [from, setFrom] = useState(f0);
  const [to, setTo] = useState(t0);
  const allFrom = Object.keys(pairs).sort();
  const allTo = [...new Set(Object.values(pairs).flat())].sort();
  const fromOptions = to ? allFrom.filter((f) => pairs[f].includes(to)) : allFrom;
  const toOptions = from ? pairs[from] ?? [] : allTo;

  const set = (f: string, t: string) => { setFrom(f); setTo(t); onChange?.(f, t); };
  return (
    <>
      <label className="field">{fromLabel}
        <select name="from" value={from} required={!allowAny} onChange={(e) => { const f = e.target.value; set(f, f && to && !pairs[f]?.includes(to) ? '' : to); }}>
          <option value="">{allowAny ? 'Any terminal' : 'Choose a terminal'}</option>
          {fromOptions.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="field">{toLabel}
        <select name="to" value={to} required={!allowAny} onChange={(e) => set(from, e.target.value)}>
          <option value="">{allowAny ? 'Anywhere' : 'Choose a destination'}</option>
          {toOptions.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
    </>
  );
}
