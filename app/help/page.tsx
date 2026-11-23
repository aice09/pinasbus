import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Help and FAQ' };

const FAQ: { q: string; a: React.ReactNode }[] = [
  { q: 'How do I book a seat?', a: <>Search your route on the <Link href="/">home page</Link>, choose a departure, tap your seats on the 3D bus or the seat plan, fill in the passenger details and pay. Your ticket page opens when payment succeeds.</> },
  { q: 'Which payment methods can I use?', a: 'GCash, Maya, and Visa or Mastercard cards, through PayMongo’s secure checkout. BikolBus never sees your card number.' },
  { q: 'What do L and U mean on sleeper buses?', a: 'L is a lower berth and U is an upper berth directly above it. Lower berths are easier to get in and out of; upper berths are quieter. Use “Lift the upper deck” in the 3D view to see both.' },
  { q: 'Does my bus have a restroom?', a: <>Every trip shows “With CR” or “No CR”. The Ultimate Sleeper, Regular Sleeper, Elite 26 and Skybus have one at the back; Regular Aircon and Non-Aircon buses make rest stops. See <Link href="/fleet">our buses</Link>.</> },
  { q: 'How long are seats held?', a: '15 minutes from the moment you press Pay. If payment doesn’t finish in time, the seats go back on sale and you can book again.' },
  { q: 'I paid but my ticket says waiting for payment.', a: 'Refresh the ticket page after a minute; it checks with PayMongo again. If it still doesn’t change, contact us with your reference number.' },
  { q: 'Can I get a student, senior or PWD discount online?', a: 'Discounts are given only at terminal ticket booths, where staff check your ID.' },
  { q: 'Can I change or cancel my booking?', a: 'Online tickets can be rebooked at a terminal booth up to 4 hours before departure, subject to the rebooking fee. Use “Book again” in your account to make a new booking on the same route.' },
  { q: 'How do saved passengers work?', a: <>Create an account, add family members or companions in <Link href="/account/passengers">Saved passengers</Link>, then pick who sits in each seat when you book. Only you can see them, and you can edit or delete them at any time.</> },
  { q: 'How does Padala work?', a: <>Book and pay on the <Link href="/padala">Padala page</Link>, drop the package at your origin terminal within 3 days, and the recipient claims it at the destination terminal with a valid ID. Track it with the PD reference.</> },
  { q: 'I forgot my password.', a: <>Use the <Link href="/contact">contact form</Link> with the email you signed up with, and we will reset it.</> },
];

export default function Help() {
  return (
    <main className="narrow">
      <h1 className="page-h">Help and FAQ</h1>
      <div className="faq">
        {FAQ.map((f) => (
          <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
        ))}
      </div>
      <p className="note">Still stuck? <Link href="/contact">Send us a message</Link>.</p>
    </main>
  );
}
