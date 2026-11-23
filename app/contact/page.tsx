import type { Metadata } from 'next';
import { sendMessage } from '@/app/actions/public';
import { currentUser } from '@/lib/auth';
import { ActionForm } from '@/components/ActionForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Contact us' };

export default async function Contact() {
  const u = await currentUser();
  return (
    <main className="narrow">
      <h1 className="page-h">Contact us</h1>
      <p className="lead">Questions about a booking, a Padala package, a refund or your account. Include your BB or PD reference number if you have one. We reply by email within one working day.</p>
      <div className="panel">
        <ActionForm action={sendMessage} submit="Send message" pending="Sending…" reset>
          <div className="row2">
            <label className="field">Name<input name="name" required maxLength={80} defaultValue={u?.name} autoComplete="name" /></label>
            <label className="field">Email<input name="email" type="email" required maxLength={120} defaultValue={u?.email} autoComplete="email" /></label>
          </div>
          <label className="field">Subject<input name="subject" required maxLength={120} placeholder="Refund for BB…" /></label>
          <label className="field">Message<textarea name="body" required minLength={10} maxLength={4000} rows={6} /></label>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
        </ActionForm>
      </div>
    </main>
  );
}
