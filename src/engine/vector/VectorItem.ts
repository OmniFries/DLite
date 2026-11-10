import { getStroke } from 'perfect-freehand';

/** A raw input sample: document x, y and pen pressure (0..1). */
export type StrokePoint = [number, number, number];

/** 2D affine matrix [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = [number, number, number, number, number, number];

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StrokeStyle {
  color: string;
  size: number;
  opacity: number;
  /** How much pressure thins the line (0 = constant width). */
  thinning: number;
  /** True for mouse input: perfect-freehand fakes pressure from speed. */
  simulatePressure: boolean;
}

export interface ShapeStyle {
  color: string;
  opacity: number;
}

/** One anchor of an editable Bézier curve. Handles are relative to the anchor. */
export interface Anchor {
  x: number;
  y: number;
  hix: number;
  hiy: number;
  hox: number;
  hoy: number;
  /** Pen pressure at this anchor (strokes only). */
  p: number;
}

let nextItemId = 1;
export const newItemId = () => nextItemId++;

const probeCtx = (() => {
  let c: CanvasRenderingContext2D | null = null;
  return () => (c ??= document.createElement('canvas').getContext('2d')!);
})();

function hitPath(path: Path2D, b: Bounds, x: number, y: number, r: number): boolean {
  if (x + r < b.x || y + r < b.y || x - r > b.x + b.w || y - r > b.y + b.h) return false;
  const ctx = probeCtx();
  if (ctx.isPointInPath(path, x, y)) return true;
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    if (ctx.isPointInPath(path, x + Math.cos(t) * r, y + Math.sin(t) * r)) return true;
  }
  return false;
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** a then b. */
export function multiply(b: Matrix, a: Matrix): Matrix {
  return [
    b[0] * a[0] + b[2] * a[1],
    b[1] * a[0] + b[3] * a[1],
    b[0] * a[2] + b[2] * a[3],
    b[1] * a[2] + b[3] * a[3],
    b[0] * a[4] + b[2] * a[5] + b[4],
    b[1] * a[4] + b[3] * a[5] + b[5],
  ];
}

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function boundsOfPoints(pts: ArrayLike<number[] | readonly number[]>, pad = 0): Bounds {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  if (x0 > x1) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (!list.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of list) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function boundsOverlap(a: Bounds, b: Bounds) {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/**
 * A freehand vector stroke, Animate-style: the input points are kept so the
 * stroke stays editable, and the visible shape is a filled variable-width
 * outline computed from them. Items are immutable: edits create new items
 * (keeping the id), which makes undo a simple swap of item lists.
 */
export class VectorStroke {
  readonly kind = 'stroke' as const;
  readonly id: number;
  readonly points: StrokePoint[];
  readonly style: StrokeStyle;
  /** Bézier centerline, set once the stroke has been edited with the Subselection tool. */
  readonly spine: Anchor[] | null;
  private _outline: number[][] | null = null;
  private _path: Path2D | null = null;
  private _bounds: Bounds | null = null;

  constructor(points: StrokePoint[], style: StrokeStyle, id = newItemId(), spine: Anchor[] | null = null) {
    this.points = points;
    this.style = { ...style };
    this.id = id;
    this.spine = spine;
  }

  /** Only for the live preview while drawing, which appends points. */
  invalidate() {
    this._outline = null;
    this._path = null;
    this._bounds = null;
  }

  get outline(): number[][] {
    if (!this._outline) {
      const s = this.style;
      this._outline = getStroke(this.points, {
        size: s.size,
        thinning: s.thinning,
        smoothing: 0.5,
        streamline: this.spine ? 0 : 0.35,
        simulatePressure: s.simulatePressure,
        last: true,
      });
    }
    return this._outline;
  }

  get path(): Path2D {
    return (this._path ??= new Path2D(outlineToSvgPath(this.outline)));
  }

  get bounds(): Bounds {
    return (this._bounds ??= boundsOfPoints(this.outline, 0.5));
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha *= this.style.opacity;
    ctx.fillStyle = this.style.color;
    ctx.fill(this.path);
    ctx.restore();
  }

  /** True if the circle (x, y, r) touches the filled stroke. */
  hit(x: number, y: number, r: number): boolean {
    return hitPath(this.path, this.bounds, x, y, r);
  }

  with(changes: { points?: StrokePoint[]; style?: Partial<StrokeStyle>; spine?: Anchor[] | null }): VectorStroke {
    return new VectorStroke(
      changes.points ?? this.points,
      { ...this.style, ...changes.style },
      this.id,
      changes.spine !== undefined ? changes.spine : this.spine,
    );
  }

  /** Applies a transform to the geometry. Width scales with the transform's area factor. */
  transformed(m: Matrix): VectorStroke {
    const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const points = this.points.map(([x, y, p]) => [...applyMatrix(m, x, y), p] as StrokePoint);
    const spine = this.spine ? this.spine.map((a) => transformAnchor(a, m)) : null;
    return new VectorStroke(points, { ...this.style, size: this.style.size * scale }, this.id, spine);
  }

  toJSON() {
    return { type: 'stroke', points: this.points, style: this.style, spine: this.spine };
  }
}

/** A filled region (result of free erase, merge or bucket fill), stored as SVG path data. */
export class VectorShape {
  readonly kind = 'shape' as const;
  readonly id: number;
  readonly d: string;
  readonly style: ShapeStyle;
  readonly bounds: Bounds;
  private _path: Path2D | null = null;

  constructor(d: string, style: ShapeStyle, bounds: Bounds, id = newItemId()) {
    this.d = d;
    this.style = { ...style };
    this.bounds = bounds;
    this.id = id;
  }

  get path(): Path2D {
    return (this._path ??= new Path2D(this.d));
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha *= this.style.opacity;
    ctx.fillStyle = this.style.color;
    ctx.fill(this.path);
    ctx.restore();
  }

  hit(x: number, y: number, r: number): boolean {
    return hitPath(this.path, this.bounds, x, y, r);
  }

  with(changes: { style?: Partial<ShapeStyle> }): VectorShape {
    return new VectorShape(this.d, { ...this.style, ...changes.style }, this.bounds, this.id);
  }

  toJSON() {
    return { type: 'shape', d: this.d, style: this.style, bounds: this.bounds };
  }
}

export type VectorItem = VectorStroke | VectorShape;

export function transformAnchor(a: Anchor, m: Matrix): Anchor {
  const [x, y] = applyMatrix(m, a.x, a.y);
  // Handles are vectors: no translation.
  const v = (dx: number, dy: number) => [m[0] * dx + m[2] * dy, m[1] * dx + m[3] * dy];
  const [hix, hiy] = v(a.hix, a.hiy);
  const [hox, hoy] = v(a.hox, a.hoy);
  return { x, y, hix, hiy, hox, hoy, p: a.p };
}

/** Turns a perfect-freehand outline polygon into a smooth closed SVG path. */
export function outlineToSvgPath(pts: number[][]): string {
  const n = pts.length;
  if (n < 2) return '';
  const avg = (a: number, b: number) => (a + b) / 2;
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)} Q`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    d += `${x0.toFixed(2)},${y0.toFixed(2)} ${avg(x0, x1).toFixed(2)},${avg(y0, y1).toFixed(2)} `;
  }
  return d + 'Z';
}
