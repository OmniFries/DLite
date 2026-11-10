import { DirtyRect, makeCanvas, ctx2d } from '../util';
import type { SamplePoint } from './Smoother';

export interface BrushParams {
  color: string;
  size: number; // diameter in document pixels
  hardness: number; // 0..1
  flow: number; // per-dab alpha 0..1
  spacing: number; // fraction of diameter between dabs
  pressureSize: boolean;
  pressureFlow: boolean;
  /** Pencil mode: hard square-ish dabs aligned to pixels, no anti-aliasing. */
  aliased: boolean;
}

const DAB_RES = 128;
const dabCache = new Map<string, HTMLCanvasElement>();

function dabSprite(color: string, hardness: number): HTMLCanvasElement {
  const key = `${color}|${hardness.toFixed(2)}`;
  let c = dabCache.get(key);
  if (c) return c;
  c = makeCanvas(DAB_RES, DAB_RES);
  const ctx = ctx2d(c);
  const r = DAB_RES / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  const h = Math.min(0.99, Math.max(0, hardness));
  g.addColorStop(0, color);
  g.addColorStop(h, color);
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  if (dabCache.size > 64) dabCache.clear();
  dabCache.set(key, c);
  return c;
}

/**
 * Stamps round dabs along the input path onto a stroke canvas. The stroke
 * canvas is later composited onto the layer with the brush opacity, so dabs
 * inside one stroke never build up past that opacity.
 */
export class BrushStroke {
  readonly dirty = new DirtyRect();
  private prev: SamplePoint | null = null;
  private residual = 0;
  private sprite: HTMLCanvasElement;

  constructor(private ctx: CanvasRenderingContext2D, private params: BrushParams) {
    this.sprite = dabSprite(params.color, params.aliased ? 1 : params.hardness);
  }

  private dab(x: number, y: number, p: number) {
    const P = this.params;
    const pressure = Math.max(0.05, p);
    const d = Math.max(0.5, P.size * (P.pressureSize ? pressure : 1));
    const a = P.flow * (P.pressureFlow ? pressure : 1);
    const ctx = this.ctx;
    ctx.globalAlpha = a;
    if (P.aliased) {
      const s = Math.max(1, Math.round(d));
      ctx.fillStyle = P.color;
      const x0 = Math.round(x - s / 2), y0 = Math.round(y - s / 2);
      if (s <= 2) ctx.fillRect(x0, y0, s, s);
      else {
        // Pixel circle via spans, so pencil lines stay crisp.
        const r = s / 2;
        for (let j = 0; j < s; j++) {
          const dy = j + 0.5 - r;
          const half = Math.sqrt(Math.max(0, r * r - dy * dy));
          const xs = Math.round(x - half), xe = Math.round(x + half);
          if (xe > xs) ctx.fillRect(xs, y0 + j, xe - xs, 1);
        }
      }
    } else {
      ctx.drawImage(this.sprite, x - d / 2, y - d / 2, d, d);
    }
    this.dirty.addCircle(x, y, d / 2 + 1);
  }

  add(pt: SamplePoint) {
    if (!this.prev) {
      this.dab(pt.x, pt.y, pt.p);
      this.prev = pt;
      return;
    }
    const a = this.prev;
    const dist = Math.hypot(pt.x - a.x, pt.y - a.y);
    if (dist === 0) return;
    const P = this.params;
    let t = this.residual;
    while (t <= dist) {
      const f = t / dist;
      const p = a.p + (pt.p - a.p) * f;
      const d = Math.max(0.5, P.size * (P.pressureSize ? Math.max(0.05, p) : 1));
      const step = Math.max(P.aliased ? 1 : 0.5, d * P.spacing);
      this.dab(a.x + (pt.x - a.x) * f, a.y + (pt.y - a.y) * f, p);
      t += step;
    }
    this.residual = t - dist;
    this.prev = pt;
  }
}
