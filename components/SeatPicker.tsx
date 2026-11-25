'use client';
import dynamic from 'next/dynamic';
import type { Livery } from '@/lib/livery';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { peso } from '@/lib/catalog';
import { PASSENGER_KINDS, SEAT_KINDS, seatName, type Seat } from '@/lib/layouts';
import { seatPrice, segmentFare } from '@/lib/pricing';
import { PASSENGER_CATEGORIES, seatAllowed, type Discounts, type PassengerCategory } from '@/lib/seatpolicy';
import { SeatPlan } from './SeatPlan';

const Bus3D = dynamic(() => import('./Bus3D'), { ssr: false, loading: () => <div className="canvas3d" /> });

type Saved = { id: string; full_name: string; label: string; category: PassengerCategory };
type Props = {
  tripId: string; layout: Seat[]; taken: string[]; released: string[];
  stops: { name: string; fare: number; boarding: boolean; alighting: boolean; time: string | null }[];
  fareAdjust: number; minFare?: number; discounts: Discounts; restroom: boolean;
  initialPickup: string; initialDropoff: string; paymentsReady: boolean;
  account: { name: string; email: string; phone: string; category: PassengerCategory } | null;
  saved: Saved[];
  cards?: { id: string; label: string; balance: number }[];
  livery?: Livery;
};
type Who = { profileId?: string; name: string; category: PassengerCategory; idType: string; idLast4: string };

const MAX_SEATS = 6;
const NEEDS_ID: PassengerCategory[] = ['senior', 'pwd', 'student'];
const ID_TYPES = ['OSCA / Senior citizen ID', 'PWD ID', 'School ID', 'Other government ID'];

