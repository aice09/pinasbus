'use client';
import { useState } from 'react';
import { layoutFor, PASSENGER_KINDS, SEAT_KINDS, type Seat, type SeatKind } from '@/lib/layouts';

const TEMPLATES: [string, string, number][] = [
  ['skybus', '2+1 coach, 36 seats', 36], ['elite', '2+1 coach, 25 seats', 25], ['regular', '2+2 coach, 45 seats', 45],
  ['nonac', '2+3 coach, 57 seats', 57], ['sleeper22', 'Double-deck sleeper, 22 berths', 22], ['royal', 'Double-deck sleeper, 28 berths', 28],
];
type Tool = SeatKind | 'erase';

/** Grid editor for a seat layout. Click a cell to place or change a seat with the chosen type; the JSON goes in a hidden field. */
export function LayoutEditor({ initial }: { initial?: Seat[] }) {
  const [seats, setSeats] = useState<Seat[]>(initial ?? layoutFor('skybus', 36));
  const [deck, setDeck] = useState<0 | 1>(0);
  const [tool, setTool] = useState<Tool>('regular');
  const [berth, setBerth] = useState(initial?.some((s) => s.berth) ?? false);
  const [cols, setCols] = useState(Math.max(3, ...seats.map((s) => s.x + 1)));
  const [rows, setRows] = useState(Math.max(4, ...seats.map((s) => s.row + 1)));
  const [picked, setPicked] = useState<string | null>(null);

  const at = (x: number, row: number) => seats.find((s) => s.deck === deck && s.x === x && s.row === row);
  const nextId = () => {
    const nums = seats.map((s) => Number(s.id.replace(/^[LU]/, ''))).filter(Number.isFinite);
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    return berth ? `${deck ? 'U' : 'L'}${n}` : String(n);
  };
  const crewId = (k: SeatKind) => { const base = k === 'driver' ? 'DRV' : k === 'conductor' ? 'CND' : 'CRW'; let i = 1, id = base; while (seats.some((s) => s.id === id)) id = base + ++i; return id; };

  const click = (x: number, row: number) => {
    const s = at(x, row);
    if (tool === 'erase') { if (s) setSeats(seats.filter((q) => q !== s)); return; }
    if (s) { setSeats(seats.map((q) => (q === s ? { ...q, kind: tool, berth } : q))); setPicked(s.id); return; }
    const id = PASSENGER_KINDS.includes(tool) || tool === 'reserved' || tool === 'unavailable' ? nextId() : crewId(tool);
    setSeats([...seats, { id, x, row, deck, berth, kind: tool }]);
    setPicked(id);
  };

  const renumber = () => {
    let n = 0;
    const order = [...seats].sort((a, b) => a.row - b.row || a.x - b.x || a.deck - b.deck);
    const ids = new Map<Seat, string>();
    // sleepers: lower and upper berths in the same spot share a number (L3 under U3)
    const spot = new Map<string, number>();
    for (const s of order) {
      if (!PASSENGER_KINDS.includes(s.kind) && s.kind !== 'reserved' && s.kind !== 'unavailable') continue;
      if (s.berth) { const key = `${s.x}:${s.row}`; if (!spot.has(key)) spot.set(key, ++n); ids.set(s, `${s.deck ? 'U' : 'L'}${spot.get(key)}`); }
      else ids.set(s, String(++n));
    }
    setSeats(seats.map((s) => (ids.has(s) ? { ...s, id: ids.get(s)! } : s)));
  };

  const p = seats.find((s) => s.id === picked);
  const passengers = seats.filter((s) => PASSENGER_KINDS.includes(s.kind)).length;

  return (
    <div className="editor">
      <input type="hidden" name="seats" value={JSON.stringify(seats)} />
      <div className="editor-bar">
        <label className="field">Start from a template
          <select defaultValue="" onChange={(e) => { const t = TEMPLATES.find((x) => x[0] === e.target.value); if (t) { const l = layoutFor(t[0], t[2]); setSeats(l); setBerth(l.some((s) => s.berth)); setCols(Math.max(...l.map((s) => s.x + 1))); setRows(Math.max(...l.map((s) => s.row + 1))); } }}>
            <option value="">Keep current</option>{TEMPLATES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="field">Columns<input type="number" min="2" max="8" value={cols} onChange={(e) => setCols(Math.min(8, Math.max(2, Number(e.target.value))))} /></label>
        <label className="field">Rows<input type="number" min="2" max="26" value={rows} onChange={(e) => setRows(Math.min(26, Math.max(2, Number(e.target.value))))} /></label>
        <div className="toggle" role="group" aria-label="Deck">
          <button type="button" aria-pressed={deck === 0} onClick={() => setDeck(0)}>Lower deck</button>
          <button type="button" aria-pressed={deck === 1} onClick={() => setDeck(1)}>Upper deck</button>
        </div>
        <label className="check"><input type="checkbox" checked={berth} onChange={(e) => setBerth(e.target.checked)} /> New seats are sleeper berths</label>
      </div>
      <fieldset className="palette"><legend>Click a cell to place</legend>
        {(Object.keys(SEAT_KINDS) as SeatKind[]).map((k) => (
          <label key={k} className={`pal k-${k}`}><input type="radio" name="_tool" checked={tool === k} onChange={() => setTool(k)} /> {SEAT_KINDS[k]}</label>
        ))}
        <label className="pal"><input type="radio" name="_tool" checked={tool === 'erase'} onChange={() => setTool('erase')} /> Erase</label>
      </fieldset>
      <div className="deck-grid editor-grid" style={{ gridTemplateColumns: `repeat(${cols}, 44px)` }} aria-label={`${deck ? 'Upper' : 'Lower'} deck grid, front at the top`}>
        {Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, x) => {
          const s = at(x, row);
          return (
            <button key={`${x}:${row}`} type="button" className={'seat cell' + (s ? ` k-${s.kind}` : ' empty') + (s?.berth ? ' berth' : '') + (s && s.id === picked ? ' picked' : '')}
              aria-label={s ? `${s.id}, ${SEAT_KINDS[s.kind]}, row ${row + 1} column ${x + 1}` : `Empty, row ${row + 1} column ${x + 1}`} onClick={() => click(x, row)}>
              {s ? s.id : ''}
            </button>
          );
        }))}
      </div>
      <div className="editor-bar">
        <button type="button" className="btn quiet small" onClick={renumber}>Renumber seats front to back</button>
        {p && (
          <label className="field">Label for the selected seat
            <input value={p.id} maxLength={5} onChange={(e) => { const id = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); setSeats(seats.map((s) => (s === p ? { ...s, id } : s))); setPicked(id); }} />
          </label>
        )}
        <span className="note">{passengers} passenger seats, {seats.length - passengers} other positions.</span>
      </div>
    </div>
  );
}
