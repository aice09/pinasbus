'use client';
import { seatName, type Seat } from '@/lib/layouts';

type Props = { layout: Seat[]; taken: Set<string>; selected: string[]; onToggle: (id: string) => void; restroom: boolean };

/** Keyboard- and screen-reader-friendly seat plan; one grid per deck, front at the top, CR where the bus has one. */
export function SeatPlan({ layout, taken, selected, onToggle, restroom }: Props) {
  const decks = [0, 1].filter((d) => layout.some((s) => s.deck === d));
  const sleeper = layout[0].berth;
  const cols = Math.max(...layout.map((s) => s.x)) + 1;
  const seatRows = Math.max(...layout.map((s) => s.row)) + 1;
  // Sleepers keep the CR in the empty last right-hand slot; seated coaches get it in an extra row at the back.
  const rows = restroom && !sleeper ? seatRows + 1 : seatRows;
  return (
    <div className="plan">
      {decks.map((deck) => (
        <section key={deck} className="deck" aria-label={sleeper ? (deck ? 'Upper deck, berths marked U' : 'Lower deck, berths marked L') : 'Seats'}>
          {sleeper && <h3>{deck ? 'Upper deck (U)' : 'Lower deck (L)'}</h3>}
          <div className="deck-grid" style={{ gridTemplateColumns: `repeat(${cols}, 44px)`, gridTemplateRows: `repeat(${rows}, auto)` }}>
            {layout.filter((s) => s.deck === deck).map((s) => {
              const isTaken = taken.has(s.id);
              const isSel = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={'seat' + (s.berth ? ' berth' : '')}
                  style={{ gridColumn: s.x + 1, gridRow: s.row + 1 }}
                  aria-pressed={isSel}
                  disabled={isTaken}
                  aria-label={`${seatName(s.id)}${isTaken ? ', taken' : isSel ? ', selected' : ''}`}
                  onClick={() => onToggle(s.id)}
                >
                  {s.berth && <small aria-hidden="true">{s.deck ? 'upper' : 'lower'}</small>}
                  {s.id}
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
