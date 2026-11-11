import { Compositor, type LayerOverlay } from './Compositor';
import { DrawingDocument } from './Document';
import type { HistoryEntry } from './History';
import { DocSession, type FileRef } from './Session';
import { RasterLayer, VectorLayer, type Layer } from './Layer';
import { Viewport } from './Viewport';
import type { VectorItem } from './vector/VectorItem';
import { BrushTool } from './tools/BrushTool';
import { EyedropperTool, FillTool, HandTool, ZoomTool } from './tools/SimpleTools';
import { VectorSelectTool } from './tools/VectorSelectTool';
import { SubselectTool } from './tools/SubselectTool';
import { loadGeom } from './vector/geom';
import type { PointerInfo, Tool } from './tools/Tool';
import type { Rect } from './util';

export interface ToolSettings {
  color: string;
  size: number;
  hardness: number;
  opacity: number;
  flow: number;
  smoothing: number;
  pressureSize: boolean;
  pressureOpacity: boolean;
  tolerance: number;
  /** Vector eraser: delete whole strokes, or erase just the area rubbed over. */
  eraserMode: 'stroke' | 'free';
  /** Vector brush: keep strokes separate (object) or merge/cut overlapping shapes like Animate. */
  drawMode: 'object' | 'merge';
  /** Vector bucket: how big a gap in the lines still counts as closed (px). */
  fillGap: number;
}

export type ToolId = 'brush' | 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'select' | 'subselect' | 'hand' | 'zoom';

export interface EditorEvents {
  /** Document structure or history changed (layers panel, undo buttons). */
  change(): void;
  /** Zoom or pan changed. */
  view(): void;
  color(hex: string): void;
  toast(msg: string): void;
  tool(id: ToolId): void;
}

export class Editor {
  /** Open drawings, one per tab. */
  sessions: DocSession[];
  activeSession = 0;
  readonly viewport = new Viewport();
  compositor!: Compositor;
  overlay: LayerOverlay | null = null;
  readonly tools: Record<ToolId, Tool> = {
    brush: new BrushTool('brush'),
    pencil: new BrushTool('pencil'),
    eraser: new BrushTool('eraser'),
    fill: new FillTool(),
    eyedropper: new EyedropperTool(),
    select: new VectorSelectTool(),
    subselect: new SubselectTool(),
    hand: new HandTool(),
    zoom: new ZoomTool(),
  };
  toolId: ToolId = 'brush';
  private canvas: HTMLCanvasElement | null = null;
  private frame = 0;
  private activePointer: number | null = null;
  private tempTool: Tool | null = null; // space / middle-button pan
  private activeStarted = 0; // when the current pointer went down (ms)
  /** Fingers on the canvas, by pointer id (screen coordinates). */
  private touches = new Map<number, { x: number; y: number }>();
  /** Set while two fingers pinch/pan; cleared when every finger is lifted. */
  private gesture: { mid: { x: number; y: number }; dist: number } | null = null;
  private gestureLock = false;
  /** Once a stylus is used, fingers only pan and zoom (palm rejection). */
  private penSeen = false;
  private spaceDown = false;
  private ro: ResizeObserver | null = null;
  private cleanup: (() => void)[] = [];

  constructor(public settings: ToolSettings, private events: EditorEvents, width = 1920, height = 1080) {
    this.sessions = [new DocSession(this.blankDoc(width, height), 'Untitled')];
  }

  /** The drawing in the active tab. */
  get session(): DocSession {
    return this.sessions[this.activeSession];
  }
  get doc(): DrawingDocument {
    return this.session.doc;
  }
  get history() {
    return this.session.history;
  }
  /** Ids of selected vector items on the active layer. */
  get selection() {
    return this.session.selection;
  }
  get version() {
    return this.session.version;
  }
  set version(v: number) {
    this.session.version = v;
  }

  private blankDoc(w: number, h: number) {
    const doc = new DrawingDocument(w, h);
    doc.insert(doc.createRaster(), 1);
    return doc;
  }

