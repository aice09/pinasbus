/** Geometry for the animated journey: distance along a line, and the point and heading at any distance. */
export type LngLat = [number, number];
const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function km(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Compass bearing from a to b, degrees clockwise from north. */
export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function cumulative(line: LngLat[]): number[] {
  const c = [0];
  for (let i = 1; i < line.length; i++) c.push(c[i - 1] + km(line[i - 1], line[i]));
  return c;
}

/** The point at distance d along the line, and the index of the segment it lies on. */
export function along(line: LngLat[], cum: number[], d: number): { p: LngLat; i: number } {
  if (d <= 0) return { p: line[0], i: 0 };
  const total = cum[cum.length - 1];
  if (d >= total) return { p: line[line.length - 1], i: line.length - 2 };
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
  const t = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return { p: [line[lo][0] + (line[hi][0] - line[lo][0]) * t, line[lo][1] + (line[hi][1] - line[lo][1]) * t], i: lo };
}

/** Turns from one heading toward another by fraction k, the short way round. */
export function turn(from: number, to: number, k: number): number {
  const diff = ((to - from + 540) % 360) - 180;
  return (from + diff * k + 360) % 360;
}
