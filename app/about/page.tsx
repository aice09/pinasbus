import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'About us' };

export default function About() {
  return (
    <main className="narrow prose">
      <h1 className="page-h">About BikolBus</h1>
      <p className="lead">BikolBus is a booking service for the long road between Metro Manila and the Bicol peninsula: the overnight runs to Naga and Legazpi, the ferry connections to Catanduanes and Masbate, and the morning buses home.</p>
      <h2>Why we built it</h2>
      <p>Buying a provincial bus ticket used to mean a trip to the terminal days ahead, or a phone call and a hope. We wanted booking a seat home to feel as simple as ordering a ride: see the real bus, pick the exact seat, pay with the wallet already on your phone, and walk on with a reference number.</p>
      <h2>What we do</h2>
      <ul>
        <li>Seat booking for every class, from lie-flat sleeper berths to open-window coaches, with the real layout and restroom shown before you pay.</li>
        <li>Padala on the same buses, with tracking from drop-off to claim.</li>
        <li>Accounts that remember the people you travel with and the routes you take.</li>
      </ul>
      <h2>How we handle your data</h2>
      <p>We keep only what a ticket or a package needs, never store card numbers, and let you delete your account at any time. Read the <Link href="/privacy">privacy notice</Link>.</p>
      <p><Link className="btn" href="/trips">Find a trip</Link></p>
    </main>
  );
}
