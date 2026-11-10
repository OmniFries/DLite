import type { Editor } from '../Editor';
import type { VectorLayer } from '../Layer';
import { loadGeom } from '../vector/geom';
import { applyMatrix, unionBounds, type Bounds, type Matrix, type VectorItem } from '../vector/VectorItem';
import type { PointerInfo, Tool } from './Tool';

/** Handle positions as fractions of the selection box; 'rot' sits above the top edge. */
const HANDLES = [
  { id: 'nw', fx: 0, fy: 0, cursor: 'nwse-resize' },
  { id: 'n', fx: 0.5, fy: 0, cursor: 'ns-resize' },
  { id: 'ne', fx: 1, fy: 0, cursor: 'nesw-resize' },
  { id: 'e', fx: 1, fy: 0.5, cursor: 'ew-resize' },
  { id: 'se', fx: 1, fy: 1, cursor: 'nwse-resize' },
  { id: 's', fx: 0.5, fy: 1, cursor: 'ns-resize' },
  { id: 'sw', fx: 0, fy: 1, cursor: 'nesw-resize' },
  { id: 'w', fx: 0, fy: 0.5, cursor: 'ew-resize' },
] as const;
type HandleId = (typeof HANDLES)[number]['id'] | 'rot';

const ROT_OFFSET = 28; // px above the box
const HANDLE_HIT = 8; // px

const ACCENT = '#1a73e8';

interface Drag {
  mode: 'move' | 'box' | 'scale' | 'rotate';
  handle?: HandleId;
  x0: number;
  y0: number;
  x: number;
  y: number;
  box: Bounds | null;
  items: VectorItem[];
  shift: boolean;
  alt: boolean;
}

/**
 * Animate-style Selection tool for vector layers: click a stroke to select
 * it (Shift adds), drag to move, drag on empty space for a box selection,
 * drag the handles to scale, drag the round handle to rotate.
 */
export class VectorSelectTool implements Tool {
  readonly id = 'select';
  private drag: Drag | null = null;
  private hoverCursor = 'default';
  private busy = false;

  cursor() {
    return this.drag?.mode === 'rotate' ? 'grabbing' : this.hoverCursor;
  }

  private layer(ed: Editor): VectorLayer | null {
    const l = ed.doc.active;
    return l.kind === 'vector' ? l : null;
  }

  private selected(ed: Editor, layer: VectorLayer) {
    return layer.items.filter((i) => ed.selection.has(i.id));
  }

  private selectionBox(ed: Editor, layer: VectorLayer): Bounds | null {
    return unionBounds(this.selected(ed, layer).map((i) => i.bounds));
  }

  /** Screen positions of the handles for a doc-space box. */
  private handlePoints(ed: Editor, b: Bounds) {
    const vp = ed.viewport;
    const pts = HANDLES.map((h) => {
      const [x, y] = vp.toScreen(b.x + b.w * h.fx, b.y + b.h * h.fy);
      return { id: h.id as HandleId, x, y, cursor: h.cursor as string };
    });
    const [tx, ty] = vp.toScreen(b.x + b.w / 2, b.y);
    pts.push({ id: 'rot', x: tx, y: ty - ROT_OFFSET, cursor: 'grab' });
    return pts;
  }

  private handleAt(ed: Editor, layer: VectorLayer, sx: number, sy: number) {
    if (!ed.selection.size || layer.locked) return null;
    const b = this.selectionBox(ed, layer);
    if (!b) return null;
    for (const h of this.handlePoints(ed, b)) {
      if (Math.abs(h.x - sx) <= HANDLE_HIT && Math.abs(h.y - sy) <= HANDLE_HIT) return h;
    }
    return null;
  }

  private hitTop(layer: VectorLayer, x: number, y: number, r: number): VectorItem | null {
    for (let i = layer.items.length - 1; i >= 0; i--) {
      if (layer.items[i].hit(x, y, r)) return layer.items[i];
    }
    return null;
  }

  hover(ed: Editor, e: PointerInfo) {
    const layer = this.layer(ed);
    let c = 'default';
    if (layer) {
      const h = this.handleAt(ed, layer, e.sx, e.sy);
      if (h) c = h.cursor;
      else if (this.hitTop(layer, e.x, e.y, 3 / ed.viewport.zoom)) c = 'move';
    }
    if (c !== this.hoverCursor) {
      this.hoverCursor = c;
      ed.refreshCursor();
    }
  }

