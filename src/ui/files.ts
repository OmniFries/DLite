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

/** Records where the active tab's drawing lives, so Ctrl+S can save back to it. */
function setFile(name: string, file: { handle?: FileHandle; path?: string }) {
  editor.session.name = name;
  editor.session.file = file;
  editor.sessionChanged();
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

/** Asks what to do with the active tab's unsaved changes. Returns false if the user cancelled. */
export async function confirmDiscard(): Promise<boolean> {
  if (!editor.dirty) return true;
  const choice = await ask('Save changes?', `“${editor.session.name}” has changes that haven't been saved.`, [
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
    const suggested = withLite(editor.session.name);
    const current = editor.session.file as { handle?: FileHandle; path?: string };
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
      setFile(baseName(path), { path });
    } else if (fsWin.showSaveFilePicker) {
      let handle = saveAs ? undefined : current.handle;
      handle ??= await fsWin.showSaveFilePicker({ suggestedName: suggested, types: LITE_TYPES });
      const w = await handle.createWritable();
      await w.write(new Blob([bytes as BlobPart]));
      await w.close();
      setFile(handle.name, { handle });
    } else {
      // Browsers without file access (Firefox, Safari): download the file each time.
      download(new Blob([bytes as BlobPart], { type: 'application/x-dlite' }), suggested);
      setFile(suggested, {});
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

/** Opens a file in a new tab. */
export async function openDocument() {
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

async function openBytes(name: string, bytes: Uint8Array, where: { handle?: FileHandle; path?: string }) {
  if (extOf(name) === 'lite') {
    // Already open? Just switch to it.
    const i = editor.sessions.findIndex(
      (s) => (where.path && s.file.path === where.path) || (where.handle && s.file.handle === where.handle),
    );
    if (i >= 0) return editor.switchTab(i);
    editor.openTab(await openLite(bytes), name, where, true);
  } else {
    // An image opens as a new, unsaved drawing.
    editor.openTab(await documentFromImage(new Blob([bytes as BlobPart])), name.replace(/\.[^.]+$/, ''), {}, true);
  }
  editor.toast(`Opened ${name}`);
}

/** Drag-and-drop: a .lite file opens; an image is added as a new layer. */
export async function handleDroppedFile(file: File) {
  try {
    if (extOf(file.name) === 'lite') {
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

export function newDocumentRequest() {
  ui.newDocOpen = true;
}

/** Closes a tab, asking about unsaved changes first. */
export async function closeTabRequest(index: number) {
  const s = editor.sessions[index];
  if (!s) return;
  if (s.dirty) {
    editor.switchTab(index);
    if (!(await confirmDiscard())) return;
  }
  editor.closeTab(editor.sessions.indexOf(s));
}

/** Number of open drawings with unsaved changes. */
export const unsavedCount = () => editor.sessions.filter((s) => s.dirty).length;

/** Before quitting: true if it's fine to close the app. */
export async function confirmQuit(): Promise<boolean> {
  const n = unsavedCount();
  if (!n) return true;
  const choice = await ask(
    'Close DLite?',
    n === 1 ? 'One drawing has unsaved changes.' : `${n} drawings have unsaved changes.`,
    [
      { id: 'cancel', label: 'Cancel', kind: 'filled' },
      { id: 'quit', label: 'Close without saving' },
    ],
  );
  return choice === 'quit';
}

// ---------- export ----------

/** Saves the flattened drawing. Uses the native save dialog inside Tauri, a download in the browser. */
export async function exportImage(type: 'image/png' | 'image/jpeg' | 'image/webp') {
  try {
    const blob = await editor.exportImage(type);
    const name = `${editor.session.name.replace(/\.lite$/i, '')}.${EXT[type]}`;
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
