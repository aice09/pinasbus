import Link from 'next/link';
import type { Metadata } from 'next';
import { createPadala } from '@/app/actions/public';
import { currentUser } from '@/lib/auth';
import { network, peso } from '@/lib/catalog';
import { getRates, shipmentByRef } from '@/lib/padala';
import { paymentsConfigured } from '@/lib/paymongo';
import { activeTrips } from '@/lib/routes';
import { ActionForm } from '@/components/ActionForm';
import { PadalaFields } from '@/components/PadalaFields';
import { RouteSelects } from '@/components/RouteSelects';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Padala: send a package', description: 'Send boxes and documents between Metro Manila and Bicol on our buses. Book and pay online, track every step.' };

export default async function Padala({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const { again } = await searchParams;
  const [user, rates, trips] = await Promise.all([currentUser(), getRates(), activeTrips()]);
  // "Send again" only prefills from the signed-in user's own shipment.
  const prev = again && user ? await shipmentByRef(again) : null;
  const p = prev && prev.user_id === user?.id ? prev : null;
  const { pairs } = network(trips);

  return (
    <main>
      <section className="split">
        <div>
          <h1 className="page-h">Padala on the next bus out</h1>
          <p className="lead">Send boxes, balikbayan packs and documents between any two terminals on our routes. Pay online, drop the package off, and the recipient claims it at the destination terminal with a valid ID.</p>
          <ol className="steps compact">
            <li><h3>Book and pay</h3><p>Fill in the form. The fee is shown before you pay.</p></li>
            <li><h3>Drop it off</h3><p>Bring the package to your origin terminal within 3 days. Staff weigh it and tag it with your reference.</p></li>
            <li><h3>Track it</h3><p>Follow it from received to on the bus to ready for pick-up.</p></li>
          </ol>
          <h2>Rates</h2>
          <table className="fares small">
            <tbody>
              <tr><th scope="row">Base charge</th><td className="num">{peso(rates.base)}</td></tr>
              <tr><th scope="row">Per kilogram (rounded up)</th><td className="num">{peso(rates.perKg)}</td></tr>
              <tr><th scope="row">Valuation charge</th><td className="num">{rates.valuationPct}% of declared value</td></tr>
              <tr><th scope="row">Heaviest package</th><td className="num">{rates.maxKg} kg</td></tr>
            </tbody>
          </table>
          <p className="note">Not accepted: cash, jewelry, firearms, flammables, perishables without proper packing, live animals and anything illegal to transport. Unclaimed packages are kept for 30 days.</p>
          <p><Link href="/padala/track">Track a package</Link></p>
        </div>

        <div className="panel">
          <h2>Send a package</h2>
          {!paymentsConfigured() && <p className="error">Online payment isn&apos;t switched on yet. Send your package at a terminal.</p>}
          <ActionForm action={createPadala} submit="Continue to payment" pending="Opening payment…">
            <fieldset><legend>Route</legend>
              <div className="row2"><RouteSelects pairs={pairs} allowAny={false} from={p?.origin ?? ''} to={p?.destination ?? ''} fromLabel="Drop off at" toLabel="Recipient claims at" /></div>
            </fieldset>
            <fieldset><legend>Sender</legend>
              <label className="field">Name<input name="sender_name" required maxLength={80} defaultValue={p?.sender_name ?? user?.name} autoComplete="name" /></label>
              <div className="row2">
                <label className="field">Mobile<input name="sender_phone" type="tel" required placeholder="09171234567" defaultValue={p?.sender_phone ?? user?.phone} /></label>
                <label className="field">Email for the receipt<input name="sender_email" type="email" required maxLength={120} defaultValue={p?.sender_email ?? user?.email} /></label>
              </div>
            </fieldset>
            <fieldset><legend>Recipient</legend>
              <div className="row2">
                <label className="field">Name (as on their ID)<input name="recipient_name" required maxLength={80} defaultValue={p?.recipient_name} /></label>
                <label className="field">Mobile<input name="recipient_phone" type="tel" required placeholder="09171234567" defaultValue={p?.recipient_phone} /></label>
              </div>
            </fieldset>
            <fieldset><legend>Package</legend>
              <label className="field">What is inside<input name="description" required maxLength={200} placeholder="Clothes and canned goods, 1 box" defaultValue={p?.description} /></label>
              <PadalaFields rates={rates} weight={p ? String(p.weight_kg) : ''} value={p ? String(p.declared_value_centavos / 100) : ''} />
            </fieldset>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
          </ActionForm>
          {!user && <p className="note"><Link href="/login?next=/padala">Sign in</Link> to keep your Padala history and send again with one tap.</p>}
        </div>
      </section>
    </main>
  );
}
