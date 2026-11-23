'use client';
import { useState } from 'react';

type Props = { title: string; data: { label: string; value: number }[]; format?: 'number' | 'peso'; horizontal?: boolean };

const fmt = (v: number, f: Props['format']) =>
  f === 'peso' ? '₱' + (v / 100).toLocaleString('en-PH', { maximumFractionDigits: 0 }) : v.toLocaleString('en-PH');

/**
 * Single-series bar chart: one hue (no legend; the title names the series), 4px rounded data ends on a baseline,
 * 2px gaps, recessive grid, hover/focus tooltip, and a table view for screen readers and exact values.
 */
export function BarChart({ title, data, format = 'number', horizontal }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const total = data.reduce((a, d) => a + d.value, 0);

  if (horizontal) {
    return (
      <figure className="chart">
        <figcaption><h3>{title}</h3></figcaption>
        {data.length === 0 ? <p className="note">No data yet.</p> : (
          <ul className="hbars">
            {data.map((d) => (
              <li key={d.label}>
                <span className="hbar-label">{d.label}</span>
                <span className="hbar-track"><span className="hbar" style={{ width: `${(d.value / nice) * 100}%` }} /></span>
                <span className="hbar-val">{fmt(d.value, format)}</span>
              </li>
            ))}
          </ul>
        )}
      </figure>
    );
  }

  const W = 640, H = 200, padL = 52, padB = 24, padT = 10;
  const bw = (W - padL) / Math.max(1, data.length);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  return (
    <figure className="chart">
      <figcaption><h3>{title}</h3><span className="note">{fmt(total, format)} in {data.length} days</span></figcaption>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, bar chart. Exact values are in the table below.`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="axis">{fmt(t, format)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = padL + i * bw + 1;
            const h = Math.max(0, H - padB - y(d.value));
            const w = Math.max(1, bw - 2);
            const r = Math.min(4, w / 2, h);
            return (
              <g key={d.label} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.label}: ${fmt(d.value, format)}`}>
                <rect x={x - 1} y={padT} width={bw} height={H - padT - padB} fill="transparent" />
                {h > 0 && <path className={hover === i ? 'bar on' : 'bar'} d={`M${x},${H - padB} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z`} />}
              </g>
            );
          })}
          {[0, Math.floor((data.length - 1) / 2), data.length - 1].filter((i, k, a) => data[i] && a.indexOf(i) === k).map((i) => (
            <text key={i} x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="axis">{data[i].label}</text>
          ))}
        </svg>
        {hover !== null && data[hover] && (
          <div className="tip" style={{ left: `${((padL + hover * bw + bw / 2) / W) * 100}%` }}>
            <strong>{fmt(data[hover].value, format)}</strong><span>{data[hover].label}</span>
          </div>
        )}
      </div>
      <details><summary>Table view</summary>
        <table className="fares small"><thead><tr><th scope="col">Day</th><th scope="col">Value</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="num">{fmt(d.value, format)}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((n) => n >= v) ?? v;
}
