import type { Metadata, Viewport } from 'next';
import { Archivo, Atkinson_Hyperlegible } from 'next/font/google';
import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import './globals.css';

const display = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-display' });
const body = Atkinson_Hyperlegible({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-body' });

export const metadata: Metadata = {
  title: { default: 'PINASBUS: bus tickets across the Philippines', template: '%s · PINASBUS' },
  description: 'One place to compare and book provincial and intercity buses in the Philippines: pick your seat on a 3D bus, pay with GCash, Maya or card.',
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0f1f18' }, { color: '#1f4d3a' }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  const ops = user?.memberships.filter((m) => m.org_kind === 'bus_operator') ?? [];
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <p className="demo-banner" role="note">
          Demonstration platform. Bus companies shown are listed with public data and are not affiliated with PINASBUS. <Link href="/about#data">Where the data comes from</Link>
        </p>
        <header className="topbar">
          <Link href="/" className="brand" aria-label="PINASBUS home">
            <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect x="3" y="7" width="26" height="17" rx="4" fill="currentColor" /><rect x="6" y="10" width="20" height="6" rx="1.5" fill="var(--paper)" /><circle cx="10" cy="26" r="2.6" fill="currentColor" /><circle cx="22" cy="26" r="2.6" fill="currentColor" /></svg>
            PINASBUS
          </Link>
          <nav aria-label="Main" className="mainnav">
            <Link href="/trips">Trips</Link>
            <Link href="/operators">Bus companies</Link>
            <Link href="/routes">Routes</Link>
            <Link href="/padala">Padala</Link>
            <Link href="/help">Help</Link>
          </nav>
          <nav aria-label="Account" className="accountnav">
            {user ? (
              <>
                {user.platform_role === 'platform_admin' && <Link href="/platform">Platform</Link>}
                {ops.length === 1 && <Link href={`/ops/${ops[0].org_slug}`}>{ops[0].org_name.split(' (')[0]}</Link>}
                {ops.length > 1 && <Link href="/account#work">My companies</Link>}
                <Link href="/account" className="btn quiet small">{user.name.split(' ')[0]}</Link>
              </>
            ) : (
              <>
                <Link href="/login">Sign in</Link>
                <Link href="/signup" className="btn small">Create account</Link>
              </>
            )}
          </nav>
        </header>
        <div id="main">{children}</div>
        <footer className="footer">
          <div className="footer-cols">
            <div>
              <h2 className="footer-h">PINASBUS</h2>
              <p>One booking platform for Philippine bus companies: compare departures, choose your seat, pay online, and track your trip.</p>
            </div>
            <nav aria-label="Travel">
              <h2 className="footer-h">Travel</h2>
              <Link href="/trips">Find a trip</Link><Link href="/routes">Routes and schedules</Link><Link href="/terminals">Terminals</Link><Link href="/operators">Bus companies</Link>
            </nav>
            <nav aria-label="Padala">
              <h2 className="footer-h">Padala</h2>
              <Link href="/padala">Send a package</Link><Link href="/padala/track">Track a package</Link>
            </nav>
            <nav aria-label="Company">
              <h2 className="footer-h">PINASBUS</h2>
              <Link href="/about">About</Link><Link href="/help">Help and FAQ</Link><Link href="/contact">Contact us</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link>
            </nav>
          </div>
          <p className="note">Payments are processed by PayMongo; PINASBUS never sees your card number. Fares marked “indicative” are demonstration values, not published fares.</p>
        </footer>
      </body>
    </html>
  );
}
