import type { Metadata } from 'next';
import { Email } from '@/components/Email';
import { changePassword, deleteAccount, saveAppearance, saveProfile } from '@/app/actions/account';
import { ThemePicker } from '@/components/ThemePicker';
import { platformPalette } from '@/lib/appearance';
import { AVATAR_STYLES, avatarDataUri } from '@/lib/avatar';
import { THEME_PRESETS } from '@/lib/theme';
import { requireUser } from '@/lib/auth';
import { ActionForm } from '@/components/ActionForm';
import { PASSENGER_CATEGORIES } from '@/lib/seatpolicy';

export const metadata: Metadata = { title: 'Settings' };

export default async function Settings() {
  const u = await requireUser('/account/settings');
  const platform = await platformPalette();
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
      <section className="panel" aria-labelledby="a-h">
        <h2 id="a-h">Profile picture and colours</h2>
        <ActionForm action={saveAppearance} submit="Save appearance">
          <fieldset className="avatars">
            <legend>Avatar style</legend>
            {AVATAR_STYLES.map(([id, label]) => (
              <label key={id} className="avatar-opt">
                <input type="radio" name="avatar_style" value={id} defaultChecked={u.avatar_style === id} />
                {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI */}
                <img src={avatarDataUri(id, u.avatar_seed, u.name)} width={56} height={56} alt="" />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <label className="field">Avatar word<input name="avatar_seed" maxLength={40} defaultValue={u.avatar_seed === u.id ? '' : u.avatar_seed} placeholder="Any word; each one draws a different face" /></label>
          <label className="field">About you<textarea name="bio" maxLength={280} rows={3} defaultValue={u.bio} placeholder="Where you usually travel, or anything you want crew to know" /></label>
          <ThemePicker presets={[...THEME_PRESETS]} value={u.theme_palette} platform={platform} allowDefault />
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
