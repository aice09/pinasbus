import { clock } from '@/lib/catalog';
import { stopTime, type Stop } from '@/lib/trips';

/**
 * Train-style line diagram: one coloured line with a dot per station, like a metro map. Stations the trip does not
 * serve (express runs) appear as hollow dots, and the passenger's own leg is highlighted.
 */
export function RouteLine({ stops, from, to, departsAt, color = '#1f4d3a', title }: {
  stops: (Stop & { served?: boolean })[]; from?: string; to?: string; departsAt?: Date; color?: string; title?: string;
}) {
  const i = from ? stops.findIndex((s) => s.name === from) : -1;
  const j = to ? stops.findIndex((s) => s.name === to) : -1;
  return (
    <figure className="rline" style={{ ['--line' as string]: color }}>
      {title && <figcaption>{title}</figcaption>}
      <ol>
        {stops.map((s, k) => {
          const onLeg = i >= 0 && j > i && k >= i && k <= j;
          const served = s.served !== false && (s.boarding || s.alighting);
          const t = departsAt && s.offset_min != null ? clock(stopTime({ departs_at: departsAt, stops }, k)) : null;
          return (
            <li key={k} className={(onLeg ? 'leg ' : '') + (served ? '' : 'skip ') + (k === i ? 'from ' : '') + (k === j ? 'to' : '')}>
              <span className="rline-dot" aria-hidden="true" />
              <span className="rline-name">{s.name}</span>
              <span className="rline-meta">{served ? (t ?? '') : 'does not stop'}{k === i ? ' · you board' : k === j ? ' · you get off' : ''}</span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
