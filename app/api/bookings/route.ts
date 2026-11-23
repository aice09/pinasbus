import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { BUS_CLASSES, isBookable, price, time12, tripById } from '@/lib/catalog';
import { attachCheckout, cancelHold, hold, SeatsTaken, takenSeats } from '@/lib/bookings';
import { createCheckout, paymentsConfigured } from '@/lib/paymongo';
import { allow, clientIp } from '@/lib/ratelimit';

const Body = z.object({
  tripId: z.string().max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickup: z.string().max(60),
  dropoff: z.string().max(60),
  seats: z.array(z.string().max(5)).min(1).max(6),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  phone: z.string().trim().regex(/^(\+63|0)9\d{9}$/, 'Use a PH mobile number, e.g. 09171234567'),
});

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  if (!allow('book:' + clientIp(req), 10, 60_000)) return bad('Too many attempts. Wait a minute and try again.', 429);
  if (!paymentsConfigured()) return bad('Online payment is not available yet. Book at a terminal booth.', 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? 'Check the form and try again.');
  const b = parsed.data;

  const trip = tripById(b.tripId);
  if (!trip) return bad('That trip no longer exists.', 404);
  if (!isBookable(trip, b.date)) return bad('Online booking for this departure is closed.');
  const pickup = trip.pickups.find((p) => p.station === b.pickup);
  if (!pickup || !trip.dropoffs.includes(b.dropoff)) return bad('Choose a pick-up and drop-off on this route.');
  const cls = BUS_CLASSES[trip.busClass];
  const seats = [...new Set(b.seats)];
  if (seats.length !== b.seats.length || !seats.every((s) => cls.layout.some((l) => l.id === s))) return bad('Choose seats from the seat plan.');

  const p = price(trip.fare, seats.length);
  let booking;
  try {
    booking = await hold({
      trip_id: trip.id, travel_date: b.date, pickup: b.pickup, dropoff: b.dropoff, seats,
      name: b.name, email: b.email, phone: b.phone, fare_centavos: p.fare, fee_centavos: p.fee, total_centavos: p.total,
    });
  } catch (e) {
    if (e instanceof SeatsTaken) return NextResponse.json({ error: 'Someone just took one of those seats. Pick again.', taken: await takenSeats(trip.id, b.date) }, { status: 409 });
    throw e;
  }

  const base = process.env.PUBLIC_BASE_URL ?? req.nextUrl.origin;
  try {
    const perSeat = price(trip.fare, 1);
    const checkout = await createCheckout({
      ref: booking.ref,
      description: `${cls.name} trip ${trip.code}, ${b.pickup} ${time12(pickup.time)} to ${b.dropoff}, ${b.date}, seat ${seats.join(', ')}`,
      lineItems: [
        { name: `Fare, ${b.pickup} to ${b.dropoff} (${cls.name})`, amount: perSeat.fare, quantity: seats.length },
        { name: 'Online convenience fee', amount: perSeat.fee, quantity: seats.length },
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
