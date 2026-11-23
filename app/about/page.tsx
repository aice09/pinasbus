import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'About us' };

export default function About() {
  return (
    <main className="narrow prose">
      <h1 className="page-h">About PINASBUS</h1>
      <p className="lead">PINASBUS is one booking platform for Philippine bus companies. Each company runs its own fleet, routes, fares and staff in its own workspace; passengers compare them all in one search, pick an exact seat and pay online.</p>
      <h2>Why we built it</h2>
      <p>Buying a provincial bus ticket used to mean a trip to the terminal days ahead, or a phone call and a hope. We wanted booking a seat home to feel as simple as ordering a ride: see the real bus, pick the exact seat, pay with the wallet already on your phone, and walk on with a reference number.</p>
      <h2>What we do</h2>
      <ul>
        <li>Seat booking for every class, from lie-flat sleeper berths to open-window coaches, with the real layout and restroom shown before you pay.</li>
        <li>Senior citizen and PWD seats and discounts built into every seat plan, with a published release policy.</li>
        <li>Padala on the same buses, with tracking from drop-off to claim.</li>
        <li>For bus companies: fleet and seat layouts, routes and schedules, dispatch, terminal sales, manifests, reports and an audit log, with fixed roles for every crew member.</li>
        <li>Accounts that remember the people you travel with and the routes you take.</li>
      </ul>
      <h2 id="data">Where the data comes from</h2>
      <p>This is a demonstration. The bus companies listed have no agreement with PINASBUS; we use their public information so the platform can be tried with real routes:</p>
      <ul>
        <li><strong>Isarog Line, Peñafrancia Tours, Legaspi St. Jude Transport Lines and RSL Bus:</strong> trip codes, departure times, bus classes and fares from the public trip search on bicolisarog.com, checked on 23 November 2026.</li>
        <li><strong>Victory Liner:</strong> terminal names, addresses and bus classes from Wikipedia, checked on 24 November 2026. Victory Liner&apos;s fare and schedule page was unavailable, so its times and fares here are <em>indicative demonstration values</em>, marked as such wherever they appear.</li>
        <li><strong>Roads and ferries:</strong> the expressways, highways and ferry crossings shown on routes are the usual roads between those places, not operator-confirmed itineraries.</li>
      </ul>
      <p>Every company page and route shows its source and the date it was checked. Always confirm times and fares with the bus company before you travel.</p>
      <h2>How we handle your data</h2>
      <p>We keep only what a ticket or a package needs, never store card numbers, and let you delete your account at any time. Read the <Link href="/privacy">privacy notice</Link>.</p>
      <p><Link className="btn" href="/trips">Find a trip</Link></p>
    </main>
  );
}
