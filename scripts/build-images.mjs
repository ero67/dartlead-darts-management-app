// Generates the small web images from the committed source PNGs, so no binary
// derivatives live in git. Runs before `dev` and `build` (npm pre-hooks).
//   src/assets/logo-*.webp  shown in the header, auth, summary and landing
//   public/og-image.png     1200x630 link preview card (index.html + api/og)
import { existsSync, statSync } from 'node:fs';
import sharp from 'sharp';

const SRC = { logo: 'src/assets/logo.png', icon: 'src/assets/logo-icon.png' };
const OUT = [
  { src: SRC.icon, dest: 'src/assets/logo-icon-128.webp', size: 128 },
  { src: SRC.logo, dest: 'src/assets/logo-128.webp', size: 128 },
  { src: SRC.logo, dest: 'src/assets/logo-256.webp', size: 256 },
];
const OG = 'public/og-image.png';

const isFresh = (dest, src) => existsSync(dest) && statSync(dest).mtimeMs >= statSync(src).mtimeMs;

for (const { src, dest, size } of OUT) {
  if (isFresh(dest, src)) continue;
  await sharp(src).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82 }).toFile(dest);
}

if (!isFresh(OG, SRC.logo) || !isFresh(OG, new URL(import.meta.url).pathname)) {
  // Dark card with faint dartboard rings; no text, so it renders the same on
  // any build machine (the logo already carries the wordmark).
  const rings = [300, 250, 200, 150]
    .map((r, i) => `<circle cx="1010" cy="315" r="${r}" fill="none" stroke="${i % 2 ? '#16a34a' : '#dc2626'}" stroke-opacity="0.18" stroke-width="22"/>`)
    .join('');
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      <rect width="1200" height="630" fill="#09090b"/>
      <rect width="1200" height="630" fill="url(#g)"/>
      <defs><radialGradient id="g" cx="0.3" cy="0.4" r="0.8"><stop offset="0" stop-color="#16a34a" stop-opacity="0.22"/><stop offset="1" stop-color="#09090b" stop-opacity="0"/></radialGradient></defs>
      ${rings}
    </svg>`
  );
  const logo = await sharp(SRC.logo).resize(520, 520).toBuffer();
  await sharp(background).composite([{ input: logo, left: 120, top: 55 }]).png({ compressionLevel: 9 }).toFile(OG);
}
console.log('images ready');
