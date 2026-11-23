import type { Metadata } from 'next';
import { deletePassenger, savePassenger } from '@/app/actions/account';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';
import { PASSENGER_CATEGORIES } from '@/lib/seatpolicy';

export const metadata: Metadata = { title: 'Saved passengers' };

type P = { id: string; full_name: string; phone: string; label: string; category: string; id_type: string; id_last4: string };

function Fields({ p }: { p?: P }) {
  return (
    <div className="row3">
      {p && <input type="hidden" name="id" value={p.id} />}
      <label className="field">Full name (as on ID)<input name="full_name" required minLength={2} maxLength={80} defaultValue={p?.full_name} /></label>
      <label className="field">Mobile (optional)<input name="phone" type="tel" placeholder="09171234567" defaultValue={p?.phone} /></label>
      <label className="field">Label (optional)<input name="label" maxLength={40} placeholder="Mama, Kuya, officemate" defaultValue={p?.label} /></label>
      <label className="field">Passenger type<select name="category" defaultValue={p?.category ?? 'regular'}>{Object.entries(PASSENGER_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="field">Discount ID type (optional)<input name="id_type" maxLength={40} placeholder="OSCA ID, PWD ID, School ID" defaultValue={p?.id_type} /></label>
      <label className="field">Last 4 of the ID number (optional)<input name="id_last4" maxLength={4} pattern="[A-Za-z0-9]{4}" defaultValue={p?.id_last4} /></label>
    </div>
  );
}

export default async function Passengers() {
  const u = await requireUser('/account/passengers');
  const list = await q<P>('select id, full_name, phone, label, category, id_type, id_last4 from passengers where user_id = $1 order by full_name', [u.id]);
  return (
    <>
      <h1 className="page-h">Saved passengers</h1>
      <p className="lead">Save family members and travel companions once. When you book, pick who sits in each seat and their name fills in for you. Senior citizen, PWD and student passengers get their discount and priority seats; we keep only the ID type and last 4 characters, checked at boarding. Only you can see these profiles, and deleting one removes it right away.</p>

      <section className="panel" aria-labelledby="add-h">
        <h2 id="add-h">Add a passenger</h2>
        <ActionForm action={savePassenger} submit="Save passenger" reset><Fields /></ActionForm>
      </section>

      <section className="section tight" aria-labelledby="list-h">
        <h2 id="list-h">{list.length} saved</h2>
        {list.length === 0 && <p className="note">No saved passengers yet.</p>}
        <ul className="cards">
          {list.map((p) => (
            <li key={p.id} className="card col">
              <details>
                <summary><strong>{p.full_name}</strong>{p.label && <span className="chip plain">{p.label}</span>}<span className="chip">{PASSENGER_CATEGORIES[p.category as keyof typeof PASSENGER_CATEGORIES]}</span>{p.phone && <span className="note"> {p.phone}</span>}</summary>
                <ActionForm action={savePassenger} submit="Save changes"><Fields p={p} /></ActionForm>
                <ActionForm action={deletePassenger} submit="Delete passenger" quiet confirm={`Delete ${p.full_name}?`}><input type="hidden" name="id" value={p.id} /></ActionForm>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
