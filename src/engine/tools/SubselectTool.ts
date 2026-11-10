import type { Editor } from '../Editor';
import type { VectorLayer } from '../Layer';
import { geomSync, type Geom } from '../vector/geom';
import type { Anchor, VectorItem } from '../vector/VectorItem';
import type { PointerInfo, Tool } from './Tool';

const ACCENT = '#1a73e8';
const HIT = 7; // px

interface Target {
  layer: VectorLayer;
  item: VectorItem;
  /** Strokes: one open contour (the centerline). Shapes: one closed contour per sub-path. */
  contours: Anchor[][];
  closed: boolean;
}

type Part = 'anchor' | 'in' | 'out';

interface Drag {
  part: Part | 'pull';
  c: number;
  i: number;
  orig: Anchor;
  x0: number;
  y0: number;
  moved: boolean;
}

/**
 * Animate's Subselection tool (A): shows the anchor points of a stroke's
 * centerline or a shape's outline. Drag points or their handles to reshape,
 * Alt-drag a point to pull out curve handles, double-click the line to add a
 * point, Delete removes the selected point.
 */
export class SubselectTool implements Tool {
  readonly id = 'subselect';
  private target: Target | null = null;
  private sel: { c: number; i: number } | null = null;
  private drag: Drag | null = null;
  private lastDown = { t: 0, x: 0, y: 0 };
  private hoverCursor = 'default';

  cursor() {
    return this.drag ? 'grabbing' : this.hoverCursor;
  }

  private screen(ed: Editor, x: number, y: number) {
    return ed.viewport.toScreen(x, y);
  }

  /** Anchor or handle under the pointer (handles only for the selected anchor). */
  private partAt(ed: Editor, sx: number, sy: number): { part: Part; c: number; i: number } | null {
    const t = this.target;
    if (!t) return null;
    const near = (x: number, y: number) => {
      const [px, py] = this.screen(ed, x, y);
      return Math.abs(px - sx) <= HIT && Math.abs(py - sy) <= HIT;
    };
    if (this.sel) {
      const a = t.contours[this.sel.c]?.[this.sel.i];
      if (a) {
        if ((a.hox || a.hoy) && near(a.x + a.hox, a.y + a.hoy)) return { part: 'out', ...this.sel };
        if ((a.hix || a.hiy) && near(a.x + a.hix, a.y + a.hiy)) return { part: 'in', ...this.sel };
      }
    }
    for (let c = 0; c < t.contours.length; c++) {
      for (let i = 0; i < t.contours[c].length; i++) {
        const a = t.contours[c][i];
        if (near(a.x, a.y)) return { part: 'anchor', c, i };
      }
    }
    return null;
  }

  private hitItem(ed: Editor, layer: VectorLayer, x: number, y: number): VectorItem | null {
    const r = 4 / ed.viewport.zoom;
    for (let i = layer.items.length - 1; i >= 0; i--) if (layer.items[i].hit(x, y, r)) return layer.items[i];
    return null;
  }

  private open(ed: Editor, g: Geom, layer: VectorLayer, item: VectorItem) {
    this.target =
      item.kind === 'stroke'
        ? { layer, item, contours: [item.spine ?? g.fitSpine(item.points)], closed: false }
        : { layer, item, contours: g.shapeContours(item), closed: true };
    this.sel = null;
    ed.selection.clear();
    ed.selection.add(item.id);
    ed.selectionChanged();
  }

  /** Builds the edited item from the current contours. */
  private build(g: Geom, t: Target): VectorItem {
    if (t.item.kind === 'stroke') {
      const spine = t.contours[0];
      return t.item.with({ points: g.sampleSpine(spine), spine });
    }
    return g.shapeFromContours(t.contours, t.item);
  }

  hover(ed: Editor, e: PointerInfo) {
    const layer = ed.doc.active;
    let c = 'default';
    if (this.partAt(ed, e.sx, e.sy)) c = 'pointer';
    else if (layer.kind === 'vector' && this.hitItem(ed, layer, e.x, e.y)) c = 'crosshair';
    if (c !== this.hoverCursor) {
      this.hoverCursor = c;
      ed.refreshCursor();
    }
  }

