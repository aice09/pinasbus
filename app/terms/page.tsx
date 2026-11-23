import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of carriage and booking' };

export default function Terms() {
  return (
    <main className="narrow prose">
      <h1 className="page-h">Terms of carriage and booking</h1>
      <p className="note">Effective 23 November 2026.</p>
      <h2>Tickets</h2>
      <ul>
        <li>A ticket is valid only for the trip, date, seat and passenger shown on it. Bring a valid ID that matches the passenger name.</li>
        <li>Be at the pick-up point 30 minutes before departure. Passengers who miss the bus forfeit the fare.</li>
        <li>Online fares include a non-refundable convenience fee of 5.2% plus ₱16 per seat.</li>
        <li>Rebooking is done at a terminal booth up to 4 hours before departure, with a rebooking fee and any fare difference.</li>
        <li>If a trip is cancelled by us, you get a full refund to the account you paid with, or a free rebooking.</li>
      </ul>
      <h2>On board</h2>
      <ul>
        <li>Each ticket includes up to 20 kg of baggage. Excess baggage is charged at the terminal.</li>
        <li>Travel permits are required where government rules call for them. No permit, no ride.</li>
        <li>From 7 months of pregnancy you can&apos;t travel; up to 6 months you need an OB-Gynecologist “fit to travel” certificate.</li>
        <li>One infant (under 3 ft) or one small caged pet per adult. Pets need their own seat, anti-rabies proof, a vet travel permit and a diaper.</li>
      </ul>
      <h2>Padala</h2>
      <ul>
        <li>The sender is responsible for what is inside and for honest declaration. Prohibited items are refused.</li>
        <li>Liability for loss or damage is limited to the declared value covered by the valuation charge.</li>
        <li>Packages not dropped off within 3 days of payment may be cancelled; unclaimed packages are kept for 30 days.</li>
      </ul>
      <h2>Accounts</h2>
      <p>Keep your password private. You are responsible for bookings made from your account. We may suspend accounts used for fraud or abuse.</p>
    </main>
  );
}
