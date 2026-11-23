import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy notice' };

export default function Privacy() {
  return (
    <main className="narrow prose">
      <h1 className="page-h">Privacy notice</h1>
      <p className="note">Effective 23 November 2026. Written to meet the Data Privacy Act of 2012 (Republic Act No. 10173).</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Bookings:</strong> passenger names per seat, a contact name, email and mobile number, the trip and seats.</li>
        <li><strong>Padala:</strong> sender and recipient names and mobile numbers, sender email, package description, weight and declared value.</li>
        <li><strong>Accounts:</strong> your name, email, mobile number, a one-way hash of your password, and the passengers you choose to save.</li>
        <li><strong>Payments:</strong> handled by PayMongo. We receive the payment status and reference, never your card number or wallet login.</li>
      </ul>
      <h2>Why we use it</h2>
      <p>To issue and check tickets, deliver packages, send receipts, answer your messages, prevent fraud, and meet tax and transport rules. We do not sell your data or use it for advertising.</p>
      <h2>Who sees it</h2>
      <p>Our terminal and support staff, PayMongo for payments, and authorities when the law requires. The public tracking page shows only first names and last initials.</p>
      <h2>How long we keep it</h2>
      <p>Booking and payment records are kept for 10 years for accounting. Saved passengers are kept until you delete them or your account.</p>
      <h2>Your rights</h2>
      <p>You can see and correct your data in <Link href="/account">your account</Link>, delete saved passengers at any time, and delete your account in Settings. For a copy of your data or any other request, <Link href="/contact">contact us</Link>.</p>
    </main>
  );
}