  down(ed: Editor, e: PointerInfo) {
    const layer = ed.doc.active;
    if (layer.kind !== 'vector') return ed.toast('Select a vector layer to edit points');
    const g = geomSync();
    if (!g) return ed.toast('Loading vector tools… try again in a moment');
    if (this.target && this.target.layer !== layer) this.target = null;
    // Keep the target in sync with undo/redo.
    if (this.target) {
      const cur = layer.items.find((i) => i.id === this.target!.item.id);
      if (!cur) this.target = null;
      else if (cur !== this.target.item) this.open(ed, g, layer, cur);
    }

    const dbl = performance.now() - this.lastDown.t < 350 && Math.hypot(e.sx - this.lastDown.x, e.sy - this.lastDown.y) < 6;
    this.lastDown = { t: performance.now(), x: e.sx, y: e.sy };

    const part = this.partAt(ed, e.sx, e.sy);
    if (part && !layer.locked) {
      const a = this.target!.contours[part.c][part.i];
      this.sel = { c: part.c, i: part.i };
      this.drag = { part: part.part === 'anchor' && e.alt ? 'pull' : part.part, c: part.c, i: part.i, orig: { ...a }, x0: e.x, y0: e.y, moved: false };
      ed.refreshCursor();
      ed.requestRender();
      return;
    }

    const hit = this.hitItem(ed, layer, e.x, e.y);
    if (dbl && this.target && hit?.id === this.target.item.id && !layer.locked) {
      this.addPoint(ed, g, e.x, e.y);
      return;
    }
    if (hit) {
      if (hit.id !== this.target?.item.id) this.open(ed, g, layer, hit);
      else this.sel = null;
    } else {
      this.target = null;
      this.sel = null;
      ed.selection.clear();
      ed.selectionChanged();
    }
    ed.requestRender();
  }

  move(ed: Editor, e: PointerInfo) {
    const d = this.drag, t = this.target;
    const g = geomSync();
    if (!d || !t || !g) return;
    d.moved = true;
    const o = d.orig;
    const a: Anchor = { ...o };
    const dx = e.x - d.x0, dy = e.y - d.y0;
    if (d.part === 'anchor') {
      a.x = o.x + dx;
      a.y = o.y + dy;
    } else if (d.part === 'pull') {
      // Alt-drag a point: pull symmetric curve handles out of it.
      a.hox = e.x - o.x;
      a.hoy = e.y - o.y;
      a.hix = -a.hox;
      a.hiy = -a.hoy;
    } else {
      const key = d.part === 'out' ? (['hox', 'hoy'] as const) : (['hix', 'hiy'] as const);
      const other = d.part === 'out' ? (['hix', 'hiy'] as const) : (['hox', 'hoy'] as const);
      a[key[0]] = o[key[0]] + dx;
      a[key[1]] = o[key[1]] + dy;
      if (!e.alt) {
        // Keep the curve smooth: the opposite handle points the other way, keeping its length.
        const len = Math.hypot(o[other[0]], o[other[1]]);
        const l2 = Math.hypot(a[key[0]], a[key[1]]) || 1;
        if (len > 0) {
          a[other[0]] = (-a[key[0]] / l2) * len;
          a[other[1]] = (-a[key[1]] / l2) * len;
        }
      }
    }
    t.contours = t.contours.map((c, ci) => (ci === d.c ? c.map((p, i) => (i === d.i ? a : p)) : c));
    const preview = this.build(g, t);
    ed.overlay = { hiddenIds: new Set([t.item.id]), vector: (ctx) => preview.draw(ctx) };
    ed.requestRender();
  }

  up(ed: Editor) {
    const d = this.drag;
    this.drag = null;
    ed.refreshCursor();
    if (!d || !d.moved) return;
    this.commit(ed, 'Edit points');
  }

  private commit(ed: Editor, label: string) {
    const t = this.target, g = geomSync();
    if (!t || !g) return;
    const item = this.build(g, t);
    ed.overlay = null;
    ed.updateItems(t.layer, [item], label);
    t.item = item;
  }

