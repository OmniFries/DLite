import type { DrawingDocument } from './Document';
import type { Layer } from './Layer';
import type { Viewport } from './Viewport';
import { ctx2d, makeCanvas } from './util';

/** Something a tool wants drawn on top of the active layer while it works. */
export interface LayerOverlay {
  /** Raster: a doc-sized canvas composited onto the layer with this op and alpha. */
  raster?: { canvas: HTMLCanvasElement; op: GlobalCompositeOperation; alpha: number };
  /** Vector: draw extra content in document coordinates (live stroke preview). */
  vector?: (ctx: CanvasRenderingContext2D) => void;
  /** Hide vector items with these ids (e.g. while being erased). */
  hiddenIds?: Set<number>;
}

/** Drawn in screen space after everything else (cursor, selection boxes). */
export type ScreenOverlay = (ctx: CanvasRenderingContext2D, vp: Viewport) => void;

export class Compositor {
  private stack: HTMLCanvasElement; // layers blended together, view-sized
  private stackCtx: CanvasRenderingContext2D;
  private scratch: HTMLCanvasElement; // per-layer, view-sized
  private scratchCtx: CanvasRenderingContext2D;
  private docScratch: HTMLCanvasElement | null = null; // active raster layer + live stroke
  private checker: CanvasPattern | null = null;
  dpr = 1;

