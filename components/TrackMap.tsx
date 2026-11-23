'use client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { Map as MlMap, Marker } from 'maplibre-gl';

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

/** Live map: route line, stops, and the bus, refreshed every 5 s. Simulated positions are labelled as such. */
export function TrackMap({ tripId, height = 460 }: { tripId: string; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const bus = useRef<Marker | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
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
        new ml.Marker({ element: el }).setLngLat(s.lngLat).setPopup(new ml.Popup({ offset: 10 }).setText(`${s.name}${s.boarding ? ' · pick-up' : ''}${s.alighting ? ' · drop-off' : ''}`)).addTo(m);
      }
      const el = document.createElement('div');
      el.className = 'map-bus'; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><rect x="4" y="3" width="16" height="15" rx="3" fill="#c8322b"/><rect x="6" y="5" width="12" height="5" rx="1" fill="#fff"/><circle cx="8" cy="20" r="2" fill="#1a1f1c"/><circle cx="16" cy="20" r="2" fill="#1a1f1c"/></svg>';
      bus.current = new ml.Marker({ element: el, rotationAlignment: 'map' });
      const apply = (s: Snap | null, f: Ferry[]) => {
        setSnap(s); setFerry(f);
        if (s?.position) bus.current!.setLngLat(s.position).addTo(m);
      };
      apply(full.snapshot, full.ferry);
      timer = setInterval(async () => {
        const r = await fetch(`/api/track/${tripId}`).then((x) => x.json()).catch(() => null);
        if (alive && r) apply(r.snapshot, r.ferry);
      }, 5000);
    })().catch(() => setNote('The map could not load. Check your connection.'));
    return () => { alive = false; clearInterval(timer); map.current?.remove(); };
  }, [tripId]);

  return (
    <div className="track">
      <div ref={box} className="track-map" style={{ height }} role="region" aria-label="Map of the bus route and position" />
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
