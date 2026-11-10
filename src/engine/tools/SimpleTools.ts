import type { Editor } from '../Editor';
import type { VectorLayer } from '../Layer';
import { ctx2d, hexToRgb, makeCanvas, rgbToHex } from '../util';
import { enclosedRegion } from '../vector/fillRegion';
import { loadGeom } from '../vector/geom';
import { dilate, floodMask } from './floodFill';
import type { PointerInfo, Tool } from './Tool';

export class HandTool implements Tool {
  readonly id = 'hand';
  private last: { sx: number; sy: number } | null = null;
  cursor() {
    return this.last ? 'grabbing' : 'grab';
  }
  down(ed: Editor, e: PointerInfo) {
    this.last = { sx: e.sx, sy: e.sy };
    ed.refreshCursor();
  }
  move(ed: Editor, e: PointerInfo) {
    if (!this.last) return;
    ed.viewport.pan(e.sx - this.last.sx, e.sy - this.last.sy);
    this.last = { sx: e.sx, sy: e.sy };
    ed.viewChanged();
  }
  up(ed: Editor) {
    this.last = null;
    ed.refreshCursor();
  }
}

export class ZoomTool implements Tool {
  readonly id = 'zoom';
  cursor() {
    return 'zoom-in';
  }
  down(ed: Editor, e: PointerInfo) {
    const z = ed.viewport.zoom * (e.alt ? 1 / 1.5 : 1.5);
    ed.viewport.zoomAt(z, e.sx, e.sy);
    ed.viewChanged();
  }
  move() {}
  up() {}
}

export class EyedropperTool implements Tool {
  readonly id = 'eyedropper';
  private flat: CanvasRenderingContext2D | null = null;
  cursor() {
    return 'crosshair';
  }
  down(ed: Editor, e: PointerInfo) {
    this.flat = ed.compositor.flatten(ed.doc).getContext('2d', { willReadFrequently: true });
    this.pick(ed, e);
  }
  move(ed: Editor, e: PointerInfo) {
    if (this.flat) this.pick(ed, e);
  }
  up() {
    this.flat = null;
  }
  private pick(ed: Editor, e: PointerInfo) {
    const x = Math.floor(e.x), y = Math.floor(e.y);
    if (x < 0 || y < 0 || x >= ed.doc.width || y >= ed.doc.height) return;
    const [r, g, b, a] = this.flat!.getImageData(x, y, 1, 1).data;
    if (a === 0) return;
    ed.setColor(rgbToHex(r, g, b));
  }
}

export class FillTool implements Tool {
  readonly id = 'fill';
  cursor() {
    return 'crosshair';
  }
  down(ed: Editor, e: PointerInfo) {
    const layer = ed.doc.active;
    if (layer.locked || !layer.visible) return ed.toast(layer.locked ? 'This layer is locked' : 'This layer is hidden');
    if (layer.kind === 'vector') return void this.vectorFill(ed, layer, e);
    const { width: w, height: h } = ed.doc;
    const img = layer.ctx.getImageData(0, 0, w, h);
    let mask = floodMask(img.data, w, h, e.x, e.y, ed.settings.tolerance);
    if (!mask) return;
    mask = dilate(mask, w, h);
    const before = new ImageData(new Uint8ClampedArray(img.data), w, h);
    const [r, g, b] = hexToRgb(ed.settings.color);
    const a = ed.settings.opacity;
    const d = img.data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let p = 0; p < mask.length; p++) {
      if (!mask[p]) continue;
      const i = p * 4;
      // "source-over" blend of the fill colour onto the existing pixel.
      const da = d[i + 3] / 255;
      const oa = a + da * (1 - a);
      d[i] = (r * a + d[i] * da * (1 - a)) / oa;
      d[i + 1] = (g * a + d[i + 1] * da * (1 - a)) / oa;
      d[i + 2] = (b * a + d[i + 2] * da * (1 - a)) / oa;
      d[i + 3] = oa * 255;
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 < 0) return;
    layer.ctx.putImageData(img, 0, 0);
    const rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    const beforeCrop = cropImageData(before, rect);
    ed.commitRasterPatch(layer, rect, beforeCrop, 'Fill');
  }
  move() {}
  up() {}

  /**
   * Vector bucket, like Animate: clicking a filled shape recolors it; clicking
   * an empty area enclosed by lines adds a fill shape underneath the lines.
   */
  private async vectorFill(ed: Editor, layer: VectorLayer, e: PointerInfo) {
    const g = await loadGeom();
    const style = { color: ed.settings.color, opacity: ed.settings.opacity };
    for (let i = layer.items.length - 1; i >= 0; i--) {
      const it = layer.items[i];
      if (!it.hit(e.x, e.y, 0)) continue;
      if (it.kind === 'shape') {
        if (it.style.color !== style.color || it.style.opacity !== style.opacity) ed.updateItems(layer, [it.with({ style })], 'Recolor fill');
      } else ed.toast('Click inside a closed area to fill it');
      return;
    }
    const { width: w, height: h } = ed.doc;
    const c = makeCanvas(w, h);
    const ctx = ctx2d(c, true);
    const gap = ed.settings.fillGap;
    ctx.fillStyle = ctx.strokeStyle = '#000';
    ctx.lineWidth = gap;
    ctx.lineJoin = 'round';
    for (const it of layer.items) {
      ctx.fill(it.path);
      if (gap > 0) ctx.stroke(it.path); // thicken lines so small gaps count as closed
    }
    const res = enclosedRegion(ctx.getImageData(0, 0, w, h).data, w, h, e.x, e.y, Math.ceil(gap / 2) + 2);
    if ('error' in res) {
      return ed.toast(res.error === 'not-closed' ? "That area isn't closed. Try a bigger gap size." : 'Click inside a closed area to fill it');
    }
    const shape = g.shapeFromLoops(res.loops, style);
    if (shape) ed.replaceItems(layer, [shape, ...layer.items], 'Fill');
  }
}

function cropImageData(src: ImageData, r: { x: number; y: number; w: number; h: number }): ImageData {
  const out = new ImageData(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    const s = ((r.y + y) * src.width + r.x) * 4;
    out.data.set(src.data.subarray(s, s + r.w * 4), y * r.w * 4);
  }
  return out;
}
