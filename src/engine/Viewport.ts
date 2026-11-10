import { clamp } from './util';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 64;

/** Maps document coordinates to screen (CSS pixel) coordinates: screen = doc * zoom + offset. */
export class Viewport {
  zoom = 1;
  offsetX = 0;
  offsetY = 0;
  /** Size of the view in CSS pixels. */
  width = 0;
  height = 0;

  toDoc(sx: number, sy: number): [number, number] {
    return [(sx - this.offsetX) / this.zoom, (sy - this.offsetY) / this.zoom];
  }

  toScreen(dx: number, dy: number): [number, number] {
    return [dx * this.zoom + this.offsetX, dy * this.zoom + this.offsetY];
  }

  pan(dx: number, dy: number) {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  /** Zoom to `zoom`, keeping the screen point (sx, sy) fixed. */
  zoomAt(zoom: number, sx: number, sy: number) {
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const [dx, dy] = this.toDoc(sx, sy);
    this.zoom = z;
    this.offsetX = sx - dx * z;
    this.offsetY = sy - dy * z;
  }

  fit(docW: number, docH: number, margin = 48) {
    const z = Math.min((this.width - margin * 2) / docW, (this.height - margin * 2) / docH, 1);
    this.zoom = clamp(z, MIN_ZOOM, MAX_ZOOM);
    this.offsetX = Math.round((this.width - docW * this.zoom) / 2);
    this.offsetY = Math.round((this.height - docH * this.zoom) / 2);
  }
}
