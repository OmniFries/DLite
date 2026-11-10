import { Editor, type ToolId, type ToolSettings } from '../engine/Editor';

export const settings: ToolSettings = $state({
  color: '#1a73e8',
  size: 12,
  hardness: 0.85,
  opacity: 1,
  flow: 1,
  smoothing: 0.35,
  pressureSize: true,
  pressureOpacity: false,
  tolerance: 32,
  eraserMode: 'free',
  drawMode: 'object',
  fillGap: 10,
});

export const ui = $state({
  tool: 'brush' as ToolId,
  zoom: 1,
  canUndo: false,
  canRedo: false,
  /** Bumped whenever the document changes so panels re-read it. */
  version: 0,
  toast: '',
  panelOpen: true,
  selectionCount: 0,
  newDocOpen: false,
  /** File name shown in the top bar (with .lite once saved). */
  docName: 'Untitled',
  dirty: false,
  saving: false,
  /** Open confirm dialog, if any. */
  dialog: null as DialogRequest | null,
  recentColors: ['#1f1f1f', '#ffffff', '#ea4335', '#fbbc04', '#34a853', '#1a73e8', '#a142f4', '#ff6d01'] as string[],
});

export interface DialogRequest {
  title: string;
  message: string;
  buttons: { id: string; label: string; kind?: 'filled' | 'text' }[];
  resolve: (id: string) => void;
}

/** Shows a Material-style dialog and resolves with the id of the button pressed ('cancel' on Escape). */
export function ask(title: string, message: string, buttons: DialogRequest['buttons']): Promise<string> {
  return new Promise((resolve) => {
    ui.dialog = {
      title,
      message,
      buttons,
      resolve: (id) => {
        ui.dialog = null;
        resolve(id);
      },
    };
  });
}

let toastTimer = 0;

export const editor = new Editor(settings, {
  change() {
    ui.canUndo = editor.history.canUndo;
    ui.canRedo = editor.history.canRedo;
    ui.selectionCount = editor.selection.size;
    ui.dirty = editor.dirty;
    ui.version++;
  },
  view() {
    ui.zoom = editor.viewport.zoom;
  },
  color(hex) {
    pushRecent(hex);
  },
  toast(msg) {
    ui.toast = msg;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (ui.toast = ''), 2600);
  },
  tool(id) {
    ui.tool = id;
  },
});

export function pushRecent(hex: string) {
  const list = ui.recentColors.filter((c) => c.toLowerCase() !== hex.toLowerCase());
  list.unshift(hex);
  ui.recentColors = list.slice(0, 12);
}
