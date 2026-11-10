import { ctx2d, makeCanvas } from './util';
import type { VectorItem } from './vector/VectorItem';

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'source-over', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
  { id: 'color-dodge', label: 'Color dodge' },
  { id: 'color-burn', label: 'Color burn' },
  { id: 'hard-light', label: 'Hard light' },
  { id: 'soft-light', label: 'Soft light' },
  { id: 'difference', label: 'Difference' },
  { id: 'hue', label: 'Hue' },
  { id: 'saturation', label: 'Saturation' },
  { id: 'color', label: 'Color' },
  { id: 'luminosity', label: 'Luminosity' },
];

let nextId = 1;

abstract class LayerBase {
  readonly id = nextId++;
  name: string;
  visible = true;
  locked = false;
  opacity = 1;
  blend: BlendMode = 'source-over';

  constructor(name: string) {
    this.name = name;
  }
}

export class RasterLayer extends LayerBase {
  readonly kind = 'raster' as const;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(name: string, w: number, h: number) {
    super(name);
    this.canvas = makeCanvas(w, h);
    this.ctx = ctx2d(this.canvas, true);
  }

  clone(): RasterLayer {
    const l = new RasterLayer(this.name + ' copy', this.canvas.width, this.canvas.height);
    copyProps(this, l);
    l.ctx.drawImage(this.canvas, 0, 0);
    return l;
  }
}

export class VectorLayer extends LayerBase {
  readonly kind = 'vector' as const;
  items: VectorItem[] = [];

  /** Draws all items in document coordinates on whatever transform ctx has. */
  drawItems(ctx: CanvasRenderingContext2D) {
    for (const it of this.items) it.draw(ctx);
  }

  clone(): VectorLayer {
    const l = new VectorLayer(this.name + ' copy');
    copyProps(this, l);
    // Items are immutable, so the copy can share them.
    l.items = this.items.slice();
    return l;
  }
}

function copyProps(a: LayerBase, b: LayerBase) {
  b.visible = a.visible;
  b.locked = a.locked;
  b.opacity = a.opacity;
  b.blend = a.blend;
}

export type Layer = RasterLayer | VectorLayer;