  constructor(private view: HTMLCanvasElement) {
    this.stack = makeCanvas(1, 1);
    this.stackCtx = ctx2d(this.stack);
    this.scratch = makeCanvas(1, 1);
    this.scratchCtx = ctx2d(this.scratch);
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    for (const c of [this.view, this.stack, this.scratch]) {
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
  }

  private docTransform(ctx: CanvasRenderingContext2D, vp: Viewport) {
    const s = this.dpr;
    ctx.setTransform(vp.zoom * s, 0, 0, vp.zoom * s, vp.offsetX * s, vp.offsetY * s);
  }

  private drawLayer(
    target: CanvasRenderingContext2D,
    layer: Layer,
    doc: DrawingDocument,
    vp: Viewport,
    overlay: LayerOverlay | null,
  ) {
    const smooth = vp.zoom < 1;
    if (layer.kind === 'raster') {
      let src = layer.canvas;
      if (overlay?.raster) {
        if (!this.docScratch || this.docScratch.width !== doc.width || this.docScratch.height !== doc.height) {
          this.docScratch = makeCanvas(doc.width, doc.height);
        }
        const c = ctx2d(this.docScratch);
        c.globalCompositeOperation = 'copy';
        c.globalAlpha = 1;
        c.drawImage(layer.canvas, 0, 0);
        c.globalCompositeOperation = overlay.raster.op;
        c.globalAlpha = overlay.raster.alpha;
        c.drawImage(overlay.raster.canvas, 0, 0);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
        src = this.docScratch;
      }
      this.docTransform(target, vp);
      target.imageSmoothingEnabled = smooth;
      target.globalAlpha = layer.opacity;
      target.globalCompositeOperation = layer.blend;
      target.drawImage(src, 0, 0);
    } else {
      // Vector layers are drawn at screen resolution so they stay sharp at any zoom.
      const s = this.scratchCtx;
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.clearRect(0, 0, this.scratch.width, this.scratch.height);
      this.docTransform(s, vp);
      for (const it of layer.items) {
        if (!overlay?.hiddenIds?.has(it.id)) it.draw(s);
      }
      overlay?.vector?.(s);
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalAlpha = layer.opacity;
      target.globalCompositeOperation = layer.blend;
      target.drawImage(this.scratch, 0, 0);
    }
    target.globalAlpha = 1;
    target.globalCompositeOperation = 'source-over';
  }

  /** Blends all visible layers (document only, no background) into `target`. */
  renderLayers(target: CanvasRenderingContext2D, doc: DrawingDocument, vp: Viewport, overlay: LayerOverlay | null) {
    doc.layers.forEach((layer, i) => {
      if (!layer.visible) return;
      this.drawLayer(target, layer, doc, vp, i === doc.activeIndex ? overlay : null);
    });
  }

  render(doc: DrawingDocument, vp: Viewport, overlay: LayerOverlay | null, screen: ScreenOverlay | null, bg: string) {
    const v = ctx2d(this.view);
    const s = this.dpr;
    const W = this.view.width, H = this.view.height;

    // 1. Layers blend among themselves on a transparent stack.
    const st = this.stackCtx;
    st.setTransform(1, 0, 0, 1, 0, 0);
    st.clearRect(0, 0, W, H);
    this.renderLayers(st, doc, vp, overlay);

    // 2. Workspace: background, page shadow, transparency checkerboard, then the stack.
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.fillStyle = bg;
    v.fillRect(0, 0, W, H);
    const [x0, y0] = vp.toScreen(0, 0);
    const pw = doc.width * vp.zoom, ph = doc.height * vp.zoom;
    v.save();
    v.shadowColor = 'rgba(60,64,67,0.18)';
    v.shadowBlur = 12 * s;
    v.shadowOffsetY = 2 * s;
    v.fillStyle = '#fff';
    v.fillRect(x0 * s, y0 * s, pw * s, ph * s);
    v.restore();
    v.save();
    v.beginPath();
    v.rect(x0 * s, y0 * s, pw * s, ph * s);
    v.clip();
    v.fillStyle = this.checkerPattern(v);
    v.fillRect(x0 * s, y0 * s, pw * s, ph * s);
    v.drawImage(this.stack, 0, 0);
    v.restore();

    // 3. Pixel grid at high zoom.
    if (vp.zoom >= 12) this.drawPixelGrid(v, doc, vp);

    if (screen) {
      v.setTransform(s, 0, 0, s, 0, 0);
      screen(v, vp);
    }
  }

  private drawPixelGrid(v: CanvasRenderingContext2D, doc: DrawingDocument, vp: Viewport) {
    const s = this.dpr;
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.strokeStyle = 'rgba(128,128,128,0.25)';
    v.lineWidth = 1;
    v.beginPath();
    const [ax, ay] = vp.toDoc(0, 0);
    const [bx, by] = vp.toDoc(vp.width, vp.height);
    const xs = Math.max(0, Math.floor(ax)), xe = Math.min(doc.width, Math.ceil(bx));
    const ys = Math.max(0, Math.floor(ay)), ye = Math.min(doc.height, Math.ceil(by));
    for (let x = xs; x <= xe; x++) {
      const sx = Math.round(vp.toScreen(x, 0)[0] * s) + 0.5;
      v.moveTo(sx, vp.toScreen(0, ys)[1] * s);
      v.lineTo(sx, vp.toScreen(0, ye)[1] * s);
    }
    for (let y = ys; y <= ye; y++) {
      const sy = Math.round(vp.toScreen(0, y)[1] * s) + 0.5;
      v.moveTo(vp.toScreen(xs, 0)[0] * s, sy);
      v.lineTo(vp.toScreen(xe, 0)[0] * s, sy);
    }
    v.stroke();
  }

  private checkerPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
    if (this.checker) return this.checker;
    const c = makeCanvas(16, 16);
    const g = ctx2d(c);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#e8eaed';
    g.fillRect(0, 0, 8, 8);
    g.fillRect(8, 8, 8, 8);
    this.checker = ctx.createPattern(c, 'repeat')!;
    return this.checker;
  }

  /** Flattens the document at 1:1 into a new canvas (for export and the eyedropper). */
  flatten(doc: DrawingDocument): HTMLCanvasElement {
    const out = makeCanvas(doc.width, doc.height);
    const ctx = ctx2d(out, true);
    for (const layer of doc.layers) {
      if (!layer.visible) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blend;
      if (layer.kind === 'raster') ctx.drawImage(layer.canvas, 0, 0);
      else {
        const tmp = makeCanvas(doc.width, doc.height);
        layer.drawItems(ctx2d(tmp));
        ctx.drawImage(tmp, 0, 0);
      }
    }
    return out;
  }
}
