// Generate Android launcher icons and splash screens from the PWA logo that
// already lives in public/. The generated PNGs are gitignored (binary build
// inputs); run `npm run android:assets` after cloning or when the logo changes.
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const BG = '#0f172a'; // matches theme_color / background_color in vite.config.js

// The generator resolves --assetPath relative to the project root, so the
// staging directory has to live inside the repo (it is gitignored).
const dir = '.cap-assets-tmp';
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir);
try {
  copyFileSync('public/pwa-maskable-512x512.png', join(dir, 'logo.png'));
  const result = spawnSync(
    'npx',
    [
      'capacitor-assets', 'generate', '--android',
      '--assetPath', dir,
      '--iconBackgroundColor', BG, '--iconBackgroundColorDark', BG,
      '--splashBackgroundColor', BG, '--splashBackgroundColorDark', BG,
    ],
    { stdio: 'inherit' }
  );
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
