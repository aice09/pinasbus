import type { Metadata } from 'next';
import { saveTrip } from '@/app/actions/admin';
import { requireAdmin } from '@/lib/auth';
import { BUS_CLASSES, peso, time12, type Trip } from '@/lib/catalog';
import { allTrips } from '@/lib/routes';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Routes and trips' };

function TripForm({ t }: { t?: Trip }) {
  return (
    <ActionForm action={saveTrip} submit={t ? 'Save trip' : 'Add trip'} reset={!t}>
      <div className="row4">
        <label className="field">Trip id{t ? <input name="id" value={t.id} readOnly /> : <input name="id" required placeholder="z3-s" pattern="[a-z0-9\-]{1,40}" />}</label>
        <label className="field">Code<input name="code" required maxLength={20} defaultValue={t?.code} placeholder="Z3" /></label>
        <label className="field">Direction<select name="dir" defaultValue={t?.dir ?? 'south'}><option value="south">Southbound (to Bicol)</option><option value="north">Northbound (to Manila)</option></select></label>
        <label className="field">Bus class<select name="busClass" defaultValue={t?.busClass ?? 'skybus'}>{Object.values(BUS_CLASSES).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.seats})</option>)}</select></label>
      </div>
      <div className="row3">
        <label className="field">Pick-ups, one per line: station and HH:MM
          <textarea name="pickups" rows={4} required defaultValue={t?.pickups.map((p) => `${p.station} ${p.time}`).join('\n')} placeholder={'EDSA Cubao 20:00\nAlabang 21:00'} /></label>
        <label className="field">Drop-offs, one per line
          <textarea name="dropoffs" rows={4} required defaultValue={t?.dropoffs.join('\n')} placeholder={'Naga CBD\nLegazpi'} /></label>
        <div className="stack">
          <label className="field">Fare per seat (PHP)<input name="fare" type="number" min="1" max="20000" required defaultValue={t?.fare} /></label>
          <label className="check"><input type="checkbox" name="active" defaultChecked={t?.active ?? true} /> Running (bookable)</label>
        </div>
      </div>
    </ActionForm>
  );
}

export default async function Trips() {
  await requireAdmin();
  const trips = await allTrips();
  return (
    <>
      <h1 className="page-h">Routes and trips</h1>
      <p className="lead">Each trip&apos;s pick-ups and drop-offs decide which From → To pairs customers can choose, on the search, trips and Padala forms. Turn a trip off to stop sales without deleting its history.</p>
      <section className="panel"><h2>Add a trip</h2><TripForm /></section>
      <section className="section tight">
        <h2>{trips.length} trips</h2>
        <ul className="cards">
          {trips.map((t) => (
            <li key={t.id} className={'card col' + (t.active ? '' : ' off')}>
              <details>
                <summary>
                  <strong>{t.code}</strong> <span className="chip">{BUS_CLASSES[t.busClass].name}</span>
                  {t.pickups.map((p) => `${p.station} ${time12(p.time)}`).join(', ')} → {t.dropoffs.join(', ')}
                  <span className="note"> {peso(t.fare * 100)}{t.active ? '' : ', not running'}</span>
                </summary>
                <TripForm t={t} />
              </details>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
