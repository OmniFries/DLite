import { editor } from './state.svelte';

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Saves the flattened drawing. Uses the native save dialog inside Tauri, a download in the browser. */
export async function exportImage(type: 'image/png' | 'image/jpeg' | 'image/webp') {
  try {
    const blob = await editor.exportImage(type);
    const name = `drawing.${EXT[type]}`;
    if ('__TAURI_INTERNALS__' in window) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      const path = await save({ defaultPath: name, filters: [{ name: EXT[type].toUpperCase(), extensions: [EXT[type]] }] });
      if (!path) return;
      await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
      editor.toast('Exported');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    editor.toast('Export failed: ' + (err as Error).message);
  }
}
