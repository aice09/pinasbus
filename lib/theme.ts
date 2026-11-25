/**
 * Theme engine (shared with AKADEMIA): any 4-colour Color Hunt palette → a complete, WCAG-AA-safe set of site colours.
 * Pure (no I/O). Roles: ink (darkest: header, headings), accent (calls to action), tint (surfaces), mist (lightest).
 * Colours are nudged (darkened/lightened) only as far as needed to meet the contrast targets.
 */
export interface ThemePreset {
  readonly id: string;
  readonly name: string;
  /** 24 lowercase hex chars = the four colours, in Color Hunt URL order. */
  readonly palette: string;
}

/** Built-in palettes: PINASBUS's own first (the default until a platform admin changes it), then 10 from colorhunt.co. */
export const THEME_PRESETS: readonly ThemePreset[] = [
  { id: 'pili', name: 'Pili (PINASBUS)', palette: '1f4d3ac8322bdfe9e2f4f6f2' },
  { id: 'harbor', name: 'Harbor', palette: '1b262c0f4c753282b8bbe1fa' },
  { id: 'lagoon', name: 'Lagoon', palette: '222831393e4600adb5eeeeee' },
  { id: 'indigo', name: 'Indigo night', palette: '0b244719376d576cbca5d7e8' },
  { id: 'slate', name: 'Slate', palette: '27374d526d829db2bfdde6ed' },
  { id: 'campus', name: 'Campus', palette: '112d4e3f72afdbe2eff9f7f7' },
  { id: 'atoll', name: 'Atoll', palette: '364f6b3fc1c9f5f5f5fc5185' },
  { id: 'narra', name: 'Narra', palette: '2c36393f4e4fa27b5cdcd7c9' },
  { id: 'mango', name: 'Mango', palette: '0a1931185adbffc947efefef' },
  { id: 'gumamela', name: 'Gumamela', palette: '2b2e4ae84545903749eaeaea' },
  { id: 'palay', name: 'Palay', palette: '004225f5f5dcffb000ffcf9d' },
];
export const DEFAULT_PALETTE = THEME_PRESETS[0]!.palette;

const HEX24 = /^[0-9a-f]{24}$/;

/** Accepts `https://colorhunt.co/palette/<24 hex>` (query/fragment ignored) or the bare 24-hex string. */
export function parseColorHunt(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (HEX24.test(s)) return s;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || (url.hostname !== 'colorhunt.co' && url.hostname !== 'www.colorhunt.co')) return null;
  const m = url.pathname.match(/^\/palette\/([0-9a-f]{24})\/?$/);
  return m ? m[1]! : null;
}
export const paletteColors = (p: string): string[] => [0, 6, 12, 18].map((i) => `#${p.slice(i, i + 6)}`);

// ── colour maths (sRGB, WCAG 2.x) ────────────────────────────────────────────────────────────────────
type RGB = readonly [number, number, number];
const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as RGB;
const toHex = (c: RGB) =>
  `#${c
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const luminance = (hex: string) => {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex([0, 1, 2].map((i) => x[i]! * (1 - t) + y[i]! * t) as unknown as RGB);
};
const saturation = (hex: string) => {
  const c = toRgb(hex).map((v) => v / 255);
  const max = Math.max(...c);
  const min = Math.min(...c);
  return max === 0 ? 0 : (max - min) / max;
};
/** Moves `fg` toward black (or white) in small steps until it reaches `target` contrast against `bg`. */
function ensure(fg: string, bg: string, target: number): string {
  if (contrast(fg, bg) >= target) return fg;
  const toward = luminance(bg) > 0.5 ? '#000000' : '#ffffff';
  for (let t = 0.04; t <= 1; t += 0.04) {
    const c = mix(fg, toward, t);
    if (contrast(c, bg) >= target) return c;
  }
  return toward;
}
const onColor = (bg: string) => (contrast('#ffffff', bg) >= contrast('#111418', bg) ? '#ffffff' : '#111418');
const rgbTriplet = (hex: string) => toRgb(hex).join(', ');

export interface Theme {
  readonly palette: string;
  readonly ink: string;
  readonly onInk: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly link: string;
  readonly tint: string;
  readonly bg: string;
  readonly surface: string;
  readonly text: string;
  readonly muted: string;
  readonly border: string;
  /** Categorical colours for charts (ink-derived first), each ≥ 3:1 against the surface. */
  readonly series: readonly string[];
}

export function deriveTheme(palette: string = DEFAULT_PALETTE): Theme {
  const p = HEX24.test(palette) ? palette : DEFAULT_PALETTE;
  const colors = paletteColors(p);
  const byLum = [...colors].sort((a, b) => luminance(a) - luminance(b));
  const darkest = byLum[0]!;
  const lightest = byLum[3]!;
  const middle = [byLum[1]!, byLum[2]!];
  const accentRaw = [...middle].sort((a, b) => saturation(b) - saturation(a))[0]!;
  const tintRaw = middle.find((c) => c !== accentRaw) ?? middle[0]!;

  // Page background: the lightest colour, washed toward white so long-form reading stays calm.
  const bg = mix(lightest, '#ffffff', luminance(lightest) > 0.75 ? 0.55 : 0.88);
  const surface = '#ffffff';
  // Ink must carry white header text (4.5) and work as heading colour on the page (7).
  const ink = ensure(ensure(darkest, '#ffffff', 7), bg, 7);
  const tint = mix(tintRaw, '#ffffff', luminance(tintRaw) > 0.5 ? 0.45 : 0.82);
  // Every text colour must hold on all three surfaces it appears on: page background, white panels, tinted bands.
  const text = ensure(ensure(mix(ink, '#000000', 0.35), bg, 9), tint, 7);
  const muted = ensure(ensure(ensure(mix(text, bg, 0.38), bg, 4.6), tint, 4.6), '#ffffff', 4.6);
  const accent = ensure(accentRaw, '#ffffff', 4.5); // button background with white text
  const link = ensure(ensure(accentRaw, bg, 4.6), tint, 4.6);
  const border = mix(ink, bg, 0.82);
  const series = [
    ink,
    accent,
    ensure(tintRaw, surface, 3),
    ensure(mix(ink, accentRaw, 0.5), surface, 3),
    ensure(lightest, surface, 3),
  ].filter((c, i, a) => a.indexOf(c) === i);
  return { palette: p, ink, onInk: onColor(ink), accent, onAccent: onColor(accent), link, tint, bg, surface, text, muted, border, series };
}

/**
 * PINASBUS tokens for one palette. Light mode takes the palette as derived; dark mode keeps the dark page and
 * lifts the brand colours until they read on it. `html:root` outranks the stylesheet's own :root rules.
 */
export function themeCss(t: Theme): string {
  const dark = '#0f1512';
  const lightVars = {
    '--pili': t.ink, '--pili-soft': t.tint, '--sili': t.accent, '--sili-ink': t.onAccent,
    '--paper': t.bg, '--ink': t.text, '--ash': t.muted, '--line': t.border,
  };
  const acc = ensure(t.accent, dark, 4.5);
  const darkVars = {
    '--pili': ensure(mix(t.ink, '#ffffff', 0.5), dark, 7), '--pili-soft': mix(t.ink, dark, 0.7),
    '--sili': acc, '--sili-ink': onColor(acc),
  };
  const css = (v: Record<string, string>) => Object.entries(v).map(([k, x]) => `${k}:${x}`).join(';');
  return `@media (prefers-color-scheme: light){html:root{${css(lightVars)}}}@media (prefers-color-scheme: dark){html:root{${css(darkVars)}}}`;
}
