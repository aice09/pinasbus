import { avatarDataUri } from '@/lib/avatar';

/** Server-rendered avatar (SVG data URI, no third-party request). Decorative beside a visible name. */
export function Avatar({ style, seed, name, size = 36 }: { style: string; seed: string; name: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI, nothing to optimise
  return <img className="avatar" src={avatarDataUri(style, seed, name)} width={size} height={size} alt="" />;
}
