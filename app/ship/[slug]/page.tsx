import Link from 'next/link';
import type { Metadata } from 'next';
import { addPort, addSailings, sailingStatus, saveVessel } from '@/app/actions/ferry';
import { addDays, manilaNow } from '@/lib/catalog';
import { q } from '@/lib/db';
import { orgCtx } from '@/lib/tenancy';
import { ActionForm } from '@/components/ActionForm';
import { OrgField } from '@/components/OrgField';

export const metadata: Metadata = { title: 'Sailings' };
const STATUSES = ['scheduled', 'boarding', 'sailing', 'arrived', 'delayed', 'cancelled'];

export default async function Sailings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await orgCtx(slug);
  const today = manilaNow().date;
  const [vessels, ports, sailings] = await Promise.all([
    q<{ id: string; name: string; registration: string; vehicle_slots: number; passenger_capacity: number | null; status: string }>('select * from vessels where org_id = $1 order by name', [c.org.id]),
    q<{ name: string; province: string; lat: number | null }>(`select name, province, lat from stations where kind = 'port' order by name`),
    q<{ id: string; vessel: string; slots: number; from_port: string; to_port: string; departs_at: Date; arrives_at: Date; status: string; note: string; buses: number }>(
      `select s.id, v.name vessel, v.vehicle_slots slots, s.from_port, s.to_port, s.departs_at, s.arrives_at, s.status, s.note,
              (select count(*) from ferry_links l where l.sailing_id = s.id and l.status <> 'cancelled')::int buses
         from sailings s join vessels v on v.id = s.vessel_id where s.org_id = $1 and s.departs_at >= $2::date - 1 and s.departs_at < $2::date + 4 order by s.departs_at`, [c.org.id, today]),
  ]);
  const t = (d: Date) => d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <>
      <h1 className="page-h">{c.org.name}</h1>
      {c.org.is_demo && <p className="warnbox">Demo shipping company with indicative sailings; not a real operator.</p>}
      <section className="section tight" aria-labelledby="s-h">
        <h2 id="s-h">Sailings, next 4 days</h2>
        <ul className="cards">{sailings.map((s) => (
          <li key={s.id} className={'card col' + (s.status === 'cancelled' ? ' off' : '')}>
            <details>
              <summary><strong>{t(s.departs_at)}</strong> {s.from_port} → {s.to_port} <span className="chip">{s.vessel}</span><span className="chip plain">{s.status}</span><span className="note">{s.buses} of {s.slots} vehicle slots booked{s.note && `. ${s.note}`}</span>
                <Link className="btn quiet small" href={`/ship/${slug}/sailings/${s.id}`}>Manifest</Link></summary>
              {c.can('ships.operate') && (
                <ActionForm action={sailingStatus} submit="Update sailing" className="inline-form">
                  <OrgField slug={slug} /><input type="hidden" name="id" value={s.id} />
                  <label className="field">Status<select name="status" defaultValue={s.status}>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></label>
                  <label className="field grow">Note for passengers<input name="note" maxLength={200} placeholder="Delayed 1 hour due to weather" /></label>
                </ActionForm>
              )}
            </details>
          </li>))}
          {sailings.length === 0 && <li className="note">No sailings scheduled. Add them below.</li>}
        </ul>
      </section>
      {c.can('ships.manage') && (
        <>
          <section className="panel"><h2>Add sailings</h2>
            {vessels.length && ports.length >= 2 ? (
              <ActionForm action={addSailings} submit="Add sailings">
                <OrgField slug={slug} />
                <div className="row4">
                  <label className="field">Vessel<select name="vessel_id">{vessels.filter((v) => v.status === 'in_service').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
                  <label className="field">From port<select name="from_port">{ports.map((p) => <option key={p.name}>{p.name}</option>)}</select></label>
                  <label className="field">To port<select name="to_port" defaultValue={ports[1]?.name}>{ports.map((p) => <option key={p.name}>{p.name}</option>)}</select></label>
                  <label className="field">Crossing time (minutes)<input name="minutes" type="number" min="10" defaultValue={240} /></label>
                </div>
                <div className="row4">
                  <label className="field">First date<input name="date" type="date" defaultValue={addDays(today, 1)} required /></label>
                  <label className="field">Departs (Manila time)<input name="time" type="time" defaultValue="06:00" required /></label>
                  <label className="field">Repeat daily for (days)<input name="days" type="number" min="1" max="60" defaultValue={7} /></label>
                  <label className="field">Boarding opens (minutes before)<input name="boarding" type="number" min="10" defaultValue={60} /></label>
                </div>
              </ActionForm>
            ) : <p className="note">Register a vessel and at least two ports first.</p>}
          </section>
          <section className="panel"><h2>Vessels</h2>
            {vessels.map((v) => (
              <details key={v.id}><summary><strong>{v.name}</strong> <span className="note">{v.registration}, {v.vehicle_slots} vehicle slots, {v.status}</span></summary>
                <ActionForm action={saveVessel} submit="Save vessel"><OrgField slug={slug} /><input type="hidden" name="id" value={v.id} /><VesselFields v={v} /></ActionForm></details>
            ))}
            <ActionForm action={saveVessel} submit="Register vessel" reset><OrgField slug={slug} /><VesselFields /></ActionForm>
          </section>
          <section className="panel"><h2>Ports</h2>
            <p className="note">{ports.map((p) => `${p.name}${p.province ? ` (${p.province})` : ''}`).join(', ') || 'None yet.'}</p>
            <ActionForm action={addPort} submit="Add port" reset>
              <OrgField slug={slug} />
              <div className="row4"><label className="field">Port name<input name="name" required maxLength={60} /></label><label className="field">Province<input name="province" maxLength={60} /></label>
                <label className="field">Latitude<input name="lat" type="number" step="0.0001" /></label><label className="field">Longitude<input name="lng" type="number" step="0.0001" /></label></div>
            </ActionForm>
          </section>
        </>
      )}
    </>
  );
}

function VesselFields({ v }: { v?: { name: string; registration: string; vehicle_slots: number; passenger_capacity: number | null; status: string } }) {
  return (
    <div className="row4">
      <label className="field">Name<input name="name" required maxLength={80} defaultValue={v?.name} /></label>
      <label className="field">Registration<input name="registration" maxLength={40} defaultValue={v?.registration} /></label>
      <label className="field">Vehicle slots (buses)<input name="vehicle_slots" type="number" min="1" required defaultValue={v?.vehicle_slots ?? 10} /></label>
      <label className="field">Passengers<input name="passenger_capacity" type="number" min="0" defaultValue={v?.passenger_capacity ?? 300} /></label>
      <label className="field">Status<select name="status" defaultValue={v?.status ?? 'in_service'}><option value="in_service">In service</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select></label>
    </div>
  );
}
