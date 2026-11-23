import type { Metadata } from 'next';
import { verifyMfa } from '@/app/actions/auth';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Two-step sign-in' };

export default function Mfa() {
  return (
    <main className="narrow">
      <h1 className="page-h">Enter your code</h1>
      <p className="lead">Open your authenticator app and enter the 6-digit code for PINASBUS.</p>
      <div className="panel">
        <ActionForm action={verifyMfa} submit="Sign in" pending="Checking…">
          <label className="field">Code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus /></label>
        </ActionForm>
      </div>
    </main>
  );
}
