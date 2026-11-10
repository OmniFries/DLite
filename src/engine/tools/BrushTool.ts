import type { Editor } from '../Editor';
import type { RasterLayer, VectorLayer } from '../Layer';
import { BrushStroke } from '../brush/BrushEngine';
import { Smoother } from '../brush/Smoother';
import { loadGeom } from '../vector/geom';
import { boundsOfPoints, boundsOverlap, VectorStroke, type StrokePoint, type VectorItem } from '../vector/VectorItem';
import { getStroke } from 'perfect-freehand';
import { ctx2d, makeCanvas } from '../util';
import type { PointerInfo, Tool } from './Tool';

export type BrushMode = 'brush' | 'pencil' | 'eraser';

/**
 * Brush, pencil and eraser.
 * - Raster layers: stamp or erase pixels.
 * - Vector layers: the brush and pencil create editable strokes (Object mode)
 *   or merge into shapes (Merge mode). The eraser either deletes whole strokes
 *   it touches (Stroke mode) or cuts away just the area rubbed over (Free mode).
 */
export class BrushTool implements Tool {
  private strokeCanvas: HTMLCanvasElement | null = null;
  private before: HTMLCanvasElement | null = null;
  private stroke: BrushStroke | null = null;
  private smoother: Smoother | null = null;
  private raster: RasterLayer | null = null;
  // vector state
  private vLayer: VectorLayer | null = null;
  private vPoints: StrokePoint[] = [];
  private vPreview: VectorStroke | null = null;
  private eraseMode: 'stroke' | 'free' | null = null;
  private erased = new Set<number>();
  private hoverPos: { sx: number; sy: number } | null = null;
  /** A vector cut/merge is being computed; ignore new strokes until it lands. */
  private pending = false;

  constructor(readonly id: BrushMode) {}

  cursor() {
    return 'none';
  }

  down(ed: Editor, e: PointerInfo) {
    if (this.pending) return;
    const layer = ed.doc.active;
    if (!layer.visible || layer.locked) {
      ed.toast(layer.locked ? 'This layer is locked' : 'This layer is hidden');
      return;
    }
    const s = ed.settings;
    const pencil = this.id === 'pencil';
    const freeErase = this.id === 'eraser' && layer.kind === 'vector' && s.eraserMode === 'free';
    this.smoother = new Smoother(pencil ? Math.min(s.smoothing, 0.3) : freeErase ? 0.2 : s.smoothing);
    const pt = this.smoother.push({ x: e.x, y: e.y, p: e.p });

    if (layer.kind === 'raster') {
      const { width: w, height: h } = ed.doc;
      if (!this.strokeCanvas || this.strokeCanvas.width !== w || this.strokeCanvas.height !== h) {
        this.strokeCanvas = makeCanvas(w, h);
        this.before = makeCanvas(w, h);
      }
      const sc = ctx2d(this.strokeCanvas);
      sc.clearRect(0, 0, w, h);
      const bc = ctx2d(this.before!);
      bc.clearRect(0, 0, w, h);
      bc.drawImage(layer.canvas, 0, 0);
      this.raster = layer;
      this.stroke = new BrushStroke(sc, {
        color: this.id === 'eraser' ? '#000000' : s.color,
        size: s.size,
        hardness: pencil ? 1 : s.hardness,
        flow: pencil ? 1 : s.flow,
        spacing: 0.12,
        pressureSize: s.pressureSize,
        pressureFlow: s.pressureOpacity && !pencil,
        aliased: pencil,
      });
      this.stroke.add(pt);
      ed.overlay = {
        raster: {
          canvas: this.strokeCanvas,
          op: this.id === 'eraser' ? 'destination-out' : 'source-over',
          alpha: s.opacity,
        },
      };
    } else {
      this.vLayer = layer;
      if (this.id === 'eraser') {
        this.eraseMode = s.eraserMode;
        this.erased = new Set();
        if (this.eraseMode === 'stroke') {
          this.eraseWholeAt(ed, e.x, e.y);
          ed.overlay = { hiddenIds: this.erased };
        } else {
          this.vPoints = [[pt.x, pt.y, 1]];
          ed.overlay = { vector: (ctx) => this.drawFreeEraser(ctx, ed) };
        }
      } else {
        this.vPoints = [[pt.x, pt.y, pt.p]];
        this.vPreview = new VectorStroke(this.vPoints, this.vectorStyle(ed, e));
        const preview = this.vPreview;
        ed.overlay = { vector: (ctx) => preview.draw(ctx) };
      }
    }
    ed.requestRender();
  }

