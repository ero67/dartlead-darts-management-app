// Where to crop the source image and how big to draw it: square crops the
// centre, otherwise the whole image; the longer side shrinks to maxSide,
// never grows.
export function fitImage(width, height, { maxSide, square }) {
  const side = Math.min(width, height);
  const sw = square ? side : width;
  const sh = square ? side : height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  return {
    sx: Math.round((width - sw) / 2),
    sy: Math.round((height - sh) / 2),
    sw,
    sh,
    dw: Math.round(sw * scale),
    dh: Math.round(sh * scale),
  };
}
