// Self-check for src/lib/imageFit.js: node scripts/check-image-fit.mjs → "ok"
import assert from 'node:assert/strict';
import { fitImage } from '../src/lib/imageFit.js';

// Square avatar from a landscape photo: centre crop, scaled down.
assert.deepEqual(fitImage(1000, 500, { maxSide: 256, square: true }), { sx: 250, sy: 0, sw: 500, sh: 500, dw: 256, dh: 256 });
// Logo keeps its aspect ratio.
assert.deepEqual(fitImage(2000, 1000, { maxSide: 512, square: false }), { sx: 0, sy: 0, sw: 2000, sh: 1000, dw: 512, dh: 256 });
// Small images are never upscaled.
assert.deepEqual(fitImage(100, 80, { maxSide: 512, square: false }), { sx: 0, sy: 0, sw: 100, sh: 80, dw: 100, dh: 80 });
// Portrait avatar smaller than the target: centre crop, no upscale.
assert.deepEqual(fitImage(80, 100, { maxSide: 256, square: true }), { sx: 0, sy: 10, sw: 80, sh: 80, dw: 80, dh: 80 });
// A crop the user picked (pixels in the source) replaces the centre crop.
assert.deepEqual(fitImage(1000, 800, { maxSide: 256, square: true, crop: { x: 100, y: 50, width: 400, height: 400 } }), { sx: 100, sy: 50, sw: 400, sh: 400, dw: 256, dh: 256 });
// A small picked crop is not upscaled.
assert.deepEqual(fitImage(1000, 800, { maxSide: 256, square: true, crop: { x: 10, y: 20, width: 120, height: 120 } }), { sx: 10, sy: 20, sw: 120, sh: 120, dw: 120, dh: 120 });

console.log('ok');
