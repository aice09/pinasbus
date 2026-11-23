'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { Seat } from '@/lib/layouts';
import { SeatPlan } from './SeatPlan';

const Bus3D = dynamic(() => import('./Bus3D'), { ssr: false, loading: () => <div className="canvas3d" /> });

/** Interactive look at a seat layout: tapping seats only highlights them here. */
export function FleetPreview({ layout, restroom, start3d = false }: { layout: Seat[]; restroom: boolean; start3d?: boolean }) {
  const [sel, setSel] = useState<string[]>([]);
  const [three, setThree] = useState(start3d);
  const props = { layout, taken: new Set<string>(), selected: sel, onToggle: (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [id])), restroom };
  return (
    <div className="stage">
      <div className="toggle" role="group" aria-label="View">
        <button type="button" aria-pressed={!three} onClick={() => setThree(false)}>Seat plan</button>
        <button type="button" aria-pressed={three} onClick={() => setThree(true)}>3D</button>
      </div>
      {three ? <Bus3D {...props} /> : <SeatPlan {...props} />}
    </div>
  );
}
