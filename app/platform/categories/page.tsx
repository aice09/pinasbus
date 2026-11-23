import type { Metadata } from 'next';
import { saveCategory } from '@/app/actions/platform';
import { requirePlatformAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Transport categories' };

type Cat = { id: string; name: string; description: string; sort: number; active: boolean; rules: { maxSeatsPerBooking?: number; advanceDays?: number }; routes: number };

function Fields({ c }: { c?: Cat }) {
  return (
    <>
      <div className="row4">
        <label className="field">Id{c ? <input name="id" value={c.id} readOnly /> : <input name="id" required pattern="[a-z0-9\-]{2,40}" placeholder="night-express" />}</label>
        <label className="field">Name<input name="name" required defaultValue={c?.name} /></label>
        <label className="field">Order<input name="sort" type="number" min="0" defaultValue={c?.sort ?? 100} /></label>
        <label className="check"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> Active</label>
      </div>
      <label className="field">Description<input name="description" maxLength={200} defaultValue={c?.description} /></label>
      <div className="row2">
        <label className="field">Max seats per booking<input name="max_seats_per_booking" type="number" min="1" max="20" defaultValue={c?.rules.maxSeatsPerBooking ?? 6} /></label>
        <label className="field">Book up to (days ahead)<input name="advance_days" type="number" min="0" max="365" defaultValue={c?.rules.advanceDays ?? 60} /></label>
      </div>
    </>
  );
}

export default async function Categories() {
  await requirePlatformAdmin();
  const cats = await q<Cat>(`select c.*, (select count(*) from routes r where r.category_id = c.id)::int routes from categories c order by sort, name`);
  return (
    <>
      <h1 className="page-h">Transport categories</h1>
      <p className="lead">Categories classify routes (city, provincial, P2P, airport and so on) and carry their booking rules. Adding one needs no code change; companies pick it on their routes.</p>
      <section className="panel"><h2>Add a category</h2><ActionForm action={saveCategory} submit="Add category" reset><Fields /></ActionForm></section>
      <ul className="cards">
        {cats.map((c) => (
          <li key={c.id} className={'card col' + (c.active ? '' : ' off')}>
            <details>
              <summary><strong>{c.name}</strong><span className="note">{c.description}</span><span className="chip plain">{c.routes} routes</span></summary>
              <ActionForm action={saveCategory} submit="Save"><Fields c={c} /></ActionForm>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
