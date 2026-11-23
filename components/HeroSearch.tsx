'use client';
import Image from 'next/image';
import { useState } from 'react';
import type { Place } from '@/lib/places';
import { RouteSelects } from './RouteSelects';

type Props = {
  pairs: Record<string, string[]>; regions: Record<string, string>; places: Record<string, Place>; via: Record<string, string>;
  today: string; maxDate: string; initial: { from: string; to: string }; fallback: string;
};

/** "Partas Laoag" -> "Laoag", "Victory Liner Cubao" -> "Cubao": the board names places, not terminals. */
const placeName = (s: string) => s.replace(/^(Partas|Victory Liner)\s+/, '').replace(/ CBD$/, '');

/**
 * The hero is a karatula: the painted route board in a provincial bus's windshield, set over a photo of where
 * you're going. Both follow the search as you choose a route.
 */
export function HeroSearch({ pairs, regions, places, via, today, maxDate, initial, fallback }: Props) {
  const [route, setRoute] = useState(initial);
  const [date, setDate] = useState(today);
  const key = regions[route.to] ?? (route.to ? fallback : regions[route.from] && regions[route.from] !== 'metro-manila' ? regions[route.from] : fallback);
  const p = places[key] ?? places[fallback];
  const [shown, setShown] = useState([p.key]);
  if (shown[shown.length - 1] !== p.key) setShown((s) => [...s.filter((k) => k !== p.key).slice(-1), p.key]);
  const viaLine = route.from && route.to ? via[`${route.from}|${route.to}`] : '';

  return (
    <section className="hero2" aria-label="Search trips">
      <div className="hero2-bg" aria-hidden="true">
        {shown.map((k) => <Image key={k} src={places[k].src} alt="" fill priority={k === p.key} sizes="100vw" className={'hero2-img' + (k === p.key ? ' on' : '')} />)}
      </div>
      <div className="hero2-inner">
        <div className="karatula" role="img" aria-label={route.to ? `Route board: ${route.from || 'any terminal'} to ${route.to}${viaLine ? `, via ${viaLine}` : ''}` : 'Route board: where are you heading home?'}>
          <div key={route.from + route.to} className="karatula-flip">
            {route.to ? (
              <>
                <span className="k-from">{route.from ? placeName(route.from) : 'Lahat ng terminal'}</span>
                <span className="k-to">{placeName(route.to)}</span>
                {viaLine && <span className="k-via">via {viaLine}</span>}
              </>
            ) : (
              <>
                <span className="k-from">{route.from ? placeName(route.from) : 'PINASBUS'}</span>
                <span className="k-to ask">Saan ka uuwi?</span>
              </>
            )}
          </div>
        </div>
        <h1 className="hero2-title">Every bus home, in one place.</h1>
        <form className="hero2-card" action="/trips" method="get">
          <RouteSelects pairs={pairs} from={route.from} to={route.to} onChange={(from, to) => setRoute({ from, to })} />
          <label className="field">Travel date<input type="date" name="date" value={date} min={today} max={maxDate} required onChange={(e) => setDate(e.target.value)} /></label>
          <button className="btn" type="submit">Find trips</button>
        </form>
      </div>
      <a className="hero2-credit" href={p.credit.source} target="_blank" rel="noreferrer noopener">Photo: {p.credit.title.replace(/\.jpe?g$/i, '')} by {p.credit.author} ({p.credit.license})</a>
    </section>
  );
}
