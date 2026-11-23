import Link from 'next/link';
import { Email } from '@/components/Email';
import type { Metadata } from 'next';
import { saveRates, updateShipment } from '@/app/actions/platform';
import { requirePlatformAdmin } from '@/lib/auth';
import { peso } from '@/lib/catalog';
import { q } from '@/lib/db';
import { getRates, STATUS_TEXT, STATUSES, type Shipment } from '@/lib/padala';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Padala' };

export default async function AdminPadala({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '') ? sp.status! : '';
  const term = (sp.q ?? '').trim().slice(0, 80);
  const [rows, rates] = await Promise.all([
    q<Shipment>(`select * from shipments where ($1 = '' or status = $1) and ($2 = '' or ref ilike '%'||$2||'%' or sender_name ilike '%'||$2||'%' or recipient_name ilike '%'||$2||'%')
      order by created_at desc limit 200`, [status, term]),
    getRates(),
  ]);
  return (
    <>
      <h1 className="page-h">Padala</h1>
      <form className="filters" method="get">
        <label className="field">Search<input name="q" defaultValue={term} placeholder="Reference, sender or recipient" /></label>
        <label className="field">Status<select name="status" defaultValue={status}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}</select></label>
        <button className="btn quiet" type="submit">Filter</button>
      </form>
      <ul className="cards">
        {rows.map((s) => (
          <li key={s.id} className="card col">
            <details>
              <summary>
                <span className="mono">{s.ref}</span> {s.origin} → {s.destination}, {s.weight_kg} kg
                <span className={`status ${s.status === 'cancelled' ? 'expired' : s.status === 'claimed' ? 'paid' : 'pending'}`}>{STATUS_TEXT[s.status]}</span>
              </summary>
              <p className="meta">From {s.sender_name} ({s.sender_phone}, <Email value={s.sender_email} />) to {s.recipient_name} ({s.recipient_phone}). {s.description}. Declared {peso(s.declared_value_centavos)}, fee {peso(s.fee_centavos)}. <Link href={`/padala/track?ref=${s.ref}`}>Timeline</Link></p>
              {s.status !== 'pending_payment' && s.status !== 'cancelled' && (
                <ActionForm action={updateShipment} submit="Update status" className="inline-form">
                  <input type="hidden" name="id" value={s.id} />
                  <label className="field">New status<select name="status" defaultValue={STATUSES[Math.min(STATUSES.indexOf(s.status) + 1, 5)]}>
                    {STATUSES.filter((x) => x !== 'pending_payment').map((x) => <option key={x} value={x}>{STATUS_TEXT[x]}</option>)}</select></label>
                  <label className="field grow">Note for the sender (optional)<input name="note" maxLength={200} placeholder="Loaded on trip Z3, plate ABC 1234" /></label>
                </ActionForm>
              )}
            </details>
          </li>
        ))}
        {rows.length === 0 && <li className="note">No shipments match.</li>}
      </ul>

      <section className="panel" aria-labelledby="rates-h">
        <h2 id="rates-h">Rates</h2>
        <p className="note">Fee = base + per kg (rounded up) + valuation % of the declared value. Changes apply to new shipments only.</p>
        <ActionForm action={saveRates} submit="Save rates">
          <div className="row4">
            <label className="field">Base (PHP)<input name="base" type="number" step="0.01" min="0" defaultValue={rates.base / 100} /></label>
            <label className="field">Per kg (PHP)<input name="perKg" type="number" step="0.01" min="0" defaultValue={rates.perKg / 100} /></label>
            <label className="field">Max weight (kg)<input name="maxKg" type="number" min="1" defaultValue={rates.maxKg} /></label>
            <label className="field">Valuation (%)<input name="valuationPct" type="number" step="0.1" min="0" defaultValue={rates.valuationPct} /></label>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
