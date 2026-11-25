import type { Metadata } from 'next';
import { savePlatformTheme } from '@/app/actions/platform';
import { ActionForm } from '@/components/ActionForm';
import { ThemePicker } from '@/components/ThemePicker';
import { platformPalette } from '@/lib/appearance';
import { THEME_PRESETS } from '@/lib/theme';

export const metadata: Metadata = { title: 'Appearance' };

export default async function Appearance() {
  const palette = await platformPalette();
  return (
    <>
      <h1 className="page-h">Appearance</h1>
      <p className="lead">The colours everyone sees, unless they pick their own in their settings. The page previews your choice before you save.</p>
      <section className="panel">
        <ActionForm action={savePlatformTheme} submit="Save colours">
          <ThemePicker presets={[...THEME_PRESETS]} value={palette} platform={palette} />
        </ActionForm>
      </section>
    </>
  );
}
