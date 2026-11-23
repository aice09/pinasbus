'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { BusClass, Trip } from '@/lib/catalog';
import { peso, time12 } from '@/lib/catalog';
import { seatName } from '@/lib/layouts';
import { SeatPlan } from './SeatPlan';

const Bus3D = dynamic(() => import('./Bus3D'), { ssr: false, loading: () => <div className="canvas3d" /> });

type Saved = { id: string; full_name: string; label: string };
type Props = {
  trip: Trip; busClass: BusClass; date: string; taken: string[];
  perSeat: { fare: number; fee: number; perSeat: number };
  initialPickup: string; initialDropoff: string; paymentsReady: boolean;
  account: { name: string; email: string; phone: string } | null;
  saved: Saved[];
};

const MAX_SEATS = 6;
type Who = { profileId?: string; name: string };

export function SeatPicker({ trip, busClass, date, taken: initialTaken, perSeat, initialPickup, initialDropoff, paymentsReady, account, saved }: Props) {
  const [view, setView] = useState<'3d' | 'plan'>('plan');
  const [taken, setTaken] = useState(new Set(initialTaken));
  const [selected, setSelected] = useState<string[]>([]);
  const [who, setWho] = useState<Record<string, Who>>({});
  const [pickup, setPickup] = useState(initialPickup);
  const [dropoff, setDropoff] = useState(initialDropoff);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const restroom = busClass.amenities.includes('Restroom');

  // 3D is the default where WebGL works; the plan stays one click away for keyboards and screen readers.
  useEffect(() => {
    try { if (document.createElement('canvas').getContext('webgl2')) setView('3d'); } catch { /* keep plan */ }
  }, []);

  const toggle = (id: string) => {
    setError('');
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_SEATS ? (setError(`You can book up to ${MAX_SEATS} seats at a time.`), s) : [...s, id]);
  };
  const ordered = useMemo(() => busClass.layout.map((l) => l.id).filter((id) => selected.includes(id)), [selected, busClass]);
  const pick = trip.pickups.find((p) => p.station === pickup)!;
  const usedProfiles = new Set(Object.entries(who).filter(([s]) => ordered.includes(s)).map(([, w]) => w.profileId).filter(Boolean));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ordered.length) return setError('Choose at least one seat.');
    const f = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tripId: trip.id, date, pickup, dropoff, seats: ordered,
          name: f.get('name'), email: f.get('email'), phone: String(f.get('phone') ?? '').replace(/[\s-]/g, ''),
          passengers: ordered.map((seat) => ({ seat, name: who[seat]?.name ?? '', ...(who[seat]?.profileId && { profileId: who[seat].profileId }) })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body.checkoutUrl === 'string' && body.checkoutUrl.startsWith('https://')) {
        window.location.assign(body.checkoutUrl);
        return;
      }
      if (res.status === 409 && Array.isArray(body.taken)) {
        const t = new Set<string>(body.taken);
        setTaken(t);
        setSelected((s) => s.filter((x) => !t.has(x)));
      }
      setError(body.error ?? 'Something went wrong. Try again.');
    } catch {
      setError('No connection. Check your internet and try again.');
    }
    setBusy(false);
  }

  const shared = { layout: busClass.layout, taken, selected, onToggle: toggle, restroom };
  const free = busClass.seats - taken.size;
  const sleeper = busClass.layout[0].berth;

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
            {restroom && <li><span className="swatch cr" /> CR</li>}
          </ul>
        </div>
        {view === '3d' ? <Bus3D {...shared} /> : <SeatPlan {...shared} />}
        {view === '3d' && <p className="note">Using a keyboard or screen reader? Switch to the seat plan.</p>}
      </div>

      <form className="summary" onSubmit={submit}>
        <h2 style={{ fontSize: '1.3rem' }}>Your trip</h2>
        <label className="field">Pick-up
          <select value={pickup} onChange={(e) => setPickup(e.target.value)}>
            {trip.pickups.map((p) => <option key={p.station} value={p.station}>{p.station}, {time12(p.time)}</option>)}
          </select>
        </label>
        <label className="field">Drop-off
          <select value={dropoff} onChange={(e) => setDropoff(e.target.value)}>
            {trip.dropoffs.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <dl>
          <dt>Pick-up time</dt><dd>{time12(pick.time)}</dd>
          <dt>{sleeper ? 'Berths' : 'Seats'}</dt><dd aria-live="polite">{ordered.length ? ordered.join(', ') : 'None yet'}</dd>
          <dt>Fare per {sleeper ? 'berth' : 'seat'}</dt><dd>{peso(perSeat.fare)}</dd>
          <dt>Convenience fee</dt><dd>{peso(perSeat.fee * ordered.length)}</dd>
        </dl>
        <hr />
        <dl className="total"><dt>Total</dt><dd aria-live="polite">{peso(perSeat.perSeat * ordered.length)}</dd></dl>

        {ordered.length > 0 && (
          <fieldset className="who">
            <legend>Who is sitting where</legend>
            {ordered.map((seat) => (
              <div key={seat} className="who-row">
                <span className="who-seat">{seatName(seat)}</span>
                {saved.length > 0 && (
                  <select aria-label={`Saved passenger for ${seatName(seat)}`} value={who[seat]?.profileId ?? ''}
                    onChange={(e) => { const p = saved.find((x) => x.id === e.target.value); setWho((w) => ({ ...w, [seat]: p ? { profileId: p.id, name: p.full_name } : { name: '' } })); }}>
                    <option value="">Someone else</option>
                    {saved.map((p) => <option key={p.id} value={p.id} disabled={usedProfiles.has(p.id) && who[seat]?.profileId !== p.id}>{p.full_name}{p.label ? ` (${p.label})` : ''}</option>)}
                  </select>
                )}
                {!who[seat]?.profileId && (
                  <input aria-label={`Passenger name for ${seatName(seat)}`} placeholder="Full name as on ID" maxLength={80}
                    value={who[seat]?.name ?? ''} onChange={(e) => setWho((w) => ({ ...w, [seat]: { name: e.target.value } }))} />
                )}
              </div>
            ))}
            <p className="note">{account ? <>Manage saved passengers in <Link href="/account/passengers">your account</Link>.</> : <><Link href="/login">Sign in</Link> to pick from saved passengers.</>} Blank names use the contact person below.</p>
          </fieldset>
        )}

        <hr />
        <label className="field">Contact person (as on ID)<input name="name" required minLength={2} maxLength={80} autoComplete="name" defaultValue={account?.name} /></label>
        <label className="field">Email for your ticket<input name="email" type="email" required maxLength={120} autoComplete="email" defaultValue={account?.email} /></label>
        <label className="field">Mobile number<input name="phone" type="tel" required placeholder="09171234567" pattern="(\+63|0)9[0-9\s\-]{9,13}" autoComplete="tel" defaultValue={account?.phone} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        {paymentsReady ? (
          <button className="btn" type="submit" disabled={busy || !ordered.length}>
            {busy ? 'Opening payment…' : ordered.length ? `Pay ${peso(perSeat.perSeat * ordered.length)}` : `Choose a ${sleeper ? 'berth' : 'seat'}`}
          </button>
        ) : (
          <p className="error">Online payment isn&apos;t switched on yet. You can book this trip at a terminal booth.</p>
        )}
        <p className="note">We hold your seats for 15 minutes while you pay with GCash, Maya or card on PayMongo&apos;s secure page.</p>
      </form>
    </div>
  );
}
