// Pure fare maths shared by the server and the seat picker, so the price shown is the price charged.
import { discounted, type Discounts, type PassengerCategory } from './seatpolicy.ts';

type Stops = { fare: number }[];

/** Segment fare in centavos: cumulative fare at the drop-off minus at the pick-up, plus the schedule's adjustment. */
export function segmentFare(t: { stops: Stops; fare_adjust_pct: number | string }, i: number, j: number) {
  const pesos = Math.max(0, t.stops[j].fare - t.stops[i].fare);
  return Math.round(pesos * (100 + Number(t.fare_adjust_pct)));
}

/** Online convenience fee per seat: 5.2% + PHP 16 (the rate the source operators charge online). */
export const seatFee = (fareCentavos: number) => Math.round(fareCentavos * 0.052) + 1600;

/** Fare and fee for one seat after the passenger-category discount. Terminal sales pay no online fee. */
export function seatPrice(segment: number, d: Discounts, c: PassengerCategory, online = true) {
  const fare = discounted(segment, d, c);
  const fee = online ? seatFee(fare) : 0;
  return { fare, fee, total: fare + fee };
}