  private vectorStyle(ed: Editor, e: PointerInfo) {
    const s = ed.settings;
    const pencil = this.id === 'pencil';
    return {
      color: s.color,
      size: s.size,
      opacity: s.opacity,
      thinning: pencil || !s.pressureSize ? 0 : 0.6,
      simulatePressure: !pencil && s.pressureSize && e.pointerType === 'mouse',
    };
  }

  /** Outline of the free eraser's path, in document coordinates. */
  private eraserOutline(ed: Editor): number[][] {
    return getStroke(this.vPoints, { size: ed.settings.size, thinning: 0, smoothing: 0.5, streamline: 0.2, last: true });
  }

  private drawFreeEraser(ctx: CanvasRenderingContext2D, ed: Editor) {
    const pts = this.eraserOutline(ed);
    if (pts.length < 3) return;
    ctx.save();
    // The vector layer is drawn on its own scratch canvas, so this only cuts this layer.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private eraseWholeAt(ed: Editor, x: number, y: number) {
    const r = Math.max(1, ed.settings.size / 2);
    for (const it of this.vLayer!.items) {
      if (!this.erased.has(it.id) && it.hit(x, y, r)) this.erased.add(it.id);
    }
  }

  move(ed: Editor, e: PointerInfo) {
    this.hoverPos = { sx: e.sx, sy: e.sy };
    if (!this.smoother) {
      ed.requestRender();
      return;
    }
    const pt = this.smoother.push({ x: e.x, y: e.y, p: e.p });
    if (this.stroke) this.stroke.add(pt);
    else if (this.eraseMode === 'stroke') this.eraseWholeAt(ed, e.x, e.y);
    else if (this.eraseMode === 'free') this.vPoints.push([pt.x, pt.y, 1]);
    else if (this.vPreview) {
      this.vPoints.push([pt.x, pt.y, pt.p]);
      this.vPreview.invalidate();
    }
    ed.requestRender();
  }

  hover(ed: Editor, e: PointerInfo) {
    this.hoverPos = { sx: e.sx, sy: e.sy };
    ed.requestRender();
  }

  up(ed: Editor) {
    if (!this.smoother) return;
    for (const pt of this.smoother.finish()) {
      if (this.stroke) this.stroke.add(pt);
      else if (this.eraseMode === 'free') this.vPoints.push([pt.x, pt.y, 1]);
      else if (this.vPreview) this.vPoints.push([pt.x, pt.y, pt.p]);
    }
    if (this.stroke && this.raster) {
      this.commitRaster(ed);
      this.reset(ed);
    } else if (this.vLayer && this.eraseMode === 'stroke') {
      this.commitWholeErase(ed);
      this.reset(ed);
    } else if (this.vLayer && this.eraseMode === 'free') {
      // Keep the preview on screen until the cut is computed.
      const layer = this.vLayer, outline = this.eraserOutline(ed);
      this.smoother = null;
      this.pending = true;
      void this.commitFreeErase(ed, layer, outline).finally(() => this.reset(ed));
    } else if (this.vLayer && this.vPreview) {
      const layer = this.vLayer, item = this.vPreview;
      item.invalidate();
      this.smoother = null;
      if (ed.settings.drawMode === 'merge') {
        this.pending = true;
        void this.commitMerge(ed, layer, item).finally(() => this.reset(ed));
      }
      else {
        ed.addVectorItems(layer, [item], this.id === 'pencil' ? 'Pencil line' : 'Vector stroke');
        this.reset(ed);
      }
    } else this.reset(ed);
  }

  private commitRaster(ed: Editor) {
    const layer = this.raster!;
    const rect = this.stroke!.dirty.clamp(ed.doc.width, ed.doc.height);
    if (!rect) return;
    const ctx = layer.ctx;
    ctx.save();
    ctx.globalCompositeOperation = this.id === 'eraser' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = ed.settings.opacity;
    ctx.drawImage(this.strokeCanvas!, 0, 0);
    ctx.restore();
    const before = ctx2d(this.before!, true).getImageData(rect.x, rect.y, rect.w, rect.h);
    ed.commitRasterPatch(layer, rect, before, this.id === 'eraser' ? 'Erase' : 'Brush stroke');
  }

