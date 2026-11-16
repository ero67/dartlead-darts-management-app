import { supabase } from '../lib/supabase.js';
import { fitImage } from '../lib/imageFit.js';

const BUCKET = 'media';
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

const mediaError = (code) => Object.assign(new Error(code), { code });

// Decode, crop and shrink in the browser so only a small WebP is stored.
async function toWebp(file, { maxSide, square }) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw mediaError('unsupported'); // e.g. HEIC, which Chrome/WebView cannot decode
  }
  const { sx, sy, sw, sh, dw, dh } = fitImage(bitmap.width, bitmap.height, { maxSide, square });
  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  // No background fill: transparent logos stay transparent.
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (!blob || blob.type !== 'image/webp') throw mediaError('unsupported');
  return blob;
}

export const mediaService = {
  // Returns the public URL with a ?v= stamp, so a re-upload busts caches.
  async uploadImage(path, file, { maxSide, square }) {
    if (!file?.type?.startsWith('image/')) throw mediaError('unsupported');
    if (file.size > MAX_INPUT_BYTES) throw mediaError('too_large');
    const blob = await toWebp(file, { maxSide, square });
    try {
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        upsert: true,
        contentType: 'image/webp',
        cacheControl: '31536000',
      });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return `${data.publicUrl}?v=${Date.now()}`;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  },

  async removeImage(path) {
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) throw error;
    } catch (error) {
      console.error('Error removing image:', error);
      throw error;
    }
  },
};