  down(ed: Editor, e: PointerInfo) {
    if (this.busy) return;
    const layer = this.layer(ed);
    if (!layer) return ed.toast('Select a vector layer to pick strokes');
    const base = { x0: e.x, y0: e.y, x: e.x, y: e.y, shift: e.shift, alt: e.alt };

    const h = this.handleAt(ed, layer, e.sx, e.sy);
    if (h) {
      const box = this.selectionBox(ed, layer);
      this.drag = { ...base, mode: h.id === 'rot' ? 'rotate' : 'scale', handle: h.id, box, items: this.selected(ed, layer) };
      this.startPreview(ed);
      ed.refreshCursor();
      return;
    }

    const hit = this.hitTop(layer, e.x, e.y, 3 / ed.viewport.zoom);
    const sel = ed.selection;
    if (hit) {
      if (e.shift) {
        if (sel.has(hit.id)) sel.delete(hit.id);
        else sel.add(hit.id);
      } else if (!sel.has(hit.id)) {
        sel.clear();
        sel.add(hit.id);
      }
      ed.selectionChanged();
      if (layer.locked || !sel.has(hit.id)) return;
      this.drag = { ...base, mode: 'move', box: this.selectionBox(ed, layer), items: this.selected(ed, layer) };
      this.startPreview(ed);
    } else {
      if (!e.shift) sel.clear();
      this.drag = { ...base, mode: 'box', box: null, items: [] };
      ed.selectionChanged();
    }
  }

  /** Hides the originals and draws them through the live matrix. */
  private startPreview(ed: Editor) {
    const d = this.drag!;
    ed.overlay = {
      hiddenIds: new Set(d.items.map((i) => i.id)),
      vector: (ctx) => {
        const m = this.matrix();
        ctx.save();
        ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        for (const it of d.items) it.draw(ctx);
        ctx.restore();
      },
    };
  }

  /** The transform implied by the current drag. */
  private matrix(): Matrix {
    const d = this.drag;
    if (!d || !d.box) return [1, 0, 0, 1, 0, 0];
    const b = d.box;
    if (d.mode === 'move') {
      let dx = d.x - d.x0, dy = d.y - d.y0;
      if (d.shift) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      return [1, 0, 0, 1, dx, dy];
    }
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (d.mode === 'rotate') {
      let a = Math.atan2(d.y - cy, d.x - cx) - Math.atan2(d.y0 - cy, d.x0 - cx);
      if (d.shift) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      const c = Math.cos(a), s = Math.sin(a);
      return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
    }
    // scale
    const h = HANDLES.find((k) => k.id === d.handle)!;
    const ax = d.alt ? cx : b.x + b.w * (1 - h.fx);
    const ay = d.alt ? cy : b.y + b.h * (1 - h.fy);
    const hx = b.x + b.w * h.fx, hy = b.y + b.h * h.fy;
    // Measure from the handle itself so grabbing it slightly off-center doesn't jump.
    const px = d.x + (hx - d.x0), py = d.y + (hy - d.y0);
    let sx = h.fx === 0.5 || hx === ax ? 1 : (px - ax) / (hx - ax);
    let sy = h.fy === 0.5 || hy === ay ? 1 : (py - ay) / (hy - ay);
    if (d.shift && h.fx !== 0.5 && h.fy !== 0.5) {
      const s = Math.max(Math.abs(sx), Math.abs(sy));
      sx = Math.sign(sx || 1) * s;
      sy = Math.sign(sy || 1) * s;
    }
    const min = 0.01;
    if (Math.abs(sx) < min) sx = Math.sign(sx || 1) * min;
    if (Math.abs(sy) < min) sy = Math.sign(sy || 1) * min;
    return [sx, 0, 0, sy, ax - sx * ax, ay - sy * ay];
  }

  move(ed: Editor, e: PointerInfo) {
    const d = this.drag;
    if (!d) return;
    d.x = e.x;
    d.y = e.y;
    d.shift = e.shift;
    d.alt = e.alt;
    ed.requestRender();
  }

