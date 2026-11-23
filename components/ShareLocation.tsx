'use client';
import { useEffect, useRef, useState } from 'react';

/** For assigned crew: sends the phone's GPS position every 15 s while switched on. Nothing is sent while off. */
export function ShareLocation({ tripId }: { tripId: string }) {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState('');
  const last = useRef(0);
  useEffect(() => {
    if (!on) return;
    if (!('geolocation' in navigator)) { setMsg('This device has no location service.'); setOn(false); return; }
    const id = navigator.geolocation.watchPosition(async (p) => {
      if (Date.now() - last.current < 15_000) return;
      last.current = Date.now();
      const r = await fetch('/api/gps', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tripId, lat: p.coords.latitude, lng: p.coords.longitude, speedKph: p.coords.speed != null ? p.coords.speed * 3.6 : null, heading: p.coords.heading }) })
        .then((x) => x.json()).catch(() => ({ error: 'offline' }));
      setMsg(r.error ? `Not sent: ${r.error}` : `Sent ${new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}${r.alerts?.length ? `. Alert: ${r.alerts.join(', ')}` : ''}`);
    }, (e) => { setMsg(e.code === 1 ? 'Location permission was refused.' : 'Location is not available.'); setOn(false); }, { enableHighAccuracy: true, maximumAge: 5000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [on, tripId]);
  return (
    <div className="share-loc">
      <button type="button" className={on ? 'btn' : 'btn quiet'} aria-pressed={on} onClick={() => setOn((v) => !v)}>{on ? 'Stop sharing bus location' : 'Share bus location from this phone'}</button>
      {msg && <span className="note" role="status">{msg}</span>}
    </div>
  );
}
