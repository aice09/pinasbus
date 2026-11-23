import type { Metadata, Viewport } from 'next';
import { Archivo, Atkinson_Hyperlegible } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const display = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-display' });
const body = Atkinson_Hyperlegible({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-body' });

export const metadata: Metadata = {
  title: { default: 'BikolBus: book a bus seat to Bicol', template: '%s · BikolBus' },
  description: 'Book bus seats from Manila to Naga, Legazpi, Gubat, Virac, Masbate and more. Choose your seat on a 3D bus and pay with GCash, Maya or card.',
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0f1f18' }, { color: '#1f4d3a' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <header className="topbar">
          <Link href="/" className="brand" aria-label="BikolBus home">
            <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path d="M3 26 L16 5 L29 26 Z" fill="currentColor" /><path d="M11 13.5 L16 5 L21 13.5 Q16 11 11 13.5Z" fill="var(--paper)" /></svg>
            BikolBus
          </Link>
          <nav aria-label="Main">
            <Link href="/trips">All trips</Link>
            <Link href="/#fares">Fares</Link>
            <Link href="/#rules">Travel rules</Link>
          </nav>
        </header>
        {children}
        <footer className="footer">
          <p>Fares are per seat and include the online convenience fee shown at checkout. Student, senior citizen and PWD discounts are given at terminal ticket booths.</p>
          <p>Payments are processed by PayMongo. BikolBus never sees your card number.</p>
        </footer>
      </body>
    </html>
  );
}
