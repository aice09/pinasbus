// Destination photos (Wikimedia Commons, freely licensed; credits in data/places.json, shown on every use).
import credits from '../data/places.json' with { type: 'json' };
import { q } from './db.ts';

export type Place = { key: string; src: string; credit: { title: string; author: string; license: string; licenseUrl: string; source: string } };
const PROVINCE_REGION: Record<string, string> = {
  'Ilocos Norte': 'ilocos', 'Ilocos Sur': 'vigan', Albay: 'albay', 'Camarines Sur': 'camarines-sur', Sorsogon: 'sorsogon', Catanduanes: 'catanduanes', Masbate: 'masbate',
  Benguet: 'baguio', 'La Union': 'pangasinan', Pangasinan: 'pangasinan', Zambales: 'zambales', Cagayan: 'cagayan', Isabela: 'cagayan', Pampanga: 'central-luzon',
  Tarlac: 'central-luzon', Leyte: 'leyte', 'Northern Samar': 'leyte', 'Metro Manila': 'metro-manila', Laguna: 'laguna',
};
const C = credits as Record<string, Place['credit']>;
export const DEFAULT_PLACE = 'albay';
export const place = (key: string): Place => { const k = C[key] ? key : DEFAULT_PLACE; return { key: k, src: `/places/${k}.jpg`, credit: C[k] }; };

/** Station name -> photo region, for every station with a province we know. */
export async function stationRegions() {
  const rows = await q<{ name: string; province: string }>('select name, province from stations');
  return Object.fromEntries(rows.filter((r) => PROVINCE_REGION[r.province]).map((r) => [r.name, PROVINCE_REGION[r.province]]));
}
export const allPlaces = () => Object.keys(C).map(place);
export const provinceRegion = (p: string) => PROVINCE_REGION[p];