export function SeatPicker(p: Props) {
  const [view, setView] = useState<'3d' | 'plan'>('plan');
  const [taken, setTaken] = useState(new Set(p.taken));
  const released = useMemo(() => new Set(p.released), [p.released]);
  const [selected, setSelected] = useState<string[]>([]);
  const [who, setWho] = useState<Record<string, Who>>({});
  const [pickup, setPickup] = useState(p.initialPickup);
  const [dropoff, setDropoff] = useState(p.initialDropoff);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [payWith, setPayWith] = useState<'online' | string>('online');

  useEffect(() => { try { if (document.createElement('canvas').getContext('webgl2')) setView('3d'); } catch { /* keep plan */ } }, []);

  const i = p.stops.findIndex((s) => s.name === pickup && s.boarding);
  const dropOptions = p.stops.filter((s, k) => k > i && s.alighting);
  const j = p.stops.findIndex((s, k) => k > i && s.name === dropoff && s.alighting);
  const segment = i >= 0 && j > i ? segmentFare({ stops: p.stops, fare_adjust_pct: p.fareAdjust, min_fare: p.minFare }, i, j) : 0;
  const kindOf = (id: string) => p.layout.find((s) => s.id === id)!.kind;
  const allowedCats = (id: string) => (Object.keys(PASSENGER_CATEGORIES) as PassengerCategory[]).filter((c) => seatAllowed(kindOf(id), c, released.has(id)));

  const defaultWho = (id: string): Who => {
    const cats = allowedCats(id);
    const cat = p.account && cats.includes(p.account.category) ? p.account.category : cats[0];
    return { name: '', category: cat, idType: '', idLast4: '' };
  };

  const toggle = (id: string) => {
    setError('');
    if (selected.includes(id)) { setSelected((s) => s.filter((x) => x !== id)); return; }
    if (selected.length >= MAX_SEATS) { setError(`You can book up to ${MAX_SEATS} seats at a time.`); return; }
    if (!allowedCats(id).length) { setError(`${seatName(id)} is not for sale.`); return; }
    setWho((w) => ({ ...w, [id]: w[id] ?? defaultWho(id) }));
    setSelected((s) => [...s, id]);
  };

  const ordered = p.layout.map((l) => l.id).filter((id) => selected.includes(id));
  const lines = ordered.map((id) => ({ id, ...seatPrice(segment, p.discounts, who[id]?.category ?? 'regular') }));
  const total = lines.reduce((a, l) => a + l.total, 0);
  const usedProfiles = new Set(ordered.map((s) => who[s]?.profileId).filter(Boolean));
  const setW = (id: string, patch: Partial<Who>) => setWho((w) => ({ ...w, [id]: { ...w[id], ...patch } }));
  const pickTime = p.stops[i]?.time;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ordered.length) return setError('Choose at least one seat.');
    const f = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tripId: p.tripId, pickup, dropoff, ...(payWith !== 'online' && { payWith: 'card', cardId: payWith }),
          name: f.get('name'), email: f.get('email'), phone: String(f.get('phone') ?? '').replace(/[\s-]/g, ''),
          seats: ordered.map((seat) => ({ seat, name: who[seat].name, category: who[seat].category, idType: who[seat].idType, idLast4: who[seat].idLast4, ...(who[seat].profileId && { profileId: who[seat].profileId }) })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.paid && typeof body.ref === 'string') { window.location.assign(`/booking/${body.ref}`); return; }
      if (res.ok && typeof body.checkoutUrl === 'string' && body.checkoutUrl.startsWith('https://')) { window.location.assign(body.checkoutUrl); return; }
      if (res.status === 409 && Array.isArray(body.taken)) {
        const t = new Set<string>(body.taken);
        setTaken(t); setSelected((s) => s.filter((x) => !t.has(x)));
      }
      setError(body.error ?? 'Something went wrong. Try again.');
    } catch { setError('No connection. Check your internet and try again.'); }
    setBusy(false);
  }

  const shared = { layout: p.layout, taken, released, selected, onToggle: toggle, restroom: p.restroom, livery: p.livery };
  const free = p.layout.filter((s) => PASSENGER_KINDS.includes(s.kind) && !taken.has(s.id)).length;
  const sleeper = p.layout.some((s) => s.berth);
  const kinds = [...new Set(p.layout.map((s) => s.kind))].filter((k) => k !== 'regular');

  return (
    <div className="picker">
      <div className="stage">
        <div className="stage-bar">
          <div className="toggle" role="group" aria-label="Seat view">
            <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>3D bus</button>
            <button type="button" aria-pressed={view === 'plan'} onClick={() => setView('plan')}>Seat plan</button>
          </div>
          <ul className="legend">
            <li><span className="swatch" /> Available ({free})</li>
            <li><span className="swatch sel" /> Your pick</li>
            <li><span className="swatch tak" /> Taken</li>
            {kinds.map((k) => <li key={k}><span className={`swatch k-${k}`} /> {SEAT_KINDS[k]}</li>)}
            {p.restroom && <li><span className="swatch cr" /> CR</li>}
          </ul>
        </div>
        {view === '3d' ? <Bus3D {...shared} /> : <SeatPlan {...shared} />}
        <p className="note">
          Senior citizen, PWD and priority seats are held for eligible passengers{released.size ? '; some are now open to everyone because departure is close' : ' until shortly before departure'}.
          Eligible passengers may still choose any other seat.{view === '3d' && ' Using a keyboard or screen reader? Switch to the seat plan.'}
        </p>
      </div>

      <form className="summary" onSubmit={submit}>
        <h2 style={{ fontSize: '1.3rem' }}>Your trip</h2>
        <label className="field">Pick-up
          <select value={pickup} onChange={(e) => { setPickup(e.target.value); const k = p.stops.findIndex((s) => s.name === e.target.value); if (!p.stops.some((s, m) => m > k && s.name === dropoff && s.alighting)) setDropoff(p.stops.find((s, m) => m > k && s.alighting)?.name ?? ''); }}>
            {p.stops.filter((s) => s.boarding).map((s) => <option key={s.name} value={s.name}>{s.name}{s.time ? `, ${s.time}` : ''}</option>)}
          </select>
        </label>
        <label className="field">Drop-off
          <select value={dropoff} onChange={(e) => setDropoff(e.target.value)}>
            {dropOptions.map((s) => <option key={s.name}>{s.name}</option>)}
          </select>
        </label>
        <dl>
          <dt>Pick-up time</dt><dd>{pickTime ?? 'see schedule'}</dd>
          <dt>Fare per {sleeper ? 'berth' : 'seat'}</dt><dd>{peso(segment)}</dd>
        </dl>

        {ordered.length > 0 && (
          <fieldset className="who">
            <legend>Passengers</legend>
            {ordered.map((seat) => {
              const w = who[seat], cats = allowedCats(seat), line = lines.find((l) => l.id === seat)!;
              return (
                <div key={seat} className="who-row">
                  <span className="who-seat">{seatName(seat)}{kindOf(seat) !== 'regular' && !released.has(seat) ? `, ${SEAT_KINDS[kindOf(seat)]}` : ''} <span className="note">{peso(line.total)}</span></span>
                  {p.saved.length > 0 && (
                    <select aria-label={`Saved passenger for ${seatName(seat)}`} value={w.profileId ?? ''}
                      onChange={(e) => { const s = p.saved.find((x) => x.id === e.target.value); setW(seat, s ? { profileId: s.id, name: s.full_name, category: cats.includes(s.category) ? s.category : w.category } : { profileId: undefined, name: '' }); }}>
                      <option value="">Someone else</option>
                      {p.saved.map((s) => <option key={s.id} value={s.id} disabled={(usedProfiles.has(s.id) && w.profileId !== s.id) || !cats.includes(s.category) && !cats.includes('regular')}>{s.full_name}{s.label ? ` (${s.label})` : ''}</option>)}
                    </select>
                  )}
                  {!w.profileId && <input aria-label={`Passenger name for ${seatName(seat)}`} placeholder="Full name as on ID" maxLength={80} value={w.name} onChange={(e) => setW(seat, { name: e.target.value })} />}
                  <select aria-label={`Passenger type for ${seatName(seat)}`} value={w.category} onChange={(e) => setW(seat, { category: e.target.value as PassengerCategory })}>
                    {cats.map((c) => <option key={c} value={c}>{PASSENGER_CATEGORIES[c]}{p.discounts[c] ? ` (${p.discounts[c]}% off)` : ''}</option>)}
                  </select>
                  {NEEDS_ID.includes(w.category) && (
                    <div className="row2">
                      <select aria-label="ID type" required value={w.idType} onChange={(e) => setW(seat, { idType: e.target.value })}>
                        <option value="">ID to show at boarding</option>{ID_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <input aria-label="Last 4 characters of the ID number" required placeholder="Last 4 of ID no." maxLength={4} pattern="[A-Za-z0-9]{4}" value={w.idLast4} onChange={(e) => setW(seat, { idLast4: e.target.value.toUpperCase() })} />
                    </div>
                  )}
                </div>
              );
            })}
            <p className="note">Discounts need the ID at boarding; we keep only its type and last 4 characters. {p.account ? <Link href="/account/passengers">Manage saved passengers</Link> : <><Link href="/login">Sign in</Link> to use saved passengers.</>}</p>
          </fieldset>
        )}
        <hr />
        <dl className="total"><dt>Total</dt><dd aria-live="polite">{peso(total)}</dd></dl>
        <p className="note">Includes the online convenience fee of 5.2% + ₱16 per seat.</p>
        <hr />
        <label className="field">Contact person (as on ID)<input name="name" required minLength={2} maxLength={80} autoComplete="name" defaultValue={p.account?.name} /></label>
        <label className="field">Email for your ticket<input name="email" type="email" required maxLength={120} autoComplete="email" defaultValue={p.account?.email} /></label>
        <label className="field">Mobile number<input name="phone" type="tel" required placeholder="09171234567" pattern="(\+63|0)9[0-9\s\-]{9,13}" autoComplete="tel" defaultValue={p.account?.phone} /></label>
        {p.cards && p.cards.length > 0 && (
          <label className="field">Pay with
            <select value={payWith} onChange={(e) => setPayWith(e.target.value)}>
              <option value="online">GCash, Maya or card (PayMongo)</option>
              {p.cards.map((c) => <option key={c.id} value={c.id} disabled={c.balance < total}>{c.label}, balance {peso(c.balance)}{c.balance < total ? ' (not enough)' : ''}</option>)}
            </select>
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        {p.paymentsReady || payWith !== 'online'
          ? <button className="btn" type="submit" disabled={busy || !ordered.length || !segment}>{busy ? 'Opening payment…' : ordered.length ? `Pay ${peso(total)}` : `Choose a ${sleeper ? 'berth' : 'seat'}`}</button>
          : <p className="error">Online payment isn&apos;t switched on yet.</p>}
        <p className="note">Seats are held for 15 minutes while you pay with GCash, Maya or card on PayMongo&apos;s secure page.</p>
      </form>
    </div>
  );
}
