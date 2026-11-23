import type { Metadata, Viewport } from 'next';
import { Archivo, Atkinson_Hyperlegible } from 'next/font/google';
import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import './globals.css';

const display = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-display' });
const body = Atkinson_Hyperlegible({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-body' });

export const metadata: Metadata = {
  title: { default: 'BikolBus: bus tickets and Padala between Manila and Bicol', template: '%s · BikolBus' },
  description: 'Book bus seats from Manila to Naga, Legazpi, Gubat, Virac, Masbate and more, and send Padala packages on the same buses. Pick your seat on a 3D bus and pay with GCash, Maya or card.',
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0f1f18' }, { color: '#1f4d3a' }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="topbar">
          <Link href="/" className="brand" aria-label="BikolBus home">
            <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path d="M3 26 L16 5 L29 26 Z" fill="currentColor" /><path d="M11 13.5 L16 5 L21 13.5 Q16 11 11 13.5Z" fill="var(--paper)" /></svg>
            BikolBus
          </Link>
          <nav aria-label="Main" className="mainnav">
            <Link href="/trips">Trips</Link>
            <Link href="/padala">Padala</Link>
            <Link href="/routes">Routes</Link>
            <Link href="/fleet">Our buses</Link>
            <Link href="/help">Help</Link>
          </nav>
          <nav aria-label="Account" className="accountnav">
            {user ? (
              <>
                {user.role === 'admin' && <Link href="/admin">Admin</Link>}
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
              <h2 className="footer-h">BikolBus</h2>
              <p>Bus seats and Padala between Metro Manila and Bicol: Camarines Sur, Albay, Sorsogon, Catanduanes and Masbate.</p>
            </div>
            <nav aria-label="Travel">
              <h2 className="footer-h">Travel</h2>
              <Link href="/trips">Find a trip</Link><Link href="/routes">Routes and schedules</Link><Link href="/terminals">Terminals</Link><Link href="/fleet">Our buses</Link>
            </nav>
            <nav aria-label="Padala">
              <h2 className="footer-h">Padala</h2>
              <Link href="/padala">Send a package</Link><Link href="/padala/track">Track a package</Link>
            </nav>
            <nav aria-label="Company">
              <h2 className="footer-h">Company</h2>
              <Link href="/about">About us</Link><Link href="/help">Help and FAQ</Link><Link href="/contact">Contact us</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link>
            </nav>
          </div>
          <p className="note">Fares are per seat and include the online convenience fee shown at checkout. Student, senior citizen and PWD discounts are given at terminal ticket booths. Payments are processed by PayMongo; BikolBus never sees your card number.</p>
        </footer>
      </body>
    </html>
  );
}
