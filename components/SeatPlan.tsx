'use client';
import type { Seat } from '@/lib/layouts';

type Props = { layout: Seat[]; taken: Set<string>; selected: string[]; onToggle: (id: string) => void; restroom: boolean };

/** Keyboard- and screen-reader-friendly seat plan; one grid per deck, front at the top. */
export function SeatPlan({ layout, taken, selected, onToggle, restroom }: Props) {
  const decks = [0, 1].filter((d) => layout.some((s) => s.deck === d));
  const cols = Math.max(...layout.map((s) => s.x)) + 1;
  const rows = Math.max(...layout.map((s) => s.row)) + 1;
  return (
    <div className="plan">
      {decks.map((deck) => (
        <section key={deck} className="deck" aria-label={decks.length > 1 ? (deck ? 'Upper deck' : 'Lower deck') : 'Seats'}>
          {decks.length > 1 && <h3>{deck ? 'Upper deck' : 'Lower deck'}</h3>}
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
                  aria-label={`${s.berth ? 'Berth' : 'Seat'} ${s.id}${isTaken ? ', taken' : isSel ? ', selected' : ''}`}
                  onClick={() => onToggle(s.id)}
                >
                  {s.id}
                </button>
              );
            })}
            {restroom && deck === 0 && layout[0].berth && (
              <div className="cr" style={{ gridColumn: cols, gridRow: rows }} aria-label="Restroom">CR</div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
