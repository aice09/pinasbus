// Bus classes, pricing and date helpers. Trips live in the database (lib/routes.ts), seeded from data/trips.json.
import { layoutFor, type Seat } from './layouts.ts';

export type BusClassId = 'sleeper22' | 'sleeper20' | 'elite' | 'skybus' | 'regular' | 'nonac';

export type BusClass = {
  id: BusClassId;
  name: string;
  seats: number;
  layout: Seat[];
  amenities: string[];
  blurb: string;
};

const cls = (id: BusClassId, name: string, seats: number, amenities: string[], blurb: string): BusClass => ({
  id, name, seats, layout: layoutFor(id, seats), amenities, blurb,
});

export const BUS_CLASSES: Record<BusClassId, BusClass> = {
  sleeper22: cls('sleeper22', 'Ultimate Sleeper', 22, ['Aircon', 'Lie-flat berth', 'TV', 'Restroom'], 'Lie-flat berths on two decks, with a curtain for each.'),
  sleeper20: cls('sleeper20', 'Regular Sleeper', 20, ['Aircon', 'Lie-flat berth', 'Restroom'], 'Two-deck berths for overnight runs.'),
  elite: cls('elite', 'Elite 26', 25, ['Aircon', '2+1 recliners', 'Restroom'], 'Wide 2+1 recliners with extra legroom.'),
  skybus: cls('skybus', 'Skybus with CR', 36, ['Aircon', '2+1 seats', 'Restroom'], '2+1 seating with an on-board restroom.'),
  regular: cls('regular', 'Regular Aircon', 47, ['Aircon', '2+2 seats'], 'Standard 2+2 aircon coach, no restroom.'),
  nonac: cls('nonac', 'Non-Aircon', 57, ['Open windows', '2+3 seats'], 'The lowest fare, 2+3 seats with open windows.'),
};

export const METRO_MANILA = ['EDSA Cubao', 'Aurora Cubao', 'Arcovia Pasig', 'Avenida', 'Ermita', 'PITX', 'Alabang', 'Alabang Starmall', 'Turbina'];

export type Trip = {
  id: string;
  code: string;
  dir: 'south' | 'north';
  busClass: BusClassId;
  fare: number; // pesos per seat
  pickups: { station: string; time: string }[]; // time = HH:MM, Asia/Manila
  dropoffs: string[];
  active: boolean;
};

export const hasRestroom = (c: BusClass) => c.amenities.includes('Restroom');

/** Every pick-up -> the drop-offs reachable from it on an active trip. Drives the From/To selects. */
export function network(trips: Trip[]) {
  const pairs: Record<string, string[]> = {};
  for (const t of trips) for (const p of t.pickups) pairs[p.station] = [...new Set([...(pairs[p.station] ?? []), ...t.dropoffs])].sort();
  const pickups = Object.keys(pairs).sort();
  const dropoffs = [...new Set(Object.values(pairs).flat())].sort();
  return { pairs, pickups, dropoffs };
}

export const connects = (trips: Trip[], from: string, to: string) =>
  trips.some((t) => t.pickups.some((p) => p.station === from) && t.dropoffs.includes(to));

export function matchTrips(trips: Trip[], from?: string, to?: string) {
  return trips.filter((t) => (!from || t.pickups.some((p) => p.station === from)) && (!to || t.dropoffs.includes(to)));
}

/** Fare in centavos plus the operator's online convenience fee (5.2% + PHP 16 per seat, as charged on the source site). */
export function price(farePesos: number, seats: number) {
  const fare = farePesos * 100;
  const fee = Math.round(fare * 0.052) + 1600;
  return { fare: fare * seats, fee: fee * seats, total: (fare + fee) * seats, perSeat: fare + fee };
}

export const peso = (centavos: number) =>
  'PHP ' + (centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Today's date in Manila as YYYY-MM-DD, and minutes since midnight. */
export function manilaNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export const BOOKING_WINDOW_DAYS = 60;

export function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A departure can be booked until 60 minutes before it leaves its first pick-up point. */
export function isBookable(trip: Trip, date: string, now = new Date()) {
  const { date: today, minutes } = manilaNow(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > addDays(today, BOOKING_WINDOW_DAYS)) return false;
  if (date > today) return true;
  const [h, m] = trip.pickups[0].time.split(':').map(Number);
  return h * 60 + m - 60 > minutes;
}

export const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
