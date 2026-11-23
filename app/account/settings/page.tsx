import type { Metadata } from 'next';
import { Email } from '@/components/Email';
import { changePassword, deleteAccount, saveProfile } from '@/app/actions/account';
import { requireUser } from '@/lib/auth';
import { ActionForm } from '@/components/ActionForm';
import { PASSENGER_CATEGORIES } from '@/lib/seatpolicy';

export const metadata: Metadata = { title: 'Settings' };

export default async function Settings() {
  const u = await requireUser('/account/settings');
  return (
    <>
      <h1 className="page-h">Settings</h1>
      <section className="panel" aria-labelledby="p-h">
        <h2 id="p-h">Profile</h2>
        <ActionForm action={saveProfile} submit="Save profile">
          <label className="field">Full name<input name="name" required minLength={2} maxLength={80} defaultValue={u.name} /></label>
          <label className="field">Mobile number<input name="phone" type="tel" defaultValue={u.phone} /></label>
          <label className="field">I usually travel as<select name="passenger_category" defaultValue={u.passenger_category}>{Object.entries(PASSENGER_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <p className="note">Email: <Email value={u.email} />. To change it, contact us.</p>
        </ActionForm>
      </section>
      <section className="panel" aria-labelledby="pw-h">
        <h2 id="pw-h">Password</h2>
        <ActionForm action={changePassword} submit="Change password">
          <label className="field">Current password<input name="current" type="password" required autoComplete="current-password" /></label>
          <label className="field">New password<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
          <p className="note">Changing your password signs you out on every device.</p>
        </ActionForm>
      </section>
      <section className="panel danger" aria-labelledby="del-h">
        <h2 id="del-h">Delete account</h2>
        <p>This deletes your account and saved passengers. Tickets and Padala you already paid for stay valid; their records are kept for accounting but are no longer linked to you.</p>
        <ActionForm action={deleteAccount} submit="Delete my account" quiet confirm="Delete your account? This cannot be undone.">
          <label className="field">Password<input name="current" type="password" required autoComplete="current-password" /></label>
        </ActionForm>
      </section>
    </>
  );
}
