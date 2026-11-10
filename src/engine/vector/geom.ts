import type PaperScope from 'paper/dist/paper-core';
import {
  VectorShape,
  VectorStroke,
  type Anchor,
  type Matrix,
  type ShapeStyle,
  type StrokePoint,
  type VectorItem,
} from './VectorItem';

type Paper = typeof PaperScope;
type PathItem = paper.PathItem;

let P: Paper | null = null;
let loading: Promise<Geom> | null = null;
let instance: Geom | null = null;

/** Loads paper.js on first use, so the app starts without it. */
export function loadGeom(): Promise<Geom> {
  if (instance) return Promise.resolve(instance);
  loading ??= import('paper/dist/paper-core').then((m) => {
    P = (m.default ?? m) as Paper;
    P.setup(new P.Size(1, 1));
    P.settings.insertItems = false;
    instance = new Geom(P);
    return instance;
  });
  return loading;
}

/** The geometry helper if it has finished loading, else null (and starts loading). */
export function geomSync(): Geom | null {
  if (!instance) void loadGeom();
  return instance;
}

/** Below this area (px²) a boolean result counts as empty / unchanged. */
const EPS_AREA = 0.75;

export class Geom {
  constructor(private P: Paper) {}

  /** Polygon from an outline point list (perfect-freehand output). */
  polygon(pts: number[][]): PathItem {
    const path = new this.P.Path({ segments: pts.map(([x, y]) => [x, y]), closed: true, insert: false });
    return path;
  }

  /** Any vector item as a closed paper path. */
  toPath(item: VectorItem): PathItem {
    if (item.kind === 'stroke') return this.polygon(item.outline);
    return new this.P.CompoundPath({ pathData: item.d, insert: false, fillRule: 'nonzero' });
  }

  area(p: PathItem): number {
    return Math.abs((p as paper.Path).area ?? 0);
  }

  isEmpty(p: PathItem): boolean {
    return p.isEmpty() || this.area(p) < EPS_AREA;
  }

  subtract(a: PathItem, b: PathItem): PathItem {
    return a.subtract(b, { insert: false });
  }

  unite(a: PathItem, b: PathItem): PathItem {
    return a.unite(b, { insert: false });
  }

  intersect(a: PathItem, b: PathItem): PathItem {
    return a.intersect(b, { insert: false });
  }

  /** True if the two filled paths share some area. */
  overlaps(a: PathItem, b: PathItem): boolean {
    if (!a.bounds.intersects(b.bounds)) return false;
    return !this.isEmpty(this.intersect(a, b));
  }

  /** A shape item from a path, or null if the path has no area. */
  toShape(p: PathItem, style: ShapeStyle, id?: number): VectorShape | null {
    if (this.isEmpty(p)) return null;
    // Drop slivers left by self-crossing freehand outlines.
    if (p instanceof this.P.CompoundPath) {
      for (const c of [...(p.children as paper.Path[])]) if (Math.abs(c.area) < EPS_AREA) c.remove();
      if (this.isEmpty(p)) return null;
    }
    const b = p.bounds;
    return new VectorShape(p.pathData, style, { x: b.x, y: b.y, w: b.width, h: b.height }, id);
  }

  shapeStyle(item: VectorItem): ShapeStyle {
    return { color: item.style.color, opacity: item.style.opacity };
  }

  transform(item: VectorItem, m: Matrix): VectorItem {
    if (item.kind === 'stroke') return item.transformed(m);
    const p = this.toPath(item);
    p.transform(new this.P.Matrix(m[0], m[1], m[2], m[3], m[4], m[5]));
    return this.toShape(p, item.style, item.id) ?? item;
  }

  // ---------- editable curves ----------

  /** Fits a few smooth Bézier anchors through a stroke's centerline. */
  fitSpine(points: StrokePoint[]): Anchor[] {
    if (points.length < 2) {
      const [x, y, p] = points[0] ?? [0, 0, 1];
      return [{ x, y, hix: 0, hiy: 0, hox: 0, hoy: 0, p }];
    }
    const path = new this.P.Path({ segments: points.map(([x, y]) => [x, y]), insert: false });
    path.simplify(2.5);
    return path.segments.map((s) => {
      // Pressure from the nearest raw sample.
      let best = 0, bd = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = (points[i][0] - s.point.x) ** 2 + (points[i][1] - s.point.y) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return {
        x: s.point.x,
        y: s.point.y,
        hix: s.handleIn.x,
        hiy: s.handleIn.y,
        hox: s.handleOut.x,
        hoy: s.handleOut.y,
        p: points[best][2],
      };
    });
  }

