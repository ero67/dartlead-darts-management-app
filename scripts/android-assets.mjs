// Generate Android launcher icons and splash screens.
//
// Sources are composed here from the high-resolution transparent logo in
// src/assets/logo-icon.png so the adaptive icon gets proper layers:
//   icon-background.png  solid brand colour, full bleed
//   icon-foreground.png  artwork only, sized for the adaptive safe zone
//   icon-only.png        legacy (pre-Android 8) icon and Play listing
//   splash[-dark].png    brand colour with a modest centred logo
// The generated PNGs are gitignored (binary build inputs); run
// `npm run android:assets` after cloning or when the logo changes.
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const BG = '#0f172a'; // matches theme_color / background_color in vite.config.js
const LOGO = 'src/assets/logo-icon.png';
const RES = 'android/app/src/main/res';

// The generator resolves --assetPath relative to the project root, so the
// staging directory has to live inside the repo (it is gitignored).
const dir = '.cap-assets-tmp';

const solid = (size) => sharp({ create: { width: size, height: size, channels: 4, background: BG } });

// Trim the logo to its opaque bounds and fit it into `box` px, centred on a
// `size` px canvas — transparent by default, or on the brand colour.
async function logoOn(size, box, opaque) {
  const art = await sharp(LOGO).trim().resize(box, box, { fit: 'inside' }).png().toBuffer();
  const base = opaque
    ? solid(size)
    : sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  return base.composite([{ input: art, gravity: 'centre' }]).png().toBuffer();
}

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir);
try {
  // Adaptive icon: the generator insets each 1024px layer by 16.7% into the
  // 108dp canvas, so our full image maps onto the ~72dp visible disc and the
  // safe zone (66dp) is ~92% of it. Artwork at ~72% matches typical launcher icons.
  writeFileSync(join(dir, 'icon-background.png'), await solid(1024).png().toBuffer());
  writeFileSync(join(dir, 'icon-foreground.png'), await logoOn(1024, 740, false));
  writeFileSync(join(dir, 'icon-only.png'), await logoOn(1024, 700, true));
  const splash = await logoOn(2732, 560, true);
  writeFileSync(join(dir, 'splash.png'), splash);
  writeFileSync(join(dir, 'splash-dark.png'), splash);

  // Run the generator's entry point with the current Node binary rather than
  // through `npx`: on Windows spawning `npx` without a shell fails silently.
  const bin = join(require.resolve('@capacitor/assets/package.json'), '..', 'bin', 'capacitor-assets');
  const result = spawnSync(process.execPath, [bin, 'generate', '--android', '--assetPath', dir], { stdio: 'inherit' });
  if (result.error) console.error('Failed to start the asset generator:', result.error.message);
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    // The generator also insets the BACKGROUND layer by 16.7%, so the brand
    // colour never reaches the edge of the launcher mask and the icon shows a
    // white ring with a dark square inside. Let the background fill the mask.
    for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const file = join(RES, 'mipmap-anydpi-v26', name);
      if (!existsSync(file)) continue;
      const xml = readFileSync(file, 'utf8').replace(
        /<inset android:drawable="@mipmap\/ic_launcher_background" android:inset="16\.7%" \/>/,
        '<inset android:drawable="@mipmap/ic_launcher_background" android:inset="0%" />'
      );
      writeFileSync(file, xml);
    }
    // Legacy fallback colour used by launchers that ignore the layers.
    writeFileSync(
      join(RES, 'values', 'ic_launcher_background.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`
    );
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
