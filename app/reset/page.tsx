import type { Metadata } from 'next';
import { resetPassword } from '@/app/actions/auth';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return (
    <main className="narrow">
      <h1 className="page-h">Choose a new password</h1>
      <div className="panel">
        <ActionForm action={resetPassword} submit="Save new password">
          <input type="hidden" name="token" value={token} />
          <label className="field">New password<input name="password" type="password" minLength={10} required autoComplete="new-password" /></label>
          <p className="note">At least 10 characters. Saving signs you out on every device.</p>
        </ActionForm>
      </div>
    </main>
  );
}