  up(ed: Editor) {
    const d = this.drag;
    const layer = this.layer(ed);
    if (!d || !layer) {
      this.drag = null;
      return;
    }
    if (d.mode === 'box') {
      const x0 = Math.min(d.x0, d.x), x1 = Math.max(d.x0, d.x);
      const y0 = Math.min(d.y0, d.y), y1 = Math.max(d.y0, d.y);
      if (x1 - x0 > 1 || y1 - y0 > 1) {
        for (const it of layer.items) {
          const b = it.bounds;
          if (b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1) ed.selection.add(it.id);
        }
      }
      this.drag = null;
      ed.selectionChanged();
      return;
    }
    const m = this.matrix();
    const identity = m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && Math.abs(m[4]) < 0.01 && Math.abs(m[5]) < 0.01;
    if (identity) {
      this.finish(ed);
      return;
    }
    const label = d.mode === 'move' ? 'Move' : d.mode === 'rotate' ? 'Rotate' : 'Scale';
    this.busy = true;
    void loadGeom()
      .then((g) => ed.updateItems(layer, d.items.map((i) => g.transform(i, m)), label))
      .finally(() => {
        this.busy = false;
        this.finish(ed);
      });
  }

  private finish(ed: Editor) {
    this.drag = null;
    ed.overlay = null;
    ed.refreshCursor();
    ed.requestRender();
  }

  cancel(ed: Editor) {
    if (this.drag && this.drag.mode !== 'box') ed.overlay = null;
    this.drag = null;
    ed.requestRender();
  }

  drawScreen(ctx: CanvasRenderingContext2D, ed: Editor) {
    const layer = this.layer(ed);
    const vp = ed.viewport;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = ACCENT;
    if (layer && ed.selection.size) {
      const d = this.drag;
      const transforming = d && d.mode !== 'box';
      const m = transforming ? this.matrix() : null;
      const items = this.selected(ed, layer);
      // Thin outline per item, then one box with handles for the whole selection.
      ctx.globalAlpha = 0.55;
      for (const it of items) this.strokeBox(ctx, ed, it.bounds, m);
      ctx.globalAlpha = 1;
      const box = transforming ? d!.box : unionBounds(items.map((i) => i.bounds));
      if (box) {
        this.strokeBox(ctx, ed, box, m);
        if (!transforming && !layer.locked) this.drawHandles(ctx, ed, box);
      }
    }
    if (this.drag?.mode === 'box') {
      const [ax, ay] = vp.toScreen(this.drag.x0, this.drag.y0);
      const [bx, by] = vp.toScreen(this.drag.x, this.drag.y);
      ctx.fillStyle = 'rgba(26,115,232,0.08)';
      ctx.setLineDash([4, 3]);
      ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      ctx.strokeRect(Math.min(ax, bx) + 0.5, Math.min(ay, by) + 0.5, Math.abs(bx - ax), Math.abs(by - ay));
    }
    ctx.restore();
  }

  /** Draws a doc-space box (optionally transformed) as a screen-space polygon. */
  private strokeBox(ctx: CanvasRenderingContext2D, ed: Editor, b: Bounds, m: Matrix | null) {
    const corners = [
      [b.x, b.y],
      [b.x + b.w, b.y],
      [b.x + b.w, b.y + b.h],
      [b.x, b.y + b.h],
    ].map(([x, y]) => ed.viewport.toScreen(...(m ? applyMatrix(m, x, y) : ([x, y] as [number, number]))));
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i ? ctx.lineTo(x + 0.5, y + 0.5) : ctx.moveTo(x + 0.5, y + 0.5)));
    ctx.closePath();
    ctx.stroke();
  }

  private drawHandles(ctx: CanvasRenderingContext2D, ed: Editor, b: Bounds) {
    const pts = this.handlePoints(ed, b);
    const rot = pts.find((p) => p.id === 'rot')!;
    const [tx, ty] = ed.viewport.toScreen(b.x + b.w / 2, b.y);
    ctx.beginPath();
    ctx.moveTo(tx + 0.5, ty);
    ctx.lineTo(rot.x + 0.5, rot.y + 5);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const p of pts) {
      ctx.beginPath();
      if (p.id === 'rot') ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      else ctx.rect(Math.round(p.x) - 3.5, Math.round(p.y) - 3.5, 7, 7);
      ctx.fill();
      ctx.stroke();
    }
  }
}
