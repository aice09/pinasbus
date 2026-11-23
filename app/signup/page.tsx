import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { signUp } from '@/app/actions/auth';
import { currentUser, safeNext } from '@/lib/auth';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect(safeNext(sp.next));
  return (
    <main className="narrow">
      <h1 className="page-h">Create your account</h1>
      <ul className="perks">
        <li>Save passengers once, for family and travel companions, and pick them when you book.</li>
        <li>Keep every ticket and Padala receipt in one place.</li>
        <li>Book the same route again with a new date in two taps.</li>
      </ul>
      <div className="panel">
        <ActionForm action={signUp} submit="Create account" pending="Creating your account…">
          <input type="hidden" name="next" value={safeNext(sp.next)} />
          <label className="field">Full name (as on your ID)<input name="name" required minLength={2} maxLength={80} autoComplete="name" /></label>
          <label className="field">Email<input name="email" type="email" required maxLength={120} autoComplete="email" /></label>
          <label className="field">Mobile number<input name="phone" type="tel" required placeholder="09171234567" autoComplete="tel" /></label>
          <label className="field">Password<input name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" aria-describedby="pw-hint" /></label>
          <p id="pw-hint" className="note">At least 10 characters. A short sentence is easy to remember and hard to guess.</p>
          <label className="check"><input type="checkbox" name="agree" required /> I accept the <Link href="/terms">terms</Link> and the <Link href="/privacy">privacy notice</Link>.</label>
        </ActionForm>
      </div>
      <p className="note">Already have an account? <Link href={`/login?next=${encodeURIComponent(safeNext(sp.next))}`}>Sign in</Link>.</p>
    </main>
  );
}
