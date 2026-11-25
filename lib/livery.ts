/** Bus paint for the 3D view: a body colour and a trim colour (belt stripe, pillars). Colours only, never logos. */
export type Livery = { body: string; trim: string };

export const DEFAULT_LIVERY: Livery = { body: '#f3f4f0', trim: '#1f4d3a' };

/**
 * Demonstration colours for the listed companies, chosen to resemble their buses from public photos. They are
 * approximations, not brand assets; each company can set its own in its workspace settings.
 */
const DEMO: Record<string, Livery> = {
  'victory-liner': { body: '#c8162b', trim: '#f4f4f2' },
  'bicol-isarog': { body: '#f4f5f1', trim: '#1f7a3a' },
  'penafrancia-tours': { body: '#f6f2e6', trim: '#d4561c' },
  'legaspi-st-jude': { body: '#1f4f8f', trim: '#f2f3f5' },
  'rsl-bus': { body: '#f7f7f5', trim: '#7a1f2b' },
  partas: { body: '#f5f5f0', trim: '#c9302c' },
  'edsa-carousel': { body: '#2a6fb5', trim: '#f2f4f6' },
};

const HEX = /^#[0-9a-f]{6}$/i;
export function liveryOf(slug: string, settings: { livery?: Partial<Livery> } | null | undefined): Livery {
  const own = settings?.livery;
  const base = DEMO[slug] ?? DEFAULT_LIVERY;
  return { body: own?.body && HEX.test(own.body) ? own.body : base.body, trim: own?.trim && HEX.test(own.trim) ? own.trim : base.trim };
}
export const isHex = (s: unknown): s is string => typeof s === 'string' && HEX.test(s);
