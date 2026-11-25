'use client';
import { useEffect, useState } from 'react';
import { deriveTheme, paletteColors, parseColorHunt, themeCss } from '@/lib/theme';

type Preset = { id: string; name: string; palette: string };

/**
 * Palette choice with a live preview: the page recolours as you pick, before saving. `allowDefault` adds
 * "Platform default" (stored as an empty value) for personal settings.
 */
export function ThemePicker({ presets, value, platform, allowDefault }: { presets: Preset[]; value: string | null; platform: string; allowDefault?: boolean }) {
  const custom = value && !presets.some((p) => p.palette === value) ? value : '';
  const [choice, setChoice] = useState<string>(value ?? '');
  const [link, setLink] = useState(custom);
  const parsed = link ? parseColorHunt(link) : null;
  const active = choice === 'custom' ? parsed : choice || (allowDefault ? platform : null);

  useEffect(() => {
    let el = document.getElementById('theme-preview') as HTMLStyleElement | null;
    if (!el) { el = document.createElement('style'); el.id = 'theme-preview'; document.head.appendChild(el); }
    el.textContent = active ? themeCss(deriveTheme(active)) : '';
    return () => { el?.remove(); };
  }, [active]);

  const swatch = (p: string) => <span className="swatches" aria-hidden="true">{paletteColors(p).map((c) => <i key={c} style={{ background: c }} />)}</span>;
  return (
    <fieldset className="themes">
      <legend>Colours</legend>
      {allowDefault && (
        <label className="theme-opt"><input type="radio" name="theme_choice" value="" checked={choice === ''} onChange={() => setChoice('')} />{swatch(platform)}<span>Platform default</span></label>
      )}
      {presets.map((p) => (
        <label key={p.id} className="theme-opt"><input type="radio" name="theme_choice" value={p.palette} checked={choice === p.palette} onChange={() => setChoice(p.palette)} />{swatch(p.palette)}<span>{p.name}</span></label>
      ))}
      <label className="theme-opt"><input type="radio" name="theme_choice" value="custom" checked={choice === 'custom'} onChange={() => setChoice('custom')} />{parsed ? swatch(parsed) : <span className="swatches empty" aria-hidden="true" />}<span>From Color Hunt</span></label>
      {choice === 'custom' && (
        <label className="field">Color Hunt palette link
          <input name="theme_link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://colorhunt.co/palette/…" inputMode="url" />
          <span className="note">{link && !parsed ? 'Paste a link like https://colorhunt.co/palette/1b262c0f4c753282b8bbe1fa.' : 'Pick any four-colour palette on colorhunt.co and paste its link. Colours are adjusted for readable contrast.'}</span>
        </label>
      )}
    </fieldset>
  );
}
