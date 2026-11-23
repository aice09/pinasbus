// First-run route data, scraped from the operator's public trip search (scripts/parse.py + scripts/catalog.py).
import raw from '../data/trips.json' with { type: 'json' };
import type { BusClassId, Trip } from './catalog.ts';

const BUS_NAME: Record<string, BusClassId> = {
  'Ultimate Sleeper Bus': 'sleeper22',
  'Regular Sleeper Bus': 'sleeper20',
  'ELITE 26': 'elite',
  'SKYBUS WITH CR': 'skybus',
  'REGULAR WITHOUT CR': 'regular',
  'NON-AIRCON': 'nonac',
};

export function seedTrips(): Trip[] {
  return (raw as { id: string; code: string; dir: string; bus: string; fare: number; pickups: Trip['pickups']; dropoffs: string[] }[]).map((t) => {
    const busClass = BUS_NAME[t.bus];
    if (!busClass) throw new Error(`unknown bus class ${t.bus} in data/trips.json`);
    return { id: t.id, code: t.code, dir: t.dir as Trip['dir'], busClass, fare: t.fare, pickups: t.pickups, dropoffs: t.dropoffs, active: true };
  });
}
