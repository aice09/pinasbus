import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { signIn } from '@/app/actions/auth';
import { currentUser, safeNext } from '@/lib/auth';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; changed?: string }> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect(safeNext(sp.next));
  return (
    <main className="narrow">
      <h1 className="page-h">Sign in</h1>
      <p className="lead">See your trips and Padala, rebook a route, and fill in saved passengers in one tap.</p>
      {sp.changed && <p className="ok" role="status">Password changed. Sign in with your new password.</p>}
      <div className="panel">
        <ActionForm action={signIn} submit="Sign in" pending="Signing in…">
          <input type="hidden" name="next" value={safeNext(sp.next)} />
          <label className="field">Email<input name="email" type="email" required autoComplete="email" /></label>
          <label className="field">Password<input name="password" type="password" required autoComplete="current-password" /></label>
        </ActionForm>
      </div>
      <p className="note">New here? <Link href={`/signup?next=${encodeURIComponent(safeNext(sp.next))}`}>Create an account</Link>. Forgot your password? <Link href="/contact">Contact us</Link> and we will reset it.</p>
    </main>
  );
}
