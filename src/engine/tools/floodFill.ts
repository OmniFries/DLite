/**
 * Scanline flood fill. Returns a mask (1 = filled) of the region connected to
 * (sx, sy) whose color is within `tolerance` (0..255, max channel difference)
 * of the start pixel. Pure function so it can be unit tested.
 */
export function floodMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  tolerance: number,
): Uint8Array | null {
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const mask = new Uint8Array(w * h);
  const i0 = (sy * w + sx) * 4;
  const r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2], a0 = data[i0 + 3];
  const tol = tolerance;
  const match = (p: number) => {
    if (mask[p]) return false;
    const i = p * 4;
    // Fully transparent pixels match each other whatever their RGB.
    if (a0 === 0 && data[i + 3] <= tol) return true;
    return (
      Math.abs(data[i] - r0) <= tol &&
      Math.abs(data[i + 1] - g0) <= tol &&
      Math.abs(data[i + 2] - b0) <= tol &&
      Math.abs(data[i + 3] - a0) <= tol
    );
  };
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    let p = y * w + x;
    while (x > 0 && match(p - 1)) {
      x--;
      p--;
    }
    let up = false, down = false;
    while (x < w && match(p)) {
      mask[p] = 1;
      if (y > 0) {
        const m = match(p - w);
        if (m && !up) stack.push(x, y - 1);
        up = m;
      }
      if (y < h - 1) {
        const m = match(p + w);
        if (m && !down) stack.push(x, y + 1);
        down = m;
      }
      x++;
      p++;
    }
  }
  return mask;
}

/** Grows a mask by one pixel so fills tuck under anti-aliased edges. */
export function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = mask.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (mask[p]) continue;
      if ((x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (y > 0 && mask[p - w]) || (y < h - 1 && mask[p + w])) out[p] = 1;
    }
  }
  return out;
}
