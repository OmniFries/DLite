import { documentFromImage, LiteFormatError, openLite, saveLite } from '../engine/io/liteFormat';
import { ask, editor, ui } from './state.svelte';

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
const isTauri = () => '__TAURI_INTERNALS__' in window;

// Minimal types for the File System Access API (Chrome/Edge).
interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob | BufferSource): Promise<void>; close(): Promise<void> }>;
}
type PickerTypes = { description: string; accept: Record<string, string[]> }[];
interface FsWindow {
  showSaveFilePicker?: (o: { suggestedName?: string; types?: PickerTypes }) => Promise<FileHandle>;
  showOpenFilePicker?: (o: { types?: PickerTypes; multiple?: boolean }) => Promise<FileHandle[]>;
}
const fsWin = window as unknown as FsWindow;

const LITE_TYPES: PickerTypes = [{ description: 'DLite drawing', accept: { 'application/x-dlite': ['.lite'] } }];
const OPEN_TYPES: PickerTypes = [
  { description: 'DLite drawings and images', accept: { 'application/x-dlite': ['.lite'], 'image/*': IMAGE_EXT.map((e) => '.' + e) } },
];

/** Where the current drawing lives, so Ctrl+S can save back to it. */
let current: { handle?: FileHandle; path?: string } = {};

function setName(name: string) {
  ui.docName = name;
  updateTitle();
}

export function updateTitle() {
  document.title = `${ui.dirty ? '• ' : ''}${ui.docName} – DLite`;
}

const baseName = (n: string) => n.replace(/^.*[\\/]/, '');
const withLite = (n: string) => (n.toLowerCase().endsWith('.lite') ? n : n.replace(/\.[^.]+$/, '') + '.lite');
const extOf = (n: string) => (n.match(/\.([^.\\/]+)$/)?.[1] ?? '').toLowerCase();

function fail(err: unknown, what: string) {
  if ((err as Error)?.name === 'AbortError') return; // user closed the picker
  const msg = err instanceof LiteFormatError ? err.message : `${what} failed: ${(err as Error)?.message ?? err}`;
  editor.toast(msg);
}

// ---------- unsaved changes ----------

/** Asks what to do with unsaved changes. Returns false if the user cancelled. */
export async function confirmDiscard(): Promise<boolean> {
  if (!editor.dirty) return true;
  const choice = await ask('Save changes?', `“${ui.docName}” has changes that haven't been saved.`, [
    { id: 'cancel', label: 'Cancel' },
    { id: 'discard', label: "Don't save" },
    { id: 'save', label: 'Save', kind: 'filled' },
  ]);
  if (choice === 'save') return saveDocument(false);
  return choice === 'discard';
}

// ---------- save ----------

/** Saves as .lite. Returns true when the file was written. */
export async function saveDocument(saveAs: boolean): Promise<boolean> {
  if (ui.saving) return false;
  ui.saving = true;
  try {
    const bytes = await saveLite(editor.doc);
    const suggested = withLite(ui.docName);
    if (isTauri()) {
      let path = saveAs ? undefined : current.path;
      if (!path) {
        const { save } = await import('@tauri-apps/plugin-dialog');
        path = (await save({ defaultPath: suggested, filters: [{ name: 'DLite drawing', extensions: ['lite'] }] })) ?? undefined;
        if (!path) return false;
        path = withLite(path);
      }
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(path, bytes);
      current = { path };
      setName(baseName(path));
    } else if (fsWin.showSaveFilePicker) {
      let handle = saveAs ? undefined : current.handle;
      handle ??= await fsWin.showSaveFilePicker({ suggestedName: suggested, types: LITE_TYPES });
      const w = await handle.createWritable();
      await w.write(new Blob([bytes as BlobPart]));
      await w.close();
      current = { handle };
      setName(handle.name);
    } else {
      // Browsers without file access (Firefox, Safari): download the file each time.
      download(new Blob([bytes as BlobPart], { type: 'application/x-dlite' }), suggested);
      setName(suggested);
    }
    editor.markSaved();
    editor.toast('Saved');
    return true;
  } catch (err) {
    fail(err, 'Saving');
    return false;
  } finally {
    ui.saving = false;
  }
}

// ---------- open ----------

export async function openDocument() {
  if (!(await confirmDiscard())) return;
  try {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({ multiple: false, filters: [{ name: 'DLite drawings and images', extensions: ['lite', ...IMAGE_EXT] }] });
      if (typeof path !== 'string') return;
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const bytes = await readFile(path);
      await openBytes(baseName(path), bytes, { path });
    } else if (fsWin.showOpenFilePicker) {
      const [handle] = await fsWin.showOpenFilePicker({ types: OPEN_TYPES });
      const file = await handle.getFile();
      await openBytes(file.name, new Uint8Array(await file.arrayBuffer()), { handle });
    } else {
      const file = await pickFile('.lite,' + IMAGE_EXT.map((e) => '.' + e).join(','));
      if (file) await openBytes(file.name, new Uint8Array(await file.arrayBuffer()), {});
    }
  } catch (err) {
    fail(err, 'Opening');
  }
}

async function openBytes(name: string, bytes: Uint8Array, where: typeof current) {
  if (extOf(name) === 'lite') {
    editor.loadDocument(await openLite(bytes));
    current = where;
    setName(name);
  } else {
    // An image opens as a new, unsaved drawing.
    editor.loadDocument(await documentFromImage(new Blob([bytes as BlobPart])));
    current = {};
    setName(name.replace(/\.[^.]+$/, ''));
  }
  editor.toast(`Opened ${name}`);
}

/** Drag-and-drop: a .lite file opens; an image is added as a new layer. */
export async function handleDroppedFile(file: File) {
  try {
    if (extOf(file.name) === 'lite') {
      if (!(await confirmDiscard())) return;
      await openBytes(file.name, new Uint8Array(await file.arrayBuffer()), {});
    } else if (file.type.startsWith('image/') || IMAGE_EXT.includes(extOf(file.name))) {
      await addImageAsLayer(file, file.name.replace(/\.[^.]+$/, ''));
    } else editor.toast('DLite opens .lite files and images');
  } catch (err) {
    fail(err, 'Opening');
  }
}

export async function addImageAsLayer(blob: Blob, name: string) {
  const bmp = await createImageBitmap(blob);
  editor.addImageLayer(bmp, name);
  bmp.close();
}

export async function newDocumentRequest() {
  if (await confirmDiscard()) ui.newDocOpen = true;
}

/** Called after "New drawing" is created. */
export function resetFile() {
  current = {};
  setName('Untitled');
}

// ---------- export ----------

/** Saves the flattened drawing. Uses the native save dialog inside Tauri, a download in the browser. */
export async function exportImage(type: 'image/png' | 'image/jpeg' | 'image/webp') {
  try {
    const blob = await editor.exportImage(type);
    const name = `${ui.docName.replace(/\.lite$/i, '')}.${EXT[type]}`;
    if (isTauri()) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      const path = await save({ defaultPath: name, filters: [{ name: EXT[type].toUpperCase(), extensions: [EXT[type]] }] });
      if (!path) return;
      await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
      editor.toast('Exported');
      return;
    }
    download(blob, name);
  } catch (err) {
    fail(err, 'Export');
  }
}

// ---------- helpers ----------

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
