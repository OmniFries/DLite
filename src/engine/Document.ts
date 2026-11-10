import { RasterLayer, VectorLayer, type Layer } from './Layer';

export class DrawingDocument {
  width: number;
  height: number;
  layers: Layer[] = [];
  activeIndex = 0;
  private counter = 1;

  constructor(width: number, height: number, background = '#ffffff') {
    this.width = width;
    this.height = height;
    const bg = new RasterLayer('Background', width, height);
    if (background) {
      bg.ctx.fillStyle = background;
      bg.ctx.fillRect(0, 0, width, height);
    }
    this.layers.push(bg);
  }

  /** A document made of existing layers (used when opening a file). */
  static fromLayers(width: number, height: number, layers: Layer[], activeIndex = 0): DrawingDocument {
    const doc = new DrawingDocument(width, height, '');
    doc.layers = layers;
    doc.activeIndex = Math.min(Math.max(0, activeIndex), layers.length - 1);
    doc.counter = layers.length;
    return doc;
  }

  get active(): Layer {
    return this.layers[this.activeIndex];
  }

  createRaster(): RasterLayer {
    return new RasterLayer(`Layer ${this.counter++}`, this.width, this.height);
  }

  createVector(): VectorLayer {
    return new VectorLayer(`Vector ${this.counter++}`);
  }

  indexOf(layer: Layer) {
    return this.layers.indexOf(layer);
  }

  insert(layer: Layer, index: number) {
    this.layers.splice(index, 0, layer);
    this.activeIndex = index;
  }

  remove(index: number): Layer {
    const [l] = this.layers.splice(index, 1);
    this.activeIndex = Math.min(this.activeIndex, this.layers.length - 1);
    return l;
  }

  move(from: number, to: number) {
    const [l] = this.layers.splice(from, 1);
    this.layers.splice(to, 0, l);
    this.activeIndex = to;
  }
}
