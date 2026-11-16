// Where to crop the source image and how big to draw it: a picked crop
// (source pixels) wins; otherwise square crops the centre and non-square
// keeps the whole image. The longer side shrinks to maxSide, never grows.
export function fitImage(width, height, { maxSide, square, crop }) {
  const side = Math.min(width, height);
  const sw = crop ? crop.width : square ? side : width;
  const sh = crop ? crop.height : square ? side : height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  return {
    sx: crop ? crop.x : Math.round((width - sw) / 2),
    sy: crop ? crop.y : Math.round((height - sh) / 2),
    sw,
    sh,
    dw: Math.round(sw * scale),
    dh: Math.round(sh * scale),
  };
}
