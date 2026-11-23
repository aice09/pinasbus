import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { confirmMfa, disableMfa, startMfaSetup } from '@/app/actions/account';
import { PRIVILEGED_ROLES, requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { open } from '@/lib/secretbox';
import { otpauthUri } from '@/lib/totp';
import { ActionForm } from '@/components/ActionForm';

export const metadata: Metadata = { title: 'Security' };

export default async function Security({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const u = await requireUser('/account/security');
  const { required } = await searchParams;
  const [row] = await q<{ mfa_secret: string | null }>('select mfa_secret from users where id = $1', [u.id]);
  const secret = row.mfa_secret && !u.mfa_enabled ? open(row.mfa_secret, `mfa:${u.id}`) : null;
  const qr = secret ? await QRCode.toDataURL(otpauthUri(secret, u.email), { margin: 1, width: 220 }) : null;
  const privileged = u.platform_role === 'platform_admin' || u.memberships.some((m) => PRIVILEGED_ROLES.includes(m.role));
  return (
    <>
      <h1 className="page-h">Security</h1>
      {required && !u.mfa_enabled && <p className="warnbox">Your role needs two-step sign-in. Set it up below to continue to your workspace.</p>}
      <section className="panel" aria-labelledby="mfa-h">
        <h2 id="mfa-h">Two-step sign-in</h2>
        <p>{u.mfa_enabled ? 'On. Signing in asks for a code from your authenticator app.' : 'Off. Turn it on to protect your account with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, and others).'}
          {privileged && ' Required for administrators and finance roles.'}</p>
        {!u.mfa_enabled && !secret && <ActionForm action={startMfaSetup} submit="Set up two-step sign-in"><span /></ActionForm>}
        {secret && qr && (
          <div className="mfa-setup">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code to add PINASBUS to your authenticator app" width={220} height={220} />
            <div className="stack">
              <p className="note">Can&apos;t scan? Enter this key in the app: <code className="mono">{secret.match(/.{1,4}/g)!.join(' ')}</code></p>
              <ActionForm action={confirmMfa} submit="Turn on">
                <label className="field">6-digit code from the app<input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required /></label>
              </ActionForm>
            </div>
          </div>
        )}
        {u.mfa_enabled && !privileged && (
          <ActionForm action={disableMfa} submit="Turn off" quiet confirm="Turn off two-step sign-in?">
            <label className="field">Current code<input name="code" inputMode="numeric" maxLength={7} required /></label>
          </ActionForm>
        )}
      </section>
    </>
  );
}
