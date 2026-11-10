import { dilate, floodMask } from '../tools/floodFill';

/**
 * Traces the outlines of a binary mask along pixel edges. Each loop is a
 * polygon in pixel-corner coordinates. Outer edges run clockwise and holes
 * counter-clockwise (in screen space, y down), so the loops fill correctly
 * with the nonzero rule. Collinear points are dropped.
 */
export function traceMask(mask: Uint8Array, w: number, h: number): number[][][] {
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const W = w + 1;
  // Directed edges keyed by start vertex; a vertex can start up to 2 edges (saddle).
  const next = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = y0 * W + x0;
    const v = y1 * W + x1;
    const list = next.get(k);
    if (list) list.push(v);
    else next.set(k, [v]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!filled(x, y)) continue;
      // Keep the filled pixel on the right-hand side of each edge.
      if (!filled(x, y - 1)) add(x, y, x + 1, y); // top, going right
      if (!filled(x + 1, y)) add(x + 1, y, x + 1, y + 1); // right, going down
      if (!filled(x, y + 1)) add(x + 1, y + 1, x, y + 1); // bottom, going left
      if (!filled(x - 1, y)) add(x, y + 1, x, y); // left, going up
    }
  }
  const loops: number[][][] = [];
  for (const start of [...next.keys()]) {
    while (next.get(start)?.length) {
      const loop: number[][] = [];
      let cur = start;
      let guard = 0;
      do {
        const list = next.get(cur)!;
        const to = list.pop()!;
        if (!list.length) next.delete(cur);
        loop.push([cur % W, Math.floor(cur / W)]);
        cur = to;
        if (++guard > 4 * W * (h + 1)) break;
      } while (cur !== start && next.has(cur));
      loops.push(simplifyCollinear(loop));
    }
  }
  return loops;
}

function simplifyCollinear(loop: number[][]): number[][] {
  const out: number[][] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n], b = loop[i], c = loop[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross !== 0) out.push(b);
  }
  return out;
}

/** Signed polygon area (positive = clockwise in y-down screen space). */
export function signedArea(poly: number[][]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export type FillResult = { loops: number[][][] } | { error: 'not-closed' | 'on-line' };

/**
 * Finds the empty area enclosed by lines around (x, y) in an RGBA image of
 * the layer whose lines were drawn thickened by the gap size. The result is
 * grown by `grow` pixels so it tucks under the lines.
 */
export function enclosedRegion(data: Uint8ClampedArray, w: number, h: number, x: number, y: number, grow: number): FillResult {
  const xi = Math.floor(x), yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= w || yi >= h) return { error: 'not-closed' };
  if (data[(yi * w + xi) * 4 + 3] > 0) return { error: 'on-line' };
  let mask = floodMask(data, w, h, xi, yi, 0);
  if (!mask) return { error: 'not-closed' };
  // Touching the page edge means the area isn't enclosed.
  for (let i = 0; i < w; i++) if (mask[i] || mask[(h - 1) * w + i]) return { error: 'not-closed' };
  for (let j = 0; j < h; j++) if (mask[j * w] || mask[j * w + w - 1]) return { error: 'not-closed' };
  for (let i = 0; i < grow; i++) mask = dilate(mask, w, h);
  return { loops: traceMask(mask, w, h) };
}
