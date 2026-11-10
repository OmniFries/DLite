import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { DrawingDocument } from '../Document';
import { BLEND_MODES, RasterLayer, VectorLayer, type BlendMode, type Layer } from '../Layer';
import { VectorShape, VectorStroke, type VectorItem } from '../vector/VectorItem';

/**
 * The .lite file: a zip holding manifest.json plus one lossless PNG per
 * raster layer. Vector layers are stored in the manifest, so strokes keep
 * their points and stay editable after reopening.
 */
export const LITE_FORMAT = 'dlite';
export const LITE_VERSION = 1;
export const MAX_SIDE = 16384;

interface LayerJSON {
  type: 'raster' | 'vector';
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  /** Raster: path of the PNG inside the zip. */
  file?: string;
  /** Vector: the items. */
  items?: unknown[];
}

interface Manifest {
  format: string;
  version: number;
  app: string;
  width: number;
  height: number;
  activeIndex: number;
  layers: LayerJSON[];
}

export class LiteFormatError extends Error {}

function canvasToPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((res, rej) =>
    c.toBlob(async (b) => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error('PNG encoding failed'))), 'image/png'),
  );
}

export async function saveLite(doc: DrawingDocument): Promise<Uint8Array> {
  const files: Zippable = {};
  const layers: LayerJSON[] = [];
  for (let i = 0; i < doc.layers.length; i++) {
    const l = doc.layers[i];
    const base = { name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity, blend: l.blend };
    if (l.kind === 'raster') {
      const file = `layers/${i}.png`;
      // PNGs are already compressed; store them as-is.
      files[file] = [await canvasToPng(l.canvas), { level: 0 }];
      layers.push({ type: 'raster', ...base, file });
    } else {
      layers.push({ type: 'vector', ...base, items: l.items.map((it) => it.toJSON()) });
    }
  }
  const manifest: Manifest = {
    format: LITE_FORMAT,
    version: LITE_VERSION,
    app: 'DLite',
    width: doc.width,
    height: doc.height,
    activeIndex: doc.activeIndex,
    layers,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  return zipSync(files, { level: 6 });
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const BLENDS = new Set(BLEND_MODES.map((b) => b.id));

function readItem(raw: unknown): VectorItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, any>;
  const style = (o.style ?? {}) as Record<string, unknown>;
  const color = /^#[0-9a-f]{6}$/i.test(str(style.color, '')) ? (style.color as string) : '#000000';
  const opacity = Math.min(1, Math.max(0, num(style.opacity, 1)));
  if (o.type === 'stroke' && Array.isArray(o.points)) {
    const points = o.points
      .filter((p: unknown) => Array.isArray(p) && p.length >= 2)
      .map((p: unknown[]) => [num(p[0], 0), num(p[1], 0), num(p[2], 1)] as [number, number, number]);
    if (!points.length) return null;
    const spine = Array.isArray(o.spine)
      ? o.spine.map((a: Record<string, unknown>) => ({
          x: num(a.x, 0), y: num(a.y, 0), hix: num(a.hix, 0), hiy: num(a.hiy, 0), hox: num(a.hox, 0), hoy: num(a.hoy, 0), p: num(a.p, 1),
        }))
      : null;
    return new VectorStroke(
      points,
      {
        color,
        opacity,
        size: Math.max(0.1, num(style.size, 8)),
        thinning: num(style.thinning, 0),
        simulatePressure: style.simulatePressure === true,
      },
      undefined,
      spine,
    );
  }
  if (o.type === 'shape' && typeof o.d === 'string') {
    const b = (o.bounds ?? {}) as Record<string, unknown>;
    return new VectorShape(o.d, { color, opacity }, { x: num(b.x, 0), y: num(b.y, 0), w: num(b.w, 0), h: num(b.h, 0) });
  }
  return null;
}

async function pngIntoLayer(bytes: Uint8Array, layer: RasterLayer) {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }));
  layer.ctx.drawImage(bmp, 0, 0);
  bmp.close();
}

export async function openLite(bytes: Uint8Array): Promise<DrawingDocument> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new LiteFormatError("This isn't a DLite file, or it is damaged.");
  }
  const mf = entries['manifest.json'];
  if (!mf) throw new LiteFormatError("This isn't a DLite file (no manifest).");
  let m: Manifest;
  try {
    m = JSON.parse(strFromU8(mf));
  } catch {
    throw new LiteFormatError('The file is damaged (unreadable manifest).');
  }
  if (m.format !== LITE_FORMAT) throw new LiteFormatError("This isn't a DLite file.");
  if (num(m.version, 0) > LITE_VERSION) throw new LiteFormatError('This file was made by a newer version of DLite. Please update.');
  const w = Math.round(num(m.width, 0)), h = Math.round(num(m.height, 0));
  if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE) throw new LiteFormatError('The file has an invalid canvas size.');
  if (!Array.isArray(m.layers) || !m.layers.length) throw new LiteFormatError('The file has no layers.');

  const layers: Layer[] = [];
  for (const lj of m.layers) {
    let layer: Layer;
    if (lj.type === 'vector') {
      const v = new VectorLayer(str(lj.name, 'Vector'));
      v.items = (Array.isArray(lj.items) ? lj.items : []).map(readItem).filter((i): i is VectorItem => !!i);
      layer = v;
    } else {
      const r = new RasterLayer(str(lj.name, 'Layer'), w, h);
      const png = lj.file ? entries[lj.file] : undefined;
      if (png) {
        try {
          await pngIntoLayer(png, r);
        } catch {
          throw new LiteFormatError(`The image for layer “${r.name}” is damaged.`);
        }
      }
      layer = r;
    }
    layer.visible = lj.visible !== false;
    layer.locked = lj.locked === true;
    layer.opacity = Math.min(1, Math.max(0, num(lj.opacity, 1)));
    layer.blend = BLENDS.has(lj.blend) ? lj.blend : 'source-over';
    layers.push(layer);
  }
  return DrawingDocument.fromLayers(w, h, layers, num(m.activeIndex, layers.length - 1));
}

/** A one-layer document from an image file (PNG, JPG, WebP…). */
export async function documentFromImage(blob: Blob): Promise<DrawingDocument> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    throw new LiteFormatError("This image couldn't be read.");
  }
  if (bmp.width > MAX_SIDE || bmp.height > MAX_SIDE) {
    bmp.close();
    throw new LiteFormatError(`Images up to ${MAX_SIDE}×${MAX_SIDE} px can be opened.`);
  }
  const layer = new RasterLayer('Image', bmp.width, bmp.height);
  layer.ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return DrawingDocument.fromLayers(layer.canvas.width, layer.canvas.height, [layer], 0);
}