  private pathFromAnchors(anchors: Anchor[], closed: boolean): paper.Path {
    return new this.P.Path({
      segments: anchors.map(
        (a) => new this.P.Segment(new this.P.Point(a.x, a.y), new this.P.Point(a.hix, a.hiy), new this.P.Point(a.hox, a.hoy)),
      ),
      closed,
      insert: false,
    });
  }

  /** Evenly spaced centerline samples along a spine, with pressure interpolated between anchors. */
  sampleSpine(anchors: Anchor[], spacing = 1.5): StrokePoint[] {
    if (anchors.length < 2) return anchors.map((a) => [a.x, a.y, a.p]);
    const path = this.pathFromAnchors(anchors, false);
    const len = path.length;
    const out: StrokePoint[] = [];
    const n = Math.max(2, Math.ceil(len / spacing));
    for (let i = 0; i <= n; i++) {
      const loc = path.getLocationAt((len * i) / n);
      if (!loc) continue;
      const ci = loc.curve.index;
      const t = loc.curve.length ? loc.curveOffset / loc.curve.length : 0;
      const p = anchors[ci].p + (anchors[ci + 1].p - anchors[ci].p) * t;
      out.push([loc.point.x, loc.point.y, p]);
    }
    return out;
  }

  /** Splits the curve nearest (x, y) and returns the new anchor list and the new anchor's index. */
  insertAnchor(anchors: Anchor[], closed: boolean, x: number, y: number): { anchors: Anchor[]; index: number } | null {
    if (anchors.length < 2) return null;
    const path = this.pathFromAnchors(anchors, closed);
    const loc = path.getNearestLocation(new this.P.Point(x, y));
    if (!loc) return null;
    const ci = loc.curve.index;
    const t = loc.curve.length ? loc.curveOffset / loc.curve.length : 0;
    const seg = path.divideAt(loc) ? path.segments[ci + 1] : null;
    if (!seg) return null;
    const next = anchors[(ci + 1) % anchors.length];
    const p = anchors[ci].p + (next.p - anchors[ci].p) * t;
    const list = path.segments.map((s, i) => ({
      x: s.point.x,
      y: s.point.y,
      hix: s.handleIn.x,
      hiy: s.handleIn.y,
      hox: s.handleOut.x,
      hoy: s.handleOut.y,
      p: i === ci + 1 ? p : anchors[i > ci ? i - 1 : i].p,
    }));
    return { anchors: list, index: ci + 1 };
  }

  /** Shape outline as editable contours (one anchor list per sub-path). */
  shapeContours(shape: VectorShape): Anchor[][] {
    const p = this.toPath(shape);
    const paths = p instanceof this.P.CompoundPath ? (p.children as paper.Path[]) : [p as paper.Path];
    return paths.map((path) =>
      path.segments.map((s) => ({
        x: s.point.x,
        y: s.point.y,
        hix: s.handleIn.x,
        hiy: s.handleIn.y,
        hox: s.handleOut.x,
        hoy: s.handleOut.y,
        p: 1,
      })),
    );
  }

  shapeFromContours(contours: Anchor[][], shape: VectorShape): VectorShape {
    const cp = new this.P.CompoundPath({ children: contours.map((c) => this.pathFromAnchors(c, true)), insert: false, fillRule: 'nonzero' });
    const b = cp.bounds;
    return new VectorShape(cp.pathData, shape.style, { x: b.x, y: b.y, w: b.width, h: b.height }, shape.id);
  }

  /** Smooth closed shape from traced polygons (bucket fill). */
  shapeFromLoops(loops: number[][][], style: ShapeStyle): VectorShape | null {
    const children = loops
      .filter((l) => l.length >= 3)
      .map((l) => {
        const path = new this.P.Path({ segments: l.map(([x, y]) => [x, y]), closed: true, insert: false });
        path.simplify(0.5);
        return path;
      });
    if (!children.length) return null;
    const cp = new this.P.CompoundPath({ children, insert: false, fillRule: 'nonzero' });
    return this.toShape(cp, style);
  }
}