  private addPoint(ed: Editor, g: Geom, x: number, y: number) {
    const t = this.target!;
    // Insert into the contour whose curve passes closest to the click.
    let best: { c: number; anchors: Anchor[]; index: number; d: number } | null = null;
    t.contours.forEach((contour, c) => {
      const r = g.insertAnchor(contour, t.closed, x, y);
      if (!r) return;
      const a = r.anchors[r.index];
      const d = Math.hypot(a.x - x, a.y - y);
      if (!best || d < best.d) best = { c, anchors: r.anchors, index: r.index, d };
    });
    if (!best) return;
    const b = best as { c: number; anchors: Anchor[]; index: number };
    t.contours = t.contours.map((c, i) => (i === b.c ? b.anchors : c));
    this.sel = { c: b.c, i: b.index };
    this.commit(ed, 'Add point');
  }

  onDelete(ed: Editor): boolean {
    const t = this.target, s = this.sel;
    if (!t || !s || t.layer.locked) return false;
    const contour = t.contours[s.c];
    const min = t.closed ? 3 : 2;
    if (contour.length <= min) {
      ed.toast('A line needs at least ' + min + ' points');
      return true;
    }
    t.contours = t.contours.map((c, i) => (i === s.c ? c.filter((_, j) => j !== s.i) : c));
    this.sel = null;
    this.commit(ed, 'Delete point');
    ed.requestRender();
    return true;
  }

  cancel(ed: Editor) {
    this.drag = null;
    this.target = null;
    this.sel = null;
    ed.overlay = null;
    ed.requestRender();
  }

  drawScreen(ctx: CanvasRenderingContext2D, ed: Editor) {
    const t = this.target;
    if (!t || ed.doc.active !== t.layer) return;
    if (!this.drag) {
      // Follow undo/redo: re-read the item's points if it changed underneath us.
      const cur = t.layer.items.find((i) => i.id === t.item.id);
      if (!cur) return;
      const g = geomSync();
      if (cur !== t.item && g) {
        t.item = cur;
        t.contours = cur.kind === 'stroke' ? [cur.spine ?? g.fitSpine(cur.points)] : g.shapeContours(cur);
        this.sel = null;
      }
    }
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = ACCENT;
    // The path being edited.
    for (const contour of t.contours) {
      ctx.beginPath();
      contour.forEach((a, i) => {
        const [x, y] = this.screen(ed, a.x, a.y);
        if (i === 0) ctx.moveTo(x, y);
        else {
          const p = contour[i - 1];
          const [c1x, c1y] = this.screen(ed, p.x + p.hox, p.y + p.hoy);
          const [c2x, c2y] = this.screen(ed, a.x + a.hix, a.y + a.hiy);
          ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
        }
      });
      if (t.closed && contour.length > 1) {
        const p = contour[contour.length - 1], a = contour[0];
        const [c1x, c1y] = this.screen(ed, p.x + p.hox, p.y + p.hoy);
        const [c2x, c2y] = this.screen(ed, a.x + a.hix, a.y + a.hiy);
        const [x, y] = this.screen(ed, a.x, a.y);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
      }
      ctx.stroke();
    }
    // Handles of the selected point.
    const s = this.sel && t.contours[this.sel.c]?.[this.sel.i];
    if (s) {
      const [ax, ay] = this.screen(ed, s.x, s.y);
      for (const [hx, hy] of [
        [s.hix, s.hiy],
        [s.hox, s.hoy],
      ]) {
        if (!hx && !hy) continue;
        const [x, y] = this.screen(ed, s.x + hx, s.y + hy);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = ACCENT;
        ctx.fill();
      }
    }
    // Anchor points.
    t.contours.forEach((contour, c) =>
      contour.forEach((a, i) => {
        const [x, y] = this.screen(ed, a.x, a.y);
        const on = this.sel?.c === c && this.sel.i === i;
        ctx.fillStyle = on ? ACCENT : '#fff';
        ctx.beginPath();
        ctx.rect(Math.round(x) - 3.5, Math.round(y) - 3.5, 7, 7);
        ctx.fill();
        ctx.stroke();
      }),
    );
    ctx.restore();
  }
}
