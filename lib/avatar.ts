import { createAvatar } from '@dicebear/core';
import { initials, lorelei, loreleiNeutral, notionists, notionistsNeutral, shapes, thumbs } from '@dicebear/collection';
import multiavatarModule from '@multiavatar/multiavatar';

/**
 * Avatars are rendered on the server as SVG data URIs: no third-party requests (privacy, CSP) and stable output.
 * Styles: DiceBear Notionists (notion-style), Lorelei, Thumbs, Shapes, Initials — all CC0 — and Multiavatar
 * (Multiavatar License v1.0, credited on /about).
 */
const STYLES = { notionists, notionistsNeutral, lorelei, loreleiNeutral, thumbs, shapes, initials } as const;
// The package ships an untyped ES module whose default export is the generator function.
const multiavatar: (seed: string) => string = multiavatarModule;
const cache = new Map<string, string>();

export const AVATAR_STYLES = [
  ['notionists', 'Notion-style'], ['notionistsNeutral', 'Notion-style, plain'], ['lorelei', 'Lorelei'], ['loreleiNeutral', 'Lorelei, plain'],
  ['thumbs', 'Thumbs'], ['shapes', 'Shapes'], ['initials', 'Initials'], ['multiavatar', 'Multiavatar'],
] as const;

export function avatarDataUri(style: string, seed: string, label = ''): string {
  const key = `${style}|${seed}|${label}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let svg: string;
  if (style === 'multiavatar') svg = multiavatar(seed);
  else if (style === 'initials') svg = createAvatar(initials, { seed: label || seed, radius: 50 }).toString();
  else
    svg = createAvatar(style in STYLES ? STYLES[style as keyof typeof STYLES] : notionists, {
      seed,
      radius: 50,
      backgroundColor: ['e8eef5', 'eef3ea', 'f3eef5', 'f5f1e8'],
    }).toString();
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  if (cache.size > 2000) cache.clear(); // shortcut: whole-cache reset instead of LRU; fine at this scale
  cache.set(key, uri);
  return uri;
}
