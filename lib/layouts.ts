// Seat plans. x = column across the bus (0 = driver side), row = front to back (row 0 is the crew row),
// deck 0 = lower, 1 = upper. Layouts are stored per company (seat_layouts) and edited in the layout editor.
export const SEAT_KINDS = {
  regular: 'Regular',
  senior: 'Senior citizen priority',
  pwd: 'PWD accessible',
  priority: 'Priority',
  reserved: 'Reserved (held by the company)',
  driver: 'Driver',
  conductor: 'Conductor',
  crew: 'Crew',
  unavailable: 'Unavailable / maintenance',
} as const;
export type SeatKind = keyof typeof SEAT_KINDS;
export type Seat = { id: string; x: number; row: number; deck: 0 | 1; berth: boolean; kind: SeatKind };

/** Kinds a passenger can ever book online; the others are crew or held. */
export const PASSENGER_KINDS: SeatKind[] = ['regular', 'senior', 'pwd', 'priority'];

const crewRow = (driverX: number, conductorX: number): Seat[] => [
  { id: 'DRV', x: driverX, row: 0, deck: 0, berth: false, kind: 'driver' },
  { id: 'CND', x: conductorX, row: 0, deck: 0, berth: false, kind: 'conductor' },
];

/** Double-deck sleeper: berth pairs on both sides (L = lower, U = upper). */
function sleeper(positions: number): Seat[] {
  const seats: Seat[] = crewRow(0, 2);
  for (let n = 1; n <= positions; n++) {
    const left = n % 2 === 1;
    const row = 1 + Math.floor((n - 1) / 2);
    const x = left ? 0 : 2;
    seats.push({ id: `L${n}`, x, row, deck: 0, berth: true, kind: 'regular' }, { id: `U${n}`, x, row, deck: 1, berth: true, kind: 'regular' });
  }
  return seats;
}

/** Seated coach: `cols` are the occupied columns (the gap is the aisle), numbered across each row. */
function coach(total: number, cols: number[]): Seat[] {
  const seats: Seat[] = crewRow(cols[0], cols[cols.length - 1]);
  for (let n = 1; n <= total; n++) {
    const i = n - 1;
    seats.push({ id: String(n), x: cols[i % cols.length], row: 1 + Math.floor(i / cols.length), deck: 0, berth: false, kind: 'regular' });
  }
  return seats;
}

/** Template layouts for the classes seen in the source data; the front seats are priority seats. */
export function layoutFor(busClass: string, seats: number): Seat[] {
  const s = (() => {
    switch (busClass) {
      case 'sleeper22': return sleeper(11);
      case 'sleeper20': return sleeper(10);
      case 'royal': return sleeper(14);
      case 'elite':
      case 'skybus': return coach(seats, [0, 1, 3]);
      case 'regular': return coach(seats, [0, 1, 3, 4]);
      default: return coach(seats, [0, 1, 3, 4, 5]);
    }
  })();
  const mark = (id: string, kind: SeatKind) => { const x = s.find((q) => q.id === id); if (x) x.kind = kind; };
  if (s[2].berth) { mark('L1', 'pwd'); mark('L2', 'senior'); } else { mark('1', 'pwd'); mark('2', 'senior'); mark('3', 'priority'); }
  return s;
}

export const passengerSeats = (layout: Seat[]) => layout.filter((s) => PASSENGER_KINDS.includes(s.kind) || s.kind === 'reserved');

/** "L3" -> "Lower berth 3", "U4" -> "Upper berth 4", "12" -> "Seat 12". */
export const seatName = (id: string) =>
  id === 'DRV' ? 'Driver' : id === 'CND' ? 'Conductor' :
  /^L\d+$/.test(id) ? `Lower berth ${id.slice(1)}` : /^U\d+$/.test(id) ? `Upper berth ${id.slice(1)}` : `Seat ${id}`;

/** Validates a layout coming from the editor. Returns an error message or null. */
export function checkLayout(seats: unknown): string | null {
  if (!Array.isArray(seats) || seats.length === 0 || seats.length > 120) return 'A layout needs 1 to 120 positions.';
  const ids = new Set<string>(), cells = new Set<string>();
  for (const s of seats as Seat[]) {
    if (typeof s?.id !== 'string' || !/^[A-Z0-9]{1,5}$/.test(s.id)) return `Seat label "${s?.id}" must be 1-5 letters or digits.`;
    if (!Number.isInteger(s.x) || !Number.isInteger(s.row) || s.x < 0 || s.x > 7 || s.row < 0 || s.row > 25) return `Seat ${s.id} is outside the grid.`;
    if (s.deck !== 0 && s.deck !== 1) return `Seat ${s.id} has an unknown deck.`;
    if (!(s.kind in SEAT_KINDS)) return `Seat ${s.id} has an unknown type.`;
    if (ids.has(s.id)) return `Seat label ${s.id} is used twice.`;
    const cell = `${s.deck}:${s.x}:${s.row}`;
    if (cells.has(cell)) return `Two seats share one spot (${s.id}).`;
    ids.add(s.id); cells.add(cell);
  }
  if (!(seats as Seat[]).some((s) => PASSENGER_KINDS.includes(s.kind))) return 'Add at least one passenger seat.';
  return null;
}
