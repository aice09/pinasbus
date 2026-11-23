import type { Metadata } from 'next';
import { saveCompany } from '@/app/actions/ops';
import { orgCtx, orgDiscounts, orgPolicy } from '@/lib/tenancy';
import { ActionForm } from '@/components/ActionForm';
import { DEFAULT_BAGGAGE } from '@/lib/baggage';
import { DEFAULT_TRACKING } from '@/lib/tracking';
import { OrgField } from '@/components/OrgField';

export const metadata: Metadata = { title: 'Company settings' };

export default async function Settings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await orgCtx(slug, 'org.manage');
  const policy = orgPolicy(c.org), d = orgDiscounts(c.org);
  const bag = { ...DEFAULT_BAGGAGE, ...(c.org.settings.baggage ?? {}) }, trk = { ...DEFAULT_TRACKING, ...(c.org.settings.tracking ?? {}) };
  return (
    <>
      <h1 className="page-h">Company settings</h1>
      <ActionForm action={saveCompany} submit="Save settings">
        <OrgField slug={slug} />
        <section className="panel">
          <h2>Contact details</h2>
          <div className="row3">
            <label className="field">Email<input name="contact_email" type="email" required defaultValue={c.org.contact_email} /></label>
            <label className="field">Phone<input name="contact_phone" defaultValue={c.org.contact_phone} /></label>
            <label className="field">Main office address<input name="address" defaultValue={c.org.address} /></label>
          </div>
        </section>
        <section className="panel">
          <h2>Priority seat release</h2>
          <p className="note">Senior citizen, PWD and priority seats are sold only to eligible passengers. If they are still unsold this many hours before departure, they open to everyone. Seats already sold are never touched, and each release is written to the audit log. 0 keeps them reserved until departure.</p>
          <div className="row2">
            <label className="field">Release this many hours before departure<input name="releaseHoursBefore" type="number" min="0" max="72" defaultValue={policy.releaseHoursBefore} /></label>
            <fieldset><legend>Applies to</legend><div className="checks">
              {(['senior', 'pwd', 'priority'] as const).map((k) => <label key={k} className="check"><input type="checkbox" name="releaseKinds" value={k} defaultChecked={policy.releaseKinds.includes(k)} /> {k === 'pwd' ? 'PWD seats' : k === 'senior' ? 'Senior citizen seats' : 'Priority seats'}</label>)}
            </div></fieldset>
          </div>
        </section>
        <section className="panel">
          <h2>Fare discounts (%)</h2>
          <p className="note">Applied to the fare, online and at the terminal, after the passenger shows a valid ID. Set them to what the law and your franchise require; PINASBUS does not decide these rates.</p>
          <div className="row4">
            <label className="field">Senior citizen<input name="d_senior" type="number" min="0" max="100" step="0.5" defaultValue={d.senior} /></label>
            <label className="field">PWD<input name="d_pwd" type="number" min="0" max="100" step="0.5" defaultValue={d.pwd} /></label>
            <label className="field">Student<input name="d_student" type="number" min="0" max="100" step="0.5" defaultValue={d.student} /></label>
            <label className="field">Child<input name="d_child" type="number" min="0" max="100" step="0.5" defaultValue={d.child} /></label>
          </div>
        </section>
        <section className="panel">
          <h2>Baggage</h2>
          <div className="row3">
            <label className="field">Free allowance per seat (kg)<input name="freeKgPerSeat" type="number" min="0" max="100" defaultValue={bag.freeKgPerSeat} /></label>
            <label className="field">Excess fee per kg (PHP)<input name="excessPerKg" type="number" min="0" step="0.5" defaultValue={bag.excessPerKgCentavos / 100} /></label>
            <label className="field">Bags per seat<input name="maxBagsPerSeat" type="number" min="0" max="10" defaultValue={bag.maxBagsPerSeat} /></label>
          </div>
          <p className="note">Per-bag weight and the hold limit are set on each bus in Fleet.</p>
        </section>
        <section className="panel">
          <h2>Tracking alerts</h2>
          <p className="note">Alerts use live GPS from crew phones; simulated positions never raise alerts. Set the speed limit your franchise and the road rules require.</p>
          <div className="row3">
            <label className="field">Speed limit (km/h)<input name="speedLimitKph" type="number" min="20" max="140" defaultValue={trk.speedLimitKph} /></label>
            <label className="field">Off-route after (km)<input name="deviationKm" type="number" min="0.2" step="0.1" defaultValue={trk.deviationKm} /></label>
            <label className="field">Unusual stop after (minutes)<input name="unusualStopMinutes" type="number" min="5" defaultValue={trk.unusualStopMinutes} /></label>
          </div>
        </section>
        <section className="panel">
          <h2>Payment methods</h2>
          <p className="note">Online payments (GCash, Maya, cards through PayMongo) and cash at the terminal are always on.</p>
          <label className="check"><input type="checkbox" name="accept_cards" defaultChecked={c.org.settings.payments?.cards !== false} /> Accept PINASBUS-supported transport cards</label>
        </section>
      </ActionForm>
    </>
  );
}
