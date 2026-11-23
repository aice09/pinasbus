// Accessible-seating policy engine. Pure functions; lib/trips.ts applies them and records releases in the audit log.
// The default numbers are placeholders each company configures. They are not legal advice: the applicable
// LTFRB / RA 9994 / RA 10754 rules must be validated before production (see docs/compliance.md).
import type { SeatKind } from './layouts.ts';

export const PASSENGER_CATEGORIES = {
  regular: 'Regular',
  senior: 'Senior citizen',
  pwd: 'Person with disability (PWD)',
  student: 'Student',
  child: 'Child',
} as const;
export type PassengerCategory = keyof typeof PASSENGER_CATEGORIES;
export const isCategory = (c: unknown): c is PassengerCategory => typeof c === 'string' && c in PASSENGER_CATEGORIES;

export type SeatPolicy = {
  /** Release unbooked priority seats to everyone this many hours before departure; 0 = never release. */
  releaseHoursBefore: number;
  /** Which seat kinds the release applies to. */
  releaseKinds: SeatKind[];
};
export type Discounts = Record<PassengerCategory, number>; // percent off the fare

export const DEFAULT_POLICY: SeatPolicy = { releaseHoursBefore: 2, releaseKinds: ['senior', 'pwd', 'priority'] };
export const DEFAULT_DISCOUNTS: Discounts = { regular: 0, senior: 20, pwd: 20, student: 20, child: 0 };

/** Who a seat is reserved for until it is released. Anyone may still pick a regular seat. */
const ELIGIBLE: Partial<Record<SeatKind, PassengerCategory[]>> = {
  pwd: ['pwd'],
  senior: ['senior'],
  priority: ['senior', 'pwd'],
};

export function releaseDue(policy: SeatPolicy, departsAt: Date, now = new Date()) {
  return policy.releaseHoursBefore > 0 && now.getTime() >= departsAt.getTime() - policy.releaseHoursBefore * 3600_000;
}

/** Can this passenger take this seat right now? `released` = the seat was opened up by the policy. */
export function seatAllowed(kind: SeatKind, category: PassengerCategory, released: boolean): boolean {
  if (kind === 'regular') return true;
  const eligible = ELIGIBLE[kind];
  if (!eligible) return false; // reserved, crew, unavailable
  return eligible.includes(category) || released;
}

export const discounted = (fareCentavos: number, d: Discounts, c: PassengerCategory) =>
  Math.round((fareCentavos * (100 - Math.min(100, Math.max(0, d[c] ?? 0)))) / 100);
