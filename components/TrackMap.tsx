'use client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { Map as MlMap, Marker } from 'maplibre-gl';
import { along, bearing, cumulative, turn, type LngLat } from '@/lib/journey';
import type { Livery } from '@/lib/livery';

type Snap = {
  simulated: boolean; status: string; position: [number, number] | null; bearing: number; speedKph: number; avgKph: number; maxKph: number;
  travelledKm: number; remainingKm: number; totalKm: number; eta: string | null; lastUpdate: string | null; nextStop: string | null; ferry: boolean;
};
type Ferry = { status: string; from_port: string; to_port: string; vessel: string; sailing_status: string; departs_at: string };
type Full = { line: [number, number][]; lineSource: string | null; stops: { name: string; lngLat: [number, number]; boarding: boolean; alighting: boolean }[]; snapshot: Snap | null; ferry: Ferry[] };

// OpenFreeMap: free OpenStreetMap vector tiles, no key or usage limits for normal sites (attribution shown by the style).
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const FERRY_TEXT: Record<string, string> = { reserved: 'Ferry booked', approaching: 'Approaching the port', waiting: 'Waiting to board the ferry', boarding: 'Boarding the ferry', on_vessel: 'On the ferry', sailing: 'Sailing', disembarked: 'Off the ferry', continuing: 'Back on the road', cancelled: 'Ferry cancelled' };

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }) : '—');

const placeName = (s: string) => s.replace(/^(Partas|Victory Liner)\s+/, '').replace(/ CBD$/, '').replace(/ (Terminal|Bus Station)$/, '');
// Pastel paint for the journey view; restored when it ends.
const PASTEL: [RegExp, string][] = [
  [/^background$/, '#fbe4ea'], [/water/, '#a7d8f2'], [/park|wood|grass|landcover|forest/, '#cdebd0'], [/landuse|residential/, '#f8dbe3'],
];

/**
 * Live map: route line, stops, and the bus, refreshed every 5 s. Simulated positions are labelled as such.
 * "Play the journey" flies a tilted camera behind a 3D bus along the whole route while the line draws in.
 */
