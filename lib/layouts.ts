// Seat plans. x = column across the bus (0 = driver side), row = front to back, deck 0 = lower, 1 = upper.
export type Seat = { id: string; x: number; row: number; deck: 0 | 1; berth: boolean };

/** Double-deck sleeper: berth pairs on both sides (L = lower, U = upper), restroom at the back right. */
function sleeper(positions: number): Seat[] {
  const seats: Seat[] = [];
  for (let n = 1; n <= positions; n++) {
    const left = n % 2 === 1;
    const row = Math.floor((n - 1) / 2);
    const x = left ? 0 : 2;
    seats.push({ id: `L${n}`, x, row, deck: 0, berth: true }, { id: `U${n}`, x, row, deck: 1, berth: true });
  }
  return seats;
}

/** Seated coach: `cols` are the occupied columns (the gap is the aisle), numbered across each row. */
function coach(total: number, cols: number[]): Seat[] {
  const seats: Seat[] = [];
  for (let n = 1; n <= total; n++) {
    const i = n - 1;
    seats.push({ id: String(n), x: cols[i % cols.length], row: Math.floor(i / cols.length), deck: 0, berth: false });
  }
  return seats;
}

export function layoutFor(busClass: string, seats: number): Seat[] {
  switch (busClass) {
    case 'sleeper22': return sleeper(11);
    case 'sleeper20': return sleeper(10);
    case 'elite':
    case 'skybus': return coach(seats, [0, 1, 3]);
    case 'regular': return coach(seats, [0, 1, 3, 4]);
    default: return coach(seats, [0, 1, 3, 4, 5]);
  }
}

/** "L3" -> "Lower berth 3", "U4" -> "Upper berth 4", "12" -> "Seat 12". */
export const seatName = (id: string) =>
  id.startsWith('L') ? `Lower berth ${id.slice(1)}` : id.startsWith('U') ? `Upper berth ${id.slice(1)}` : `Seat ${id}`;
