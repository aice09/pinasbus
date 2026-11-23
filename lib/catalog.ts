// Routes, bus classes and fares. Fares and schedules are copied from the operator's public trip search
// (scripts/parse.py + scripts/catalog.py regenerate data/trips.json).
import trips from '../data/trips.json' with { type: 'json' };
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

const BUS_NAME: Record<string, BusClassId> = {
  'Ultimate Sleeper Bus': 'sleeper22',
  'Regular Sleeper Bus': 'sleeper20',
  'ELITE 26': 'elite',
  'SKYBUS WITH CR': 'skybus',
  'REGULAR WITHOUT CR': 'regular',
  'NON-AIRCON': 'nonac',
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
};

export const TRIPS: Trip[] = (trips as { id: string; code: string; dir: string; bus: string; fare: number; pickups: Trip['pickups']; dropoffs: string[] }[]).map((t) => {
  const busClass = BUS_NAME[t.bus];
  if (!busClass) throw new Error(`unknown bus class ${t.bus} in data/trips.json`);
  return { id: t.id, code: t.code, dir: t.dir as Trip['dir'], busClass, fare: t.fare, pickups: t.pickups, dropoffs: t.dropoffs };
});

export const tripById = (id: string) => TRIPS.find((t) => t.id === id);

export const PICKUP_STATIONS = [...new Set(TRIPS.flatMap((t) => t.pickups.map((p) => p.station)))].sort();
export const DROPOFF_STATIONS = [...new Set(TRIPS.flatMap((t) => t.dropoffs))].sort();

/** Fare in centavos plus the operator's online convenience fee (5.2% + PHP 16 per seat, as charged on the source site). */
export function price(farePesos: number, seats: number) {
  const fare = farePesos * 100;
  const fee = Math.round(fare * 0.052) + 1600;
  return { fare: fare * seats, fee: fee * seats, total: (fare + fee) * seats, perSeat: fare + fee };
}

export const peso = (centavos: number) =>
  'PHP ' + (centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function matchTrips(from?: string, to?: string) {
  return TRIPS.filter((t) => (!from || t.pickups.some((p) => p.station === from)) && (!to || t.dropoffs.includes(to)));
}

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