export function TrackMap({ tripId, height = 460, livery }: { tripId: string; height?: number; livery?: Livery }) {
  const fullRef = useRef<Full | null>(null);
  const [playing, setPlaying] = useState<'off' | 'on' | 'done'>('off');
  const [title, setTitle] = useState('');
  const stopRef = useRef<() => void>(() => {});
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const bus = useRef<Marker | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const snapRef = useRef<Snap | null>(null);
  const [ferry, setFerry] = useState<Ferry[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      const ml = await import('maplibre-gl');
      ml.setWorkerUrl('/maplibre-gl-worker.mjs'); // copied into public/ at build (package.json prebuild)
      const full: Full = await fetch(`/api/track/${tripId}?full=1`).then((r) => r.json());
      if (!alive || !box.current) return;
      if (!full.line?.length) { setNote('This route has no map coordinates yet.'); return; }
      fullRef.current = full;
      setTitle(`${placeName(full.stops[0]?.name ?? '')} to ${placeName(full.stops[full.stops.length - 1]?.name ?? '')}`);
      const m = new ml.Map({ container: box.current, style: STYLE, attributionControl: { compact: true } });
      map.current = m;
      // The container can still be settling its size (fonts, grid) when the map starts: keep the canvas in step.
      const ro = new ResizeObserver(() => m.resize()); ro.observe(box.current); m.on('remove', () => ro.disconnect());
      m.once('load', () => m.resize());
      const bounds = full.line.reduce((b, p) => b.extend(p), new ml.LngLatBounds(full.line[0], full.line[0]));
      m.fitBounds(bounds, { padding: 40, duration: 0 });
      m.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      m.on('load', () => {
        m.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: full.line } } });
        m.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        m.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#1f4d3a', 'line-width': 4, ...(full.lineSource === 'straight' ? { 'line-dasharray': [2, 1.5] } : {}) }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      });
      for (const s of full.stops) {
        const el = document.createElement('div');
        el.className = 'map-stop'; el.title = s.name;
        new ml.Marker({ element: el }).setLngLat(s.lngLat).setPopup(new ml.Popup({ offset: 10 }).setText(`${s.name}${s.boarding && s.alighting ? ': pick-up and drop-off' : s.boarding ? ': pick-up' : ': drop-off'}`)).addTo(m);
      }
      const el = document.createElement('div');
      el.className = 'map-bus'; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><rect x="4" y="3" width="16" height="15" rx="3" fill="#c8322b"/><rect x="6" y="5" width="12" height="5" rx="1" fill="#fff"/><circle cx="8" cy="20" r="2" fill="#1a1f1c"/><circle cx="16" cy="20" r="2" fill="#1a1f1c"/></svg>';
      bus.current = new ml.Marker({ element: el, rotationAlignment: 'map' });
      const apply = (s: Snap | null, f: Ferry[]) => {
        setSnap(s); setFerry(f); snapRef.current = s;
        if (s?.position && !m.getLayer('journey-bus')) bus.current!.setLngLat(s.position).addTo(m);
      };
      apply(full.snapshot, full.ferry);
      timer = setInterval(async () => {
        const r = await fetch(`/api/track/${tripId}`).then((x) => x.json()).catch(() => null);
        if (alive && r) apply(r.snapshot, r.ferry);
      }, 5000);
    })().catch(() => setNote('The map could not load. Check your connection.'));
    return () => { alive = false; clearInterval(timer); stopRef.current(); map.current?.remove(); };
  }, [tripId]);

  async function play() {
    const m = map.current, full = fullRef.current;
    if (!m || !full || !m.isStyleLoaded()) return;
    stopRef.current();
    const [{ busLayer }] = await Promise.all([import('./journeyBus')]);
    const line = full.line as LngLat[], cum = cumulative(line), total = cum[cum.length - 1];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    type Paint = 'background-color' | 'fill-color';
    const saved: [string, Paint, unknown][] = [];
    for (const l of m.getStyle().layers) {
      const prop: Paint | null = l.type === 'background' ? 'background-color' : l.type === 'fill' ? 'fill-color' : null;
      const hit = prop && PASTEL.find(([re]) => re.test(l.id));
      if (!prop || !hit) continue;
      saved.push([l.id, prop, m.getPaintProperty(l.id, prop)]); m.setPaintProperty(l.id, prop, hit[1]);
    }
    m.setPaintProperty('route', 'line-opacity', 0.3);
    const trail = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [line[0], line[0]] } };
    m.addSource('trail', { type: 'geojson', data: trail });
    m.addLayer({ id: 'trail-casing', type: 'line', source: 'trail', paint: { 'line-color': '#ffffff', 'line-width': 11 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    m.addLayer({ id: 'trail', type: 'line', source: 'trail', paint: { 'line-color': livery?.body ?? '#c8322b', 'line-width': 6 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    const bus3d = busLayer(livery ?? { body: '#c8322b', trim: '#ffffff' });
    m.addLayer(bus3d.layer);
    bus.current?.remove();
    setPlaying('on');

    let raf = 0, head = bearing(line[0], line[Math.min(line.length - 1, 5)]);
    const ms = Math.min(26000, Math.max(12000, total * 45)); // 12 to 26 s, longer routes take longer
    const zoom = total > 250 ? 9.6 : total > 80 ? 10.6 : 12;
    const t0 = performance.now();
    const frame = (now: number) => {
      const k = reduce ? 1 : Math.min(1, (now - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // ease in and out
      const d = e * total, here = along(line, cum, d);
      const ahead = along(line, cum, Math.min(total, d + Math.max(0.4, total * 0.02))).p;
      if (ahead[0] !== here.p[0] || ahead[1] !== here.p[1]) head = turn(head, bearing(here.p, ahead), 0.08);
      trail.geometry.coordinates = [...line.slice(0, here.i + 1), here.p];
      (m.getSource('trail') as { setData: (d: unknown) => void } | undefined)?.setData(trail);
      bus3d.pose.lngLat = here.p; bus3d.pose.bearing = head;
      if (k < 1) {
        m.jumpTo({ center: here.p, bearing: head, pitch: 62, zoom });
        raf = requestAnimationFrame(frame);
      } else {
        const b = line.reduce((acc, p) => [Math.min(acc[0], p[0]), Math.min(acc[1], p[1]), Math.max(acc[2], p[0]), Math.max(acc[3], p[1])], [180, 90, -180, -90]);
        m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, pitch: 45, bearing: 0, duration: reduce ? 0 : 2200 });
        setPlaying('done');
      }
      m.triggerRepaint();
    };
    raf = requestAnimationFrame(frame);
    stopRef.current = () => {
      cancelAnimationFrame(raf);
      for (const id of ['journey-bus', 'trail', 'trail-casing']) if (m.getLayer(id)) m.removeLayer(id);
      if (m.getSource('trail')) m.removeSource('trail');
      for (const [id, prop, v] of saved) m.setPaintProperty(id, prop, v as string);
      if (m.getLayer('route')) m.setPaintProperty('route', 'line-opacity', 1);
      if (snapRef.current?.position) bus.current?.setLngLat(snapRef.current.position).addTo(m);
      stopRef.current = () => {};
    };
  }
  function stop() {
    stopRef.current();
    const full = fullRef.current, m = map.current;
    if (m && full) {
      const b = full.line.reduce((acc, p) => [Math.min(acc[0], p[0]), Math.min(acc[1], p[1]), Math.max(acc[2], p[0]), Math.max(acc[3], p[1])], [180, 90, -180, -90]);
      m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, pitch: 0, bearing: 0, duration: 600 });
    }
    setPlaying('off');
  }

  return (
    <div className="track">
      {/* the journey class sits on the wrapper: React must not own the map container's className (MapLibre adds its own) */}
      <div className={'track-wrap' + (playing !== 'off' ? ' journey' : '')}>
        <div ref={box} className="track-map" style={{ height }} role="region" aria-label="Map of the bus route and position" />
        {playing !== 'off' && title && <p key={playing} className={'journey-title' + (playing === 'done' ? ' done' : '')} aria-live="polite">{playing === 'done' ? `${title}: arrived` : title}</p>}
        {!note && title && (
          <div className="journey-ctl">
            {playing === 'off' && <button type="button" className="btn small" onClick={play}>Play the journey</button>}
            {playing === 'done' && <button type="button" className="btn small" onClick={play}>Play again</button>}
            {playing !== 'off' && <button type="button" className="btn small quiet" onClick={stop}>{playing === 'on' ? 'Stop' : 'Back to live map'}</button>}
          </div>
        )}
      </div>
      {note && <p className="note">{note}</p>}
      {snap && (
        <div className="track-stats" aria-live="polite">
          <p className={'track-src ' + (snap.simulated ? 'sim' : 'live')}>{snap.simulated ? 'SIMULATED position for demonstration: not real GPS data' : `Live GPS, updated ${time(snap.lastUpdate)}`}</p>
          <dl>
            <div><dt>Status</dt><dd>{snap.status === 'not_started' ? 'Not departed yet' : snap.status === 'arrived' ? 'Arrived' : 'On the way'}</dd></div>
            <div><dt>Speed</dt><dd>{snap.speedKph} km/h</dd></div>
            <div><dt>Average</dt><dd>{snap.avgKph} km/h</dd></div>
            <div><dt>Top speed</dt><dd>{snap.maxKph} km/h</dd></div>
            <div><dt>Travelled</dt><dd>{snap.travelledKm} km</dd></div>
            <div><dt>Remaining</dt><dd>{snap.remainingKm} km</dd></div>
            <div><dt>Arrives about</dt><dd>{time(snap.eta)}</dd></div>
            <div><dt>Next stop</dt><dd>{snap.nextStop ?? '—'}</dd></div>
          </dl>
          {ferry.map((f, i) => <p key={i} className="ferry-state"><strong>{FERRY_TEXT[f.status] ?? f.status}</strong>: {f.vessel}, {f.from_port} → {f.to_port}, sails {time(f.departs_at)}{f.sailing_status === 'delayed' ? ' (delayed)' : f.sailing_status === 'cancelled' ? ' (cancelled)' : ''}</p>)}
        </div>
      )}
    </div>
  );
}
