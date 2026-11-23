import type { Metadata } from 'next';
import { requestReset } from '@/app/actions/auth';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Forgot your password' };

export default function Forgot() {
  return (
    <main className="narrow">
      <h1 className="page-h">Reset your password</h1>
      <p className="lead">Enter the email you signed up with. We send a link that works for 30 minutes.</p>
      <div className="panel">
        <ActionForm action={requestReset} submit="Send reset link" pending="Sending…">
          <label className="field">Email<input name="email" type="email" required autoComplete="email" /></label>
        </ActionForm>
      </div>
    </main>
  );
}
