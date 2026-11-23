import type { Metadata } from 'next';
import { addAmenity, saveBus, setBusStatus } from '@/app/actions/ops';
import { q } from '@/lib/db';
import { orgCtx } from '@/lib/tenancy';
import { ActionForm } from '@/components/ActionForm';
import { OrgField } from '@/components/OrgField';

export const metadata: Metadata = { title: 'Fleet' };

type Bus = { id: string; code: string; plate: string; make: string; model: string; year: number | null; color: string; class_name: string; category_id: string | null; layout_id: string | null;
  decks: number; length_m: number | null; width_m: number | null; height_m: number | null; max_passengers: number | null; max_baggage_kg: number | null; max_bag_kg: number;
  status: string; registration_expiry: string | null; inspection_status: string; amenity_ids: string[]; layout: string | null };

export default async function Fleet({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await orgCtx(slug, 'fleet.view');
  const [buses, layouts, amenities, cats] = await Promise.all([
    q<Bus>('select b.*, l.name layout from buses b left join seat_layouts l on l.id = b.layout_id where b.org_id = $1 order by b.code', [c.org.id]),
    q<{ id: string; name: string }>('select id, name from seat_layouts where org_id = $1 order by name', [c.org.id]),
    q<{ id: string; name: string; org_id: string | null }>('select id, name, org_id from amenities where org_id is null or org_id = $1 order by name', [c.org.id]),
    q<{ id: string; name: string }>('select id, name from categories where active order by sort'),
  ]);
  const manage = c.can('fleet.manage'), maintain = c.can('fleet.maintain');

  const Fields = ({ b }: { b?: Bus }) => (
    <>
      <OrgField slug={slug} />{b && <input type="hidden" name="id" value={b.id} />}
      <div className="row4">
        <label className="field">Bus code<input name="code" required maxLength={20} defaultValue={b?.code} /></label>
        <label className="field">Plate number<input name="plate" maxLength={12} defaultValue={b?.plate} /></label>
        <label className="field">Class shown to passengers<input name="class_name" maxLength={40} defaultValue={b?.class_name} placeholder="Deluxe, Elite 26" /></label>
        <label className="field">Category<select name="category_id" defaultValue={b?.category_id ?? ''}><option value="">None</option>{cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </div>
      <div className="row4">
        <label className="field">Make<input name="make" maxLength={40} defaultValue={b?.make} /></label>
        <label className="field">Model<input name="model" maxLength={40} defaultValue={b?.model} /></label>
        <label className="field">Year<input name="year" type="number" min="1960" max="2100" defaultValue={b?.year ?? ''} /></label>
        <label className="field">Color<input name="color" maxLength={30} defaultValue={b?.color} /></label>
      </div>
      <div className="row4">
        <label className="field">Seat layout<select name="layout_id" required defaultValue={b?.layout_id ?? ''}>{layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="field">Length / width / height (m)<span className="row3"><input name="length_m" type="number" step="0.01" aria-label="Length in metres" defaultValue={b?.length_m ?? ''} /><input name="width_m" type="number" step="0.01" aria-label="Width in metres" defaultValue={b?.width_m ?? ''} /><input name="height_m" type="number" step="0.01" aria-label="Height in metres" defaultValue={b?.height_m ?? ''} /></span></label>
        <label className="field">Baggage hold limit (kg)<input name="max_baggage_kg" type="number" min="0" required defaultValue={b?.max_baggage_kg ?? 1500} /></label>
        <label className="field">Max weight per bag (kg)<input name="max_bag_kg" type="number" min="1" required defaultValue={b?.max_bag_kg ?? 20} /></label>
      </div>
      <div className="row2">
        <label className="field">Registration valid until<input name="registration_expiry" type="date" defaultValue={b?.registration_expiry ?? ''} /></label>
        <label className="field">Inspection status<input name="inspection_status" maxLength={60} defaultValue={b?.inspection_status} placeholder="Passed LTO inspection 2026-06" /></label>
      </div>
      <fieldset><legend>Amenities passengers see</legend>
        <div className="checks">{amenities.map((a) => <label key={a.id} className="check"><input type="checkbox" name="amenity" value={a.id} defaultChecked={b?.amenity_ids.includes(a.id)} /> {a.name}</label>)}</div>
      </fieldset>
    </>
  );

  return (
    <>
      <h1 className="page-h">Fleet</h1>
      <p className="lead">{buses.length} buses. Passenger capacity and decks come from each bus&apos;s seat layout. Plate numbers and dimensions are visible only to your staff.</p>
      {manage && (layouts.length ? <section className="panel"><h2>Register a bus</h2><ActionForm action={saveBus} submit="Register bus" reset><Fields /></ActionForm></section>
        : <p className="warnbox">Create a seat layout first, then register buses that use it.</p>)}
      <ul className="cards">
        {buses.map((b) => (
          <li key={b.id} className={'card col' + (b.status === 'active' ? '' : ' off')}>
            <details>
              <summary>
                <strong>{b.code}</strong> {b.plate} <span className="chip">{b.class_name || 'No class'}</span><span className="chip plain">{b.status}</span>
                <span className="note">{[b.make, b.model, b.year].filter(Boolean).join(' ')} {b.layout && `, ${b.layout}`}, {b.max_passengers ?? '?'} passengers, {b.decks} deck{b.decks > 1 ? 's' : ''}{b.inspection_status && `, ${b.inspection_status}`}</span>
              </summary>
              {manage && <ActionForm action={saveBus} submit="Save bus"><Fields b={b} /></ActionForm>}
              {maintain && (
                <ActionForm action={setBusStatus} submit="Set status" className="inline-form" quiet>
                  <OrgField slug={slug} /><input type="hidden" name="id" value={b.id} />
                  <label className="field">Status<select name="status" defaultValue={b.status}><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select></label>
                </ActionForm>
              )}
            </details>
          </li>
        ))}
      </ul>
      {manage && (
        <section className="panel" aria-labelledby="am-h">
          <h2 id="am-h">Add an amenity</h2>
          <p className="note">Shared amenities: {amenities.filter((a) => !a.org_id).map((a) => a.name).join(', ')}. Add your own for anything else.</p>
          <ActionForm action={addAmenity} submit="Add amenity" className="inline-form" reset><OrgField slug={slug} /><label className="field grow">Name<input name="name" required maxLength={40} placeholder="Blanket and pillow" /></label></ActionForm>
        </section>
      )}
    </>
  );
}
