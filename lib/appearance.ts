import { q } from './db';
import { DEFAULT_PALETTE } from './theme';

/** The palette everyone sees unless they choose their own (platform admins set it on /platform/appearance). */
export async function platformPalette(): Promise<string> {
  const [r] = await q<{ value: { palette?: string } }>(`select value from settings where key = 'theme'`).catch(() => []);
  return r?.value.palette ?? DEFAULT_PALETTE;
}