  private commitWholeErase(ed: Editor) {
    if (this.erased.size === 0) return;
    const ids = this.erased;
    ed.removeVectorItems(this.vLayer!, this.vLayer!.items.filter((i) => ids.has(i.id)), 'Erase strokes');
  }

  /** Cuts the eraser's area out of every item it overlaps. Untouched strokes stay strokes. */
  private async commitFreeErase(ed: Editor, layer: VectorLayer, outline: number[][]) {
    if (outline.length < 3) return;
    const g = await loadGeom();
    const eraser = g.polygon(outline);
    const eb = boundsOfPoints(outline);
    const result: VectorItem[] = [];
    let changed = false;
    for (const it of layer.items) {
      if (!boundsOverlap(it.bounds, eb)) {
        result.push(it);
        continue;
      }
      const path = g.toPath(it);
      const cut = g.subtract(path, eraser);
      if (Math.abs(g.area(cut) - g.area(path)) < 0.75) {
        result.push(it); // eraser missed it
        continue;
      }
      changed = true;
      const shape = g.toShape(cut, g.shapeStyle(it), it.id);
      if (shape) result.push(shape);
    }
    if (changed) ed.replaceItems(layer, result, 'Erase');
  }

  /**
   * Animate's Merge drawing: the new stroke joins overlapping shapes of the
   * same color and cuts its area out of shapes of other colors underneath.
   */
  private async commitMerge(ed: Editor, layer: VectorLayer, stroke: VectorStroke) {
    const g = await loadGeom();
    let merged = g.toPath(stroke);
    const style = g.shapeStyle(stroke);
    const result: VectorItem[] = [];
    for (const it of layer.items) {
      if (!boundsOverlap(it.bounds, stroke.bounds)) {
        result.push(it);
        continue;
      }
      const path = g.toPath(it);
      if (!g.overlaps(path, merged)) {
        result.push(it);
        continue;
      }
      if (it.style.color.toLowerCase() === style.color.toLowerCase() && it.style.opacity === style.opacity) {
        merged = g.unite(merged, path); // joins and takes the item's place on top
      } else {
        const cut = g.toShape(g.subtract(path, merged), g.shapeStyle(it), it.id);
        if (cut) result.push(cut);
      }
    }
    const shape = g.toShape(merged, style);
    if (shape) result.push(shape);
    ed.replaceItems(layer, result, this.id === 'pencil' ? 'Pencil line' : 'Vector stroke');
  }

  private reset(ed: Editor) {
    this.pending = false;
    this.stroke = null;
    this.smoother = null;
    this.raster = null;
    this.vLayer = null;
    this.vPreview = null;
    this.vPoints = [];
    this.eraseMode = null;
    this.erased = new Set();
    ed.overlay = null;
    ed.requestRender();
  }

  cancel(ed: Editor) {
    this.reset(ed);
  }

  /** Brush outline cursor. */
  drawScreen(ctx: CanvasRenderingContext2D, ed: Editor) {
    if (!this.hoverPos) return;
    const { sx, sy } = this.hoverPos;
    const r = Math.max(1.5, (ed.settings.size * ed.viewport.zoom) / 2);
    const square = this.id === 'eraser' && ed.doc.active.kind === 'vector' && ed.settings.eraserMode === 'stroke';
    ctx.lineWidth = 1;
    for (const [color, grow] of [['rgba(255,255,255,0.9)', 0], ['rgba(32,33,36,0.7)', 1]] as const) {
      ctx.beginPath();
      if (square) {
        // Stroke eraser shows a crossed circle: it removes whole strokes.
        ctx.arc(sx, sy, r + grow, 0, Math.PI * 2);
        const d = (r + grow) * Math.SQRT1_2;
        ctx.moveTo(sx - d, sy - d);
        ctx.lineTo(sx + d, sy + d);
      } else ctx.arc(sx, sy, r + grow, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    if (r < 4) {
      ctx.fillStyle = 'rgba(32,33,36,0.8)';
      ctx.fillRect(sx - 0.5, sy - 6, 1, 4);
      ctx.fillRect(sx - 0.5, sy + 2, 1, 4);
      ctx.fillRect(sx - 6, sy - 0.5, 4, 1);
      ctx.fillRect(sx + 2, sy - 0.5, 4, 1);
    }
  }

  leave(ed: Editor) {
    this.hoverPos = null;
    ed.requestRender();
  }
}
