import type { Metadata } from 'next';
import { liveryOf } from '@/lib/livery';
import { saveLayout } from '@/app/actions/ops';
import { q } from '@/lib/db';
import { PASSENGER_KINDS, type Seat } from '@/lib/layouts';
import { orgCtx } from '@/lib/tenancy';
import { ActionForm } from '@/components/ActionForm';
import { FleetPreview } from '@/components/FleetPreview';
import { LayoutEditor } from '@/components/LayoutEditor';
import { OrgField } from '@/components/OrgField';

export const metadata: Metadata = { title: 'Seat layouts' };

export default async function Layouts({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await orgCtx(slug, 'fleet.view');
  const layouts = await q<{ id: string; name: string; seats: Seat[]; buses: number; schedules: number }>(
    `select l.id, l.name, l.seats, (select count(*) from buses b where b.layout_id = l.id)::int buses, (select count(*) from schedules s where s.layout_id = l.id)::int schedules
       from seat_layouts l where l.org_id = $1 order by l.name`, [c.org.id]);
  const manage = c.can('fleet.manage');
  return (
    <>
      <h1 className="page-h">Seat layouts</h1>
      <p className="lead">One layout serves every bus built the same way. Mark senior citizen, PWD and priority seats, crew positions and seats out of service; passengers see exactly this plan when they book.</p>
      {manage && (
        <section className="panel" aria-labelledby="new-h">
          <h2 id="new-h">New layout</h2>
          <ActionForm action={saveLayout} submit="Save layout"><OrgField slug={slug} /><label className="field">Name<input name="name" required maxLength={60} placeholder="Deluxe 2+2, 45 seats" /></label><LayoutEditor /></ActionForm>
        </section>
      )}
      <ul className="cards">
        {layouts.map((l) => (
          <li key={l.id} className="card col">
            <details>
              <summary><strong>{l.name}</strong><span className="note">{l.seats.filter((s) => PASSENGER_KINDS.includes(s.kind)).length} passenger seats, {l.seats.filter((s) => ['senior', 'pwd', 'priority'].includes(s.kind)).length} priority. Used by {l.buses} buses and {l.schedules} schedules.</span></summary>
              {manage
                ? <ActionForm action={saveLayout} submit="Save changes"><OrgField slug={slug} /><input type="hidden" name="id" value={l.id} /><label className="field">Name<input name="name" required defaultValue={l.name} /></label><LayoutEditor initial={l.seats} /></ActionForm>
                : <FleetPreview layout={l.seats} restroom={false} livery={liveryOf(c.org.slug, c.org.settings)} />}
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
