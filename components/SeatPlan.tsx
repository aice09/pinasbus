'use client';
import { PASSENGER_KINDS, SEAT_KINDS, seatName, type Seat } from '@/lib/layouts';

export type SeatViewProps = {
  layout: Seat[]; taken: Set<string>; released?: Set<string>; selected: string[]; onToggle: (id: string) => void; restroom: boolean;
};

const BADGE: Partial<Record<Seat['kind'], string>> = { pwd: '♿', senior: 'SC', priority: 'P', reserved: 'R', driver: 'Driver', conductor: 'Crew', crew: 'Crew', unavailable: '✕' };

export const seatLabel = (s: Seat, taken: boolean, released: boolean, selected: boolean) =>
  `${seatName(s.id)}${s.kind !== 'regular' ? `, ${SEAT_KINDS[s.kind]}${released ? ' (now open to all)' : ''}` : ''}${taken ? ', taken' : selected ? ', selected' : ''}`;

/** Keyboard- and screen-reader-friendly seat plan; one grid per deck, crew row at the front, CR where the bus has one. */
export function SeatPlan({ layout, taken, released = new Set(), selected, onToggle, restroom }: SeatViewProps) {
  const decks = [0, 1].filter((d) => layout.some((s) => s.deck === d));
  const sleeper = layout.some((s) => s.berth);
  const cols = Math.max(...layout.map((s) => s.x)) + 1;
  const seatRows = Math.max(...layout.map((s) => s.row)) + 1;
  const rows = restroom && !sleeper ? seatRows + 1 : seatRows;
  return (
    <div className="plan">
      {decks.map((deck) => (
        <section key={deck} className="deck" aria-label={sleeper ? (deck ? 'Upper deck, berths marked U' : 'Lower deck, berths marked L') : 'Seats'}>
          {sleeper && <h3>{deck ? 'Upper deck (U)' : 'Lower deck (L)'}</h3>}
          <div className="deck-grid" style={{ gridTemplateColumns: `repeat(${cols}, 44px)`, gridTemplateRows: `repeat(${rows}, auto)` }}>
            {layout.filter((s) => s.deck === deck).map((s) => {
              const style = { gridColumn: s.x + 1, gridRow: s.row + 1 };
              if (!PASSENGER_KINDS.includes(s.kind)) {
                return <div key={s.id} className={`seat static k-${s.kind}${s.berth ? ' berth' : ''}`} style={style} role="img" aria-label={seatLabel(s, false, false, false)}>{BADGE[s.kind] ?? s.id}</div>;
              }
              const isTaken = taken.has(s.id), isSel = selected.includes(s.id), rel = released.has(s.id);
              return (
                <button key={s.id} type="button" className={`seat k-${rel ? 'regular' : s.kind}${s.berth ? ' berth' : ''}`} style={style}
                  aria-pressed={isSel} disabled={isTaken} aria-label={seatLabel(s, isTaken, rel, isSel)} onClick={() => onToggle(s.id)}>
                  {s.berth && <small aria-hidden="true">{s.deck ? 'upper' : 'lower'}</small>}
                  {s.id}
                  {!rel && BADGE[s.kind] && <i aria-hidden="true">{BADGE[s.kind]}</i>}
                </button>
              );
            })}
            {restroom && deck === 0 && (
              <div className="cr" style={sleeper ? { gridColumn: cols, gridRow: rows } : { gridColumn: `${cols - 1} / span 2`, gridRow: rows }} role="img" aria-label="Restroom (CR)">CR</div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
