'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { BusClass } from '@/lib/catalog';
import { SeatPlan } from './SeatPlan';

const Bus3D = dynamic(() => import('./Bus3D'), { ssr: false, loading: () => <div className="canvas3d" /> });

/** Interactive look at a bus class: tapping seats only highlights them here. */
export function FleetPreview({ cls }: { cls: BusClass }) {
  const [sel, setSel] = useState<string[]>([]);
  const [three, setThree] = useState(false);
  const props = { layout: cls.layout, taken: new Set<string>(), selected: sel, onToggle: (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [id])), restroom: cls.amenities.includes('Restroom') };
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