  get tool(): Tool {
    return this.tempTool ?? this.tools[this.toolId];
  }

  // ---------- lifecycle ----------

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.compositor = new Compositor(canvas);
    const parent = canvas.parentElement!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(parent);
    this.resize();
    this.viewport.fit(this.doc.width, this.doc.height);
    this.viewChanged();
    // Load the vector geometry library in the background once the app is up.
    setTimeout(() => void loadGeom(), 800);

    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn as EventListener, opts);
      this.cleanup.push(() => el.removeEventListener(ev, fn as EventListener, opts));
    };
    on(canvas, 'pointerdown', (e) => this.onDown(e));
    on(canvas, 'pointermove', (e) => this.onMove(e));
    on(canvas, 'pointerup', (e) => this.onUp(e));
    on(canvas, 'pointercancel', (e) => this.onUp(e));
    on(canvas, 'pointerleave', () => {
      const t = this.tool as Tool & { leave?: (ed: Editor) => void };
      t.leave?.(this);
    });
    on(canvas, 'wheel', (e) => this.onWheel(e), { passive: false });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(window, 'keydown', (e) => {
      if (e.code === 'Space' && !isTyping(e) && !this.spaceDown) {
        this.spaceDown = true;
        if (this.activePointer === null) this.tempTool = this.tools.hand;
        this.refreshCursor();
        e.preventDefault();
      }
    });
    on(window, 'keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        if (this.activePointer === null) this.tempTool = null;
        this.refreshCursor();
      }
    });
  }

  detach() {
    this.ro?.disconnect();
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
    cancelAnimationFrame(this.frame);
  }

  private resize() {
    if (!this.canvas) return;
    const r = this.canvas.parentElement!.getBoundingClientRect();
    const first = this.viewport.width === 0;
    // Keep the drawing centered when the window resizes.
    if (!first) this.viewport.pan((r.width - this.viewport.width) / 2, (r.height - this.viewport.height) / 2);
    this.viewport.width = r.width;
    this.viewport.height = r.height;
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.compositor.resize(r.width, r.height, window.devicePixelRatio || 1);
    this.render();
  }

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private render() {
    if (!this.canvas) return;
    const bg = getComputedStyle(this.canvas).getPropertyValue('--workspace').trim() || '#f1f3f4';
    this.compositor.render(this.doc, this.viewport, this.overlay, (ctx) => this.tool.drawScreen?.(ctx, this), bg);
  }

  // ---------- input ----------

  private info(e: PointerEvent): PointerInfo {
    const r = this.canvas!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const [x, y] = this.viewport.toDoc(sx, sy);
    // Mice report 0.5 while pressed; treat them as full pressure.
    const p = e.pointerType === 'pen' ? e.pressure : e.pointerType === 'touch' && e.pressure > 0 ? e.pressure : 1;
    return { x, y, sx, sy, p, pointerType: e.pointerType, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey };
  }

  private screenPos(e: PointerEvent) {
    const r = this.canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown(e: PointerEvent) {
    // Give keyboard shortcuts back to the app when the user starts drawing.
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (e.pointerType === 'pen') this.penSeen = true;
    if (e.pointerType === 'touch' && this.onTouchDown(e)) return;
    if (this.activePointer !== null) return;
    if (e.button === 1) this.tempTool = this.tools.hand;
    else if (e.button !== 0 && !this.tempTool) return;
    this.activePointer = e.pointerId;
    this.activeStarted = performance.now();
    this.canvas!.setPointerCapture(e.pointerId);
    this.tool.down(this, this.info(e));
    e.preventDefault();
  }

  /**
   * Touch handling: two fingers pinch-zoom and pan. After a stylus has been
   * used, a single finger pans too, so a resting palm never draws.
   * Returns true when the event was used for a gesture.
   */
  private onTouchDown(e: PointerEvent): boolean {
    this.touches.set(e.pointerId, this.screenPos(e));
    this.canvas!.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (this.gestureLock) return true;
    const fingerPans = this.penSeen;
    if (this.touches.size >= 2 || fingerPans) {
      // A stroke that just started with the first finger was the start of a pinch: drop it.
      if (this.activePointer !== null && this.touches.has(this.activePointer)) {
        if (performance.now() - this.activeStarted < 300) this.tool.cancel?.(this);
        else this.tool.up(this, this.info(e));
        this.activePointer = null;
      }
      if (this.activePointer !== null) return true; // the pen is drawing: ignore the palm
      this.gestureLock = true;
      this.gesture = this.gestureState();
      return true;
    }
    return false;
  }

  private gestureState() {
    const pts = [...this.touches.values()];
    const mid = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
    const dist = pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    return { mid, dist };
  }

  private onMove(e: PointerEvent) {
    if (this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, this.screenPos(e));
      if (this.gesture) {
        const next = this.gestureState();
        this.viewport.pan(next.mid.x - this.gesture.mid.x, next.mid.y - this.gesture.mid.y);
        if (this.gesture.dist > 0 && next.dist > 0) {
          this.viewport.zoomAt(this.viewport.zoom * (next.dist / this.gesture.dist), next.mid.x, next.mid.y);
        }
        this.gesture = next;
        this.viewChanged();
        return;
      }
    }
    if (this.activePointer === null) {
      if (e.pointerType !== 'touch') this.tool.hover?.(this, this.info(e));
      return;
    }
    if (e.pointerId !== this.activePointer) return;
    // Coalesced events give the full input rate for smooth strokes.
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length ? events : [e]) this.tool.move(this, this.info(ce));
  }

  private onUp(e: PointerEvent) {
    if (this.touches.delete(e.pointerId)) {
      if (this.gesture) {
        // Keep pinching/panning with the remaining fingers; unlock when all are up.
        this.gesture = this.touches.size ? this.gestureState() : null;
        if (!this.touches.size) this.gestureLock = false;
        if (this.touches.size === 1 && !this.penSeen) this.gesture = null;
        return;
      }
      if (!this.touches.size) this.gestureLock = false;
    }
    if (e.pointerId !== this.activePointer) return;
    this.tool.up(this, this.info(e));
    this.activePointer = null;
    if (!this.spaceDown) this.tempTool = null;
    this.refreshCursor();
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const r = this.canvas!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (e.ctrlKey || e.metaKey) {
      // Pinch-zoom on trackpads also arrives as ctrl+wheel.
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
      this.viewport.zoomAt(this.viewport.zoom * factor, sx, sy);
    } else if (e.shiftKey) {
      this.viewport.pan(-e.deltaY, 0);
    } else {
      this.viewport.pan(-e.deltaX, -e.deltaY);
    }
    this.viewChanged();
  }

  refreshCursor() {
    if (this.canvas) this.canvas.style.cursor = this.tool.cursor(this);
  }

  // ---------- tools & view ----------

  setTool(id: ToolId) {
    if (this.activePointer !== null) return;
    this.tool.cancel?.(this);
    this.toolId = id;
    this.refreshCursor();
    this.requestRender();
    this.events.tool(id);
  }

  setColor(hex: string) {
    this.settings.color = hex;
    this.events.color(hex);
  }

  viewChanged() {
    this.events.view();
    this.requestRender();
  }

  zoomTo(zoom: number) {
    this.viewport.zoomAt(zoom, this.viewport.width / 2, this.viewport.height / 2);
    this.viewChanged();
  }

  fitToScreen() {
    this.viewport.fit(this.doc.width, this.doc.height);
    this.viewChanged();
  }

  toast(msg: string) {
    this.events.toast(msg);
  }

  // ---------- history helpers ----------

  private changed() {
    this.version++;
    this.events.change();
    this.requestRender();
  }

  private push(entry: HistoryEntry) {
    this.history.push(entry);
    this.changed();
  }

  undo() {
    if (this.activePointer !== null) return;
    if (this.history.undo()) {
      this.pruneSelection();
      this.changed();
    }
  }

  redo() {
    if (this.activePointer !== null) return;
    if (this.history.redo()) {
      this.pruneSelection();
      this.changed();
    }
  }

  /** Records a raster change: `before` holds the old pixels of `rect`; the layer already has the new ones. */
  commitRasterPatch(layer: RasterLayer, rect: Rect, before: ImageData, label: string) {
    const after = layer.ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    this.push({
      label,
      bytes: before.data.length * 2,
      undo: () => layer.ctx.putImageData(before, rect.x, rect.y),
      redo: () => layer.ctx.putImageData(after, rect.x, rect.y),
    });
  }

  /**
   * The one history entry for vector edits. Items are immutable, so undo just
   * swaps the layer's item list back.
   */
  replaceItems(layer: VectorLayer, after: VectorItem[], label: string) {
    const before = layer.items;
    if (before.length === after.length && before.every((it, i) => it === after[i])) return;
    layer.items = after;
    this.pruneSelection();
    this.push({
      label,
      bytes: 512 + after.length * 64,
      undo: () => (layer.items = before),
      redo: () => (layer.items = after),
    });
  }

  addVectorItems(layer: VectorLayer, items: VectorItem[], label: string) {
    this.replaceItems(layer, [...layer.items, ...items], label);
  }

  removeVectorItems(layer: VectorLayer, items: VectorItem[], label: string) {
    if (items.length) this.replaceItems(layer, layer.items.filter((i) => !items.includes(i)), label);
  }

  /** Swaps items for edited versions with the same id, keeping their stacking order. */
  updateItems(layer: VectorLayer, updated: VectorItem[], label: string) {
    const byId = new Map(updated.map((i) => [i.id, i]));
    this.replaceItems(layer, layer.items.map((i) => byId.get(i.id) ?? i), label);
  }

  // ---------- selection (vector) ----------

  selectionChanged() {
    this.events.change();
    this.requestRender();
  }

  private pruneSelection() {
    const l = this.doc.active;
    if (l.kind !== 'vector') return this.selection.clear();
    const ids = new Set(l.items.map((i) => i.id));
    for (const id of [...this.selection]) if (!ids.has(id)) this.selection.delete(id);
  }

  private selectedItems(): { layer: VectorLayer; items: VectorItem[] } | null {
    const l = this.doc.active;
    if (l.kind !== 'vector' || !this.selection.size) return null;
    return { layer: l, items: l.items.filter((i) => this.selection.has(i.id)) };
  }

  deleteSelection() {
    const s = this.selectedItems();
    if (s && !s.layer.locked) this.removeVectorItems(s.layer, s.items, 'Delete');
  }

  /** Delete/Backspace: the tool gets first say (e.g. delete an anchor), then the selection. */
  deleteKey() {
    if (this.tool.onDelete?.(this)) return;
    this.deleteSelection();
  }

  /** Applies a transform to the selected vector items (flip, scale, rotate). */
  async transformSelection(m: import('./vector/VectorItem').Matrix, label: string) {
    const s = this.selectedItems();
    if (!s || s.layer.locked) return;
    const g = await loadGeom();
    this.updateItems(s.layer, s.items.map((i) => g.transform(i, m)), label);
  }

  /** Flips the selection around its center. */
  flipSelection(horizontal: boolean) {
    const s = this.selectedItems();
    if (!s) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of s.items) {
      const b = it.bounds;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const m: import('./vector/VectorItem').Matrix = horizontal ? [-1, 0, 0, 1, 2 * cx, 0] : [1, 0, 0, -1, 0, 2 * cy];
    void this.transformSelection(m, horizontal ? 'Flip horizontal' : 'Flip vertical');
  }

  /** Recolors the selected vector items with the current colour. */
  recolorSelection(color: string) {
    const s = this.selectedItems();
    if (!s || s.layer.locked) return;
    const changed = s.items.filter((i) => i.style.color !== color).map((i) => i.with({ style: { color } }));
    if (changed.length) this.updateItems(s.layer, changed, 'Recolor');
  }

  selectAll() {
    const l = this.doc.active;
    if (l.kind !== 'vector') return;
    if (this.toolId !== 'select') this.setTool('select');
    l.items.forEach((i) => this.selection.add(i.id));
    this.selectionChanged();
  }

  deselect() {
    this.selection.clear();
    this.selectionChanged();
  }

  // ---------- layers ----------

  setActiveLayer(index: number) {
    if (index === this.doc.activeIndex) return;
    this.tool.cancel?.(this);
    this.doc.activeIndex = index;
    this.selection.clear();
    this.changed();
  }

  addLayer(kind: 'raster' | 'vector') {
    const layer = kind === 'raster' ? this.doc.createRaster() : this.doc.createVector();
    this.insertLayer(layer, this.doc.activeIndex + 1, kind === 'raster' ? 'New layer' : 'New vector layer');
  }

  private insertLayer(layer: Layer, index: number, label: string) {
    const prevActive = this.doc.activeIndex;
    this.doc.insert(layer, index);
    this.selection.clear();
    this.push({
      label,
      bytes: layer.kind === 'raster' ? layer.canvas.width * layer.canvas.height * 4 : 1024,
      undo: () => {
        this.doc.remove(this.doc.indexOf(layer));
        this.doc.activeIndex = prevActive;
      },
      redo: () => this.doc.insert(layer, index),
    });
  }

  duplicateLayer() {
    const l = this.doc.active;
    this.insertLayer(l.clone(), this.doc.activeIndex + 1, 'Duplicate layer');
  }

  deleteLayer(index = this.doc.activeIndex) {
    if (this.doc.layers.length <= 1) return this.toast('A drawing needs at least one layer');
    const prevActive = this.doc.activeIndex;
    const layer = this.doc.remove(index);
    this.selection.clear();
    this.push({
      label: 'Delete layer',
      bytes: 64,
      undo: () => {
        this.doc.insert(layer, index);
        this.doc.activeIndex = prevActive;
      },
      redo: () => this.doc.remove(this.doc.indexOf(layer)),
    });
  }

  moveLayer(from: number, to: number) {
    to = Math.max(0, Math.min(this.doc.layers.length - 1, to));
    if (from === to) return;
    this.doc.move(from, to);
    this.push({ label: 'Reorder layers', bytes: 16, undo: () => this.doc.move(to, from), redo: () => this.doc.move(from, to) });
  }

  /** Changes a layer property with undo. Use `live` while a slider is dragging, then commit once. */
  setLayerProp<K extends 'visible' | 'locked' | 'opacity' | 'blend' | 'name'>(layer: Layer, key: K, value: Layer[K], from?: Layer[K]) {
    const old = from ?? layer[key];
    layer[key] = value;
    if (old === value) return this.changed();
    const labels = { visible: 'Toggle visibility', locked: 'Toggle lock', opacity: 'Layer opacity', blend: 'Blend mode', name: 'Rename layer' };
    this.push({ label: labels[key], bytes: 16, undo: () => (layer[key] = old), redo: () => (layer[key] = value) });
  }

  setLayerPropLive<K extends 'opacity'>(layer: Layer, key: K, value: Layer[K]) {
    layer[key] = value;
    this.requestRender();
  }

  mergeDown() {
    const i = this.doc.activeIndex;
    if (i === 0) return this.toast('No layer below to merge into');
    const top = this.doc.layers[i];
    const below = this.doc.layers[i - 1];
    if (below.kind !== 'raster') return this.toast('Merging into a vector layer is not supported yet');
    const before = below.ctx.getImageData(0, 0, this.doc.width, this.doc.height);
    const ctx = below.ctx;
    ctx.save();
    ctx.globalAlpha = top.opacity;
    ctx.globalCompositeOperation = top.blend;
    if (top.kind === 'raster') ctx.drawImage(top.canvas, 0, 0);
    else {
      const tmp = new RasterLayer('', this.doc.width, this.doc.height);
      top.drawItems(tmp.ctx);
      ctx.drawImage(tmp.canvas, 0, 0);
    }
    ctx.restore();
    if (!top.visible) ctx.putImageData(before, 0, 0);
    const after = ctx.getImageData(0, 0, this.doc.width, this.doc.height);
    this.doc.remove(i);
    this.doc.activeIndex = i - 1;
    this.push({
      label: 'Merge down',
      bytes: before.data.length * 2,
      undo: () => {
        below.ctx.putImageData(before, 0, 0);
        this.doc.insert(top, i);
      },
      redo: () => {
        below.ctx.putImageData(after, 0, 0);
        this.doc.remove(this.doc.indexOf(top));
        this.doc.activeIndex = i - 1;
      },
    });
  }

  /** Converts the active vector layer to pixels. */
  rasterizeLayer() {
    const i = this.doc.activeIndex;
    const v = this.doc.layers[i];
    if (v.kind !== 'vector') return;
    const r = new RasterLayer(v.name, this.doc.width, this.doc.height);
    v.drawItems(r.ctx);
    r.opacity = v.opacity;
    r.blend = v.blend;
    r.visible = v.visible;
    this.doc.layers[i] = r;
    this.selection.clear();
    this.push({ label: 'Rasterize layer', bytes: this.doc.width * this.doc.height * 4, undo: () => (this.doc.layers[i] = v), redo: () => (this.doc.layers[i] = r) });
  }

  clearLayer() {
    const l = this.doc.active;
    if (l.locked) return this.toast('This layer is locked');
    if (l.kind === 'vector') return this.removeVectorItems(l, l.items.slice(), 'Clear layer');
    const rect = { x: 0, y: 0, w: this.doc.width, h: this.doc.height };
    const before = l.ctx.getImageData(0, 0, rect.w, rect.h);
    l.ctx.clearRect(0, 0, rect.w, rect.h);
    this.commitRasterPatch(l, rect, before, 'Clear layer');
  }

  // ---------- document ----------

  get dirty() {
    return this.session.dirty;
  }

  markSaved() {
    this.session.savedState = this.history.stateId;
    this.events.change();
  }

  /** Tells the UI that tab names or file info changed. */
  sessionChanged() {
    this.events.change();
  }

  // ---------- tabs ----------

  /** Remembers the view of the active tab before switching away. */
  private stashView() {
    const v = this.viewport;
    this.session.view = { zoom: v.zoom, offsetX: v.offsetX, offsetY: v.offsetY };
  }

  private showSession(index: number) {
    this.tool.cancel?.(this);
    this.overlay = null;
    this.activeSession = index;
    const view = this.session.view;
    if (view && this.viewport.width) {
      this.viewport.zoom = view.zoom;
      this.viewport.offsetX = view.offsetX;
      this.viewport.offsetY = view.offsetY;
    } else this.viewport.fit(this.doc.width, this.doc.height);
    this.events.change();
    this.viewChanged();
  }

  switchTab(index: number) {
    if (this.activePointer !== null || index === this.activeSession || !this.sessions[index]) return;
    this.stashView();
    this.showSession(index);
  }

  /**
   * Shows a document in a new tab after the active one. With `reuseBlank`
   * (used when opening a file), an untouched "Untitled" tab is replaced so
   * no empty tab is left behind.
   */
  openTab(doc: DrawingDocument, name: string, file: FileRef = {}, reuseBlank = false): DocSession {
    const session = new DocSession(doc, name);
    session.file = file;
    if (reuseBlank && this.session.pristine) {
      this.sessions[this.activeSession] = session;
      this.showSession(this.activeSession);
    } else {
      this.stashView();
      this.sessions.splice(this.activeSession + 1, 0, session);
      this.showSession(this.activeSession + 1);
    }
    return session;
  }

  /** Closes a tab without asking (the UI asks about unsaved changes first). */
  closeTab(index: number) {
    if (!this.sessions[index] || this.activePointer !== null) return;
    if (this.sessions.length === 1) {
      this.sessions = [new DocSession(this.blankDoc(this.doc.width, this.doc.height), 'Untitled')];
      this.showSession(0);
      return;
    }
    const wasActive = index === this.activeSession;
    if (!wasActive) this.stashView();
    this.sessions.splice(index, 1);
    if (index < this.activeSession || this.activeSession >= this.sessions.length) this.activeSession--;
    this.showSession(Math.max(0, this.activeSession));
  }

  moveTab(from: number, to: number) {
    to = Math.max(0, Math.min(this.sessions.length - 1, to));
    if (from === to) return;
    const active = this.session;
    const [s] = this.sessions.splice(from, 1);
    this.sessions.splice(to, 0, s);
    this.activeSession = this.sessions.indexOf(active);
    this.events.change();
  }

  /** Adds an image as a new raster layer above the active one, centered and scaled down to fit. */
  addImageLayer(img: CanvasImageSource & { width: number; height: number }, name: string) {
    const layer = new RasterLayer(name, this.doc.width, this.doc.height);
    const s = Math.min(1, this.doc.width / img.width, this.doc.height / img.height);
    const w = img.width * s, h = img.height * s;
    layer.ctx.imageSmoothingQuality = 'high';
    layer.ctx.drawImage(img, (this.doc.width - w) / 2, (this.doc.height - h) / 2, w, h);
    this.insertLayer(layer, this.doc.activeIndex + 1, 'Add image');
    if (s < 1) this.toast(`Image scaled to ${Math.round(s * 100)}% to fit the canvas`);
  }

  /** Creates a blank drawing in a new tab. */
  newDocument(w: number, h: number, background: string | null) {
    const doc = new DrawingDocument(w, h, background ?? '');
    if (!background) doc.layers[0].name = 'Layer 1';
    else doc.insert(doc.createRaster(), 1);
    // Always a new tab, named Untitled, Untitled 2, Untitled 3…
    const used = new Set(this.sessions.map((s) => s.name));
    let name = 'Untitled';
    for (let n = 2; used.has(name); n++) name = `Untitled ${n}`;
    this.openTab(doc, name);
  }

  async exportImage(type: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png'): Promise<Blob> {
    const flat = this.compositor.flatten(this.doc);
    let src = flat;
    if (type === 'image/jpeg') {
      // JPEG has no alpha: put the image on white.
      src = document.createElement('canvas');
      src.width = flat.width;
      src.height = flat.height;
      const c = src.getContext('2d')!;
      c.fillStyle = '#fff';
      c.fillRect(0, 0, src.width, src.height);
      c.drawImage(flat, 0, 0);
    }
    return new Promise((res, rej) => src.toBlob((b) => (b ? res(b) : rej(new Error('Export failed'))), type, 0.92));
  }

  /** Small preview of one layer for the layers panel. */
  drawThumbnail(layer: Layer, target: HTMLCanvasElement) {
    const ctx = target.getContext('2d')!;
    const s = Math.min(target.width / this.doc.width, target.height / this.doc.height);
    const w = this.doc.width * s, h = this.doc.height * s;
    const ox = (target.width - w) / 2, oy = (target.height - h) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.imageSmoothingQuality = 'medium';
    if (layer.kind === 'raster') ctx.drawImage(layer.canvas, ox, oy, w, h);
    else {
      ctx.save();
      ctx.setTransform(s, 0, 0, s, ox, oy);
      ctx.beginPath();
      ctx.rect(0, 0, this.doc.width, this.doc.height);
      ctx.clip();
      layer.drawItems(ctx);
      ctx.restore();
    }
  }
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
