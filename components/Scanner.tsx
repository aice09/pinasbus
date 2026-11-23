'use client';
import { useEffect, useRef, useState } from 'react';

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/**
 * Reads a QR code with the phone camera where the browser supports the BarcodeDetector API (Chrome on Android, Edge),
 * and always offers typing the code instead. Calls onCode with the text (a URL or a bare code).
 */
export function Scanner({ onCode, label = 'Scan a QR code' }: { onCode: (code: string) => void; label?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState('');
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null, stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream; await video.current.play();
        const det: Detector = new (window as unknown as { BarcodeDetector: new (o: object) => Detector }).BarcodeDetector({ formats: ['qr_code'] });
        while (!stop) {
          const found = await det.detect(video.current).catch(() => []);
          if (found[0]?.rawValue) { onCode(found[0].rawValue); setOn(false); break; }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch { setMsg('The camera is not available. Type the code instead.'); setOn(false); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [on, onCode]);

  return (
    <div className="scanner">
      {supported && <button type="button" className="btn quiet small" onClick={() => setOn((v) => !v)}>{on ? 'Stop camera' : label}</button>}
      {on && <video ref={video} className="scan-video" muted playsInline aria-label="Camera view" />}
      {msg && <p className="note">{msg}</p>}
    </div>
  );
}
