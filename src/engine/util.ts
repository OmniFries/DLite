export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement, readback = false): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', readback ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new Error('2D canvas not supported');
  return ctx;
}

/** Grows a dirty rectangle to include a circle. */
export class DirtyRect {
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;

  addCircle(x: number, y: number, r: number) {
    this.x0 = Math.min(this.x0, x - r);
    this.y0 = Math.min(this.y0, y - r);
    this.x1 = Math.max(this.x1, x + r);
    this.y1 = Math.max(this.y1, y + r);
  }

  get empty() {
    return this.x0 > this.x1;
  }

  /** Integer rect clamped to [0,w)x[0,h); null when nothing is inside. */
  clamp(w: number, h: number): Rect | null {
    if (this.empty) return null;
    const x = Math.max(0, Math.floor(this.x0) - 1);
    const y = Math.max(0, Math.floor(this.y0) - 1);
    const x1 = Math.min(w, Math.ceil(this.x1) + 1);
    const y1 = Math.min(h, Math.ceil(this.y1) + 1);
    if (x1 <= x || y1 <= y) return null;
    return { x, y, w: x1 - x, h: y1 - y };
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
