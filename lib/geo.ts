// Pure geometry on [lng, lat] pairs (GeoJSON order). Distances in km.
export type LngLat = [number, number];

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LngLat, b: LngLat) {
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const lineLength = (line: LngLat[]) => line.slice(1).reduce((km, p, i) => km + haversine(line[i], p), 0);

/** Point `km` along the line (clamped to its ends), with the bearing of that segment in degrees. */
export function along(line: LngLat[], km: number): { point: LngLat; bearing: number } {
  if (line.length === 1 || km <= 0) return { point: line[0], bearing: line.length > 1 ? bearing(line[0], line[1]) : 0 };
  let left = km;
  for (let i = 1; i < line.length; i++) {
    const seg = haversine(line[i - 1], line[i]);
    if (left <= seg && seg > 0) {
      const t = left / seg;
      return { point: [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t], bearing: bearing(line[i - 1], line[i]) };
    }
    left -= seg;
  }
  const n = line.length;
  return { point: line[n - 1], bearing: bearing(line[n - 2], line[n - 1]) };
}

export function bearing(a: LngLat, b: LngLat) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Shortest distance from a point to the line (km), and how far along the line that nearest point is (km). */
export function nearest(line: LngLat[], p: LngLat) {
  let best = { km: Infinity, at: 0 }, travelled = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    // project in a local equirectangular plane (fine at bus-route scales)
    const k = Math.cos(rad(p[1]));
    const ax = a[0] * k, ay = a[1], bx = b[0] * k, by = b[1], px = p[0] * k, py = p[1];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const q: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = haversine(p, q);
    const seg = haversine(a, b);
    if (d < best.km) best = { km: d, at: travelled + seg * t };
    travelled += seg;
  }
  return best;
}
