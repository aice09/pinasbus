import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { attachCheckout, cancelHold, hold, SeatsTaken } from '@/lib/bookings';
import { bookable } from '@/lib/catalog';
import { q } from '@/lib/db';
import { PASSENGER_KINDS, seatName } from '@/lib/layouts';
import { createCheckout, paymentsConfigured } from '@/lib/paymongo';
import { seatPrice, segmentFare } from '@/lib/pricing';
import { allow, clientIp } from '@/lib/ratelimit';
import { isCategory, PASSENGER_CATEGORIES, seatAllowed, type PassengerCategory } from '@/lib/seatpolicy';
import { availability, discountsOf, legOf, stopTime, tripById } from '@/lib/trips';

const Body = z.object({
  tripId: z.string().uuid(),
  pickup: z.string().max(80),
  dropoff: z.string().max(80),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  phone: z.string().trim().regex(/^(\+63|0)9\d{9}$/, 'Use a PH mobile number, e.g. 09171234567'),
  seats: z.array(z.object({
    seat: z.string().max(5), name: z.string().trim().max(80).default(''), category: z.string(), profileId: z.string().uuid().optional(),
    idType: z.string().trim().max(40).default(''), idLast4: z.string().trim().max(4).default(''),
  })).min(1).max(6),
});

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(process.env.PUBLIC_BASE_URL ?? req.nextUrl.origin).origin) return bad('Bad origin.', 403);
  if (!allow('book:' + clientIp(req), 10, 60_000)) return bad('Too many attempts. Wait a minute and try again.', 429);
  if (!paymentsConfigured()) return bad('Online payment is not available yet.', 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? 'Check the form and try again.');
  const b = parsed.data;

  const trip = await tripById(b.tripId);
  if (!trip || trip.status === 'cancelled') return bad('That trip is not running.', 404);
  const leg = legOf(trip, b.pickup, b.dropoff);
  if (!leg) return bad('Choose a pick-up and a later drop-off on this trip.');
  if (!bookable(stopTime(trip, leg.i) ?? new Date(trip.departs_at)) || trip.status !== 'scheduled') return bad('Online booking for this departure is closed.');

  const user = await currentUser();
  const profiles = user ? await q<{ id: string; full_name: string; category: PassengerCategory }>('select id, full_name, category from passengers where user_id = $1', [user.id]) : [];
  const { released } = await availability(trip);
  const segment = segmentFare(trip, leg.i, leg.j);
  if (segment <= 0) return bad('This route has no fare between those stops.');
  const discounts = discountsOf(trip);

  const seen = new Set<string>();
  const passengers = [];
  for (const s of b.seats) {
    const seat = trip.seats.find((x) => x.id === s.seat);
    if (!seat || !PASSENGER_KINDS.includes(seat.kind) || seen.has(s.seat)) return bad('Choose seats from the seat plan.');
    seen.add(s.seat);
    const profile = s.profileId ? profiles.find((x) => x.id === s.profileId) : undefined;
    const category = (profile?.category ?? s.category) as PassengerCategory;
    if (!isCategory(category)) return bad('Choose a passenger type.');
    if (!seatAllowed(seat.kind, category, released.includes(seat.id))) return bad(`${seatName(seat.id)} is reserved for eligible passengers. Pick another seat or change the passenger type.`);
    if (['senior', 'pwd', 'student'].includes(category) && (!s.idType || !/^[A-Z0-9]{4}$/i.test(s.idLast4)))
      return bad(`${PASSENGER_CATEGORIES[category]} fares need the ID type and its last 4 characters for ${seatName(seat.id)}.`);
    const price = seatPrice(segment, discounts, category);
    passengers.push({ seat: seat.id, name: profile?.full_name ?? (s.name || b.name), category, fare: price.fare, fee: price.fee, id_type: s.idType, id_last4: s.idLast4.toUpperCase() });
  }
  const fare = passengers.reduce((a, p) => a + p.fare, 0), fee = passengers.reduce((a, p) => a + p.fee, 0);

  let booking;
  try {
    booking = await hold({
      org_id: trip.org_id, trip_uuid: trip.id, trip_id: trip.code, travel_date: trip.service_date, pickup: b.pickup, dropoff: b.dropoff,
      seats: passengers.map((p) => p.seat), name: b.name, email: b.email, phone: b.phone,
      fare_centavos: fare, fee_centavos: fee, total_centavos: fare + fee, user_id: user?.id ?? null, passengers,
    });
  } catch (e) {
    if (e instanceof SeatsTaken) return NextResponse.json({ error: 'Someone just took one of those seats. Pick again.', taken: (await availability(trip)).taken }, { status: 409 });
    throw e;
  }

  const base = process.env.PUBLIC_BASE_URL ?? req.nextUrl.origin;
  try {
    const checkout = await createCheckout({
      ref: booking.ref,
      description: `${trip.org_name}: ${trip.class_name} ${trip.code}, ${b.pickup} to ${b.dropoff}, ${trip.service_date}, ${passengers.map((p) => seatName(p.seat)).join(', ')}`,
      lineItems: [
        ...passengers.map((p) => ({ name: `${seatName(p.seat)}, ${PASSENGER_CATEGORIES[p.category]} fare`, amount: p.fare, quantity: 1 })),
        { name: 'Online convenience fee', amount: fee, quantity: 1 },
      ],
      billing: { name: b.name, email: b.email, phone: b.phone },
      successUrl: `${base}/booking/${booking.ref}`,
      cancelUrl: `${base}/booking/${booking.ref}?cancelled=1`,
    });
    await attachCheckout(booking.id, checkout.id);
    return NextResponse.json({ ref: booking.ref, checkoutUrl: checkout.url });
  } catch (e) {
    console.error('checkout create failed', booking.ref, (e as Error).message);
    await cancelHold(booking.id);
    return bad('The payment page could not be opened. Your seats were released; try again.', 502);
  }
}
