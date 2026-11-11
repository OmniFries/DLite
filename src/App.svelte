<script lang="ts">
  import type { ToolId } from './engine/Editor';
  import CanvasView from './ui/CanvasView.svelte';
  import ColorPicker from './ui/ColorPicker.svelte';
  import ContextBar from './ui/ContextBar.svelte';
  import LayersPanel from './ui/LayersPanel.svelte';
  import NewDocDialog from './ui/NewDocDialog.svelte';
  import ToolRail from './ui/ToolRail.svelte';
  import TabBar from './ui/TabBar.svelte';
  import YouTubePanel from './ui/YouTubePanel.svelte';
  import { scheduleUpdateCheck } from './ui/updates';
  import TopBar from './ui/TopBar.svelte';
  import ConfirmDialog from './ui/ConfirmDialog.svelte';
  import {
    addImageAsLayer,
    closeTabRequest,
    confirmQuit,
    unsavedCount,
    exportImage,
    handleDroppedFile,
    newDocumentRequest,
    openDocument,
    openPaths,
    saveDocument,
    updateTitle,
  } from './ui/files';
  import { editor, settings, ui } from './ui/state.svelte';

  // Window title shows the file name and a dot for unsaved changes.
  $effect(() => {
    ui.docName;
    ui.dirty;
    updateTitle();
  });

  let dragOver = $state(false);

  // Phone layout: tools at the bottom, panels in a slide-up sheet.
  const phoneQuery = window.matchMedia('(max-width: 720px)');
  let phone = $state(phoneQuery.matches);
  phoneQuery.addEventListener('change', (e) => (phone = e.matches));

  function onDrop(e: DragEvent) {
    dragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    void handleDroppedFile(file);
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragOver = true;
  }

  /** Pasting an image adds it as a new layer. */
  function onPaste(e: ClipboardEvent) {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    void addImageAsLayer(file, 'Pasted image').catch(() => editor.toast("That image couldn't be pasted"));
  }

  // Warn before closing with unsaved changes.
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (unsavedCount()) e.preventDefault();
  }
  scheduleUpdateCheck();
  if ('__TAURI_INTERNALS__' in window) {
    // .lite files double-clicked in the OS: at launch, and later while running (macOS).
    void Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]).then(([{ invoke }, { listen }]) => {
      const take = async () => {
        const paths = await invoke<string[]>('take_open_files');
        if (paths.length) await openPaths(paths);
      };
      void listen('open-files', take);
      void take();
    });
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      void win.onCloseRequested(async (event) => {
        if (!unsavedCount()) return;
        event.preventDefault();
        if (await confirmQuit()) await win.destroy();
      });
    });
  }

  const toolKeys: Record<string, ToolId> = {
    v: 'select',
    a: 'subselect',
    b: 'brush',
    p: 'pencil',
    e: 'eraser',
    g: 'fill',
    i: 'eyedropper',
    h: 'hand',
    z: 'zoom',
  };

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || ui.newDocOpen || ui.dialog) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod) {
      const handled = () => e.preventDefault();
      if (k === 'z' && e.shiftKey) return handled(), editor.redo();
      if (k === 'z') return handled(), editor.undo();
      if (k === 'y') return handled(), editor.redo();
      if (k === 'n') return handled(), newDocumentRequest();
      if (k === 'o') return handled(), openDocument();
      if (k === 'w') return handled(), closeTabRequest(editor.activeSession);
      const step = (d: number) => editor.switchTab((editor.activeSession + d + editor.sessions.length) % editor.sessions.length);
      if (k === 'tab' || k === 'pagedown' || k === 'pageup') return handled(), step(k === 'pageup' || e.shiftKey ? -1 : 1);
      if (k === 's') return handled(), saveDocument(e.shiftKey);
      if (k === 'e' && e.shiftKey) return handled(), exportImage('image/png');
      if (k === 'a') return handled(), editor.selectAll();
      if (k === 'd') return handled(), editor.deselect();
      if (k === 'j') return handled(), editor.duplicateLayer();
      if (k === 'e') return handled(), editor.mergeDown();
      if (k === '0') return handled(), editor.fitToScreen();
      if (k === '1') return handled(), editor.zoomTo(1);
      if (k === '=' || k === '+') return handled(), editor.zoomTo(ui.zoom * 1.25);
      if (k === '-') return handled(), editor.zoomTo(ui.zoom / 1.25);
      return;
    }
    if (e.shiftKey && k === 'n') return editor.addLayer('raster');
    if (e.altKey) return;
    // E again while erasing on a vector layer switches Stroke / Free.
    if (k === 'e' && ui.tool === 'eraser' && editor.doc.active.kind === 'vector') {
      settings.eraserMode = settings.eraserMode === 'free' ? 'stroke' : 'free';
      editor.toast(settings.eraserMode === 'free' ? 'Free eraser: erases only where you rub' : 'Stroke eraser: deletes whole strokes');
      editor.requestRender();
      return;
    }
    if (toolKeys[k]) return editor.setTool(toolKeys[k]);
    if (k === '[') settings.size = Math.max(1, Math.round(settings.size / 1.15));
    else if (k === ']') settings.size = Math.min(500, Math.max(settings.size + 1, Math.round(settings.size * 1.15)));
    else if (k === 'delete' || k === 'backspace') editor.deleteKey();
    else if (k === 'escape') {
      editor.tool.cancel?.(editor);
      editor.deselect();
    }
    else if (k === 'tab') {
      e.preventDefault();
      ui.panelOpen = !ui.panelOpen;
    } else if (k === 'x') {
      // Swap with the previous color, like Photoshop's X.
      const prev = ui.recentColors.find((c) => c.toLowerCase() !== settings.color.toLowerCase());
      if (prev) editor.setColor(prev);
    } else return;
    editor.requestRender();
  }
</script>

<svelte:window
  onkeydown={onKey}
  onpaste={onPaste}
  ondragover={onDragOver}
  ondragleave={(e) => !e.relatedTarget && (dragOver = false)}
  ondrop={onDrop}
  onbeforeunload={onBeforeUnload}
/>

<div class="app">
  <TopBar />
  <div class="body">
    <ToolRail />
    <main class="work">
      <TabBar />
      <ContextBar />
      <CanvasView />
    </main>
    {#if phone && ui.panelOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="sheet-scrim" onclick={() => (ui.panelOpen = false)}></div>
    {/if}
    <aside class="panel" class:closed={!ui.panelOpen} aria-hidden={!ui.panelOpen}>
      {#if phone}<div class="grabber" aria-hidden="true"></div>{/if}
      <ColorPicker />
      <div class="divider"></div>
      <LayersPanel />
      <YouTubePanel />
    </aside>
  </div>
  {#if ui.toast}
    <div class="snackbar" role="status">{ui.toast}</div>
  {/if}
  {#if dragOver}
    <div class="drop-hint" aria-hidden="true">
      <div>Drop a .lite file to open it, or an image to add it as a layer</div>
    </div>
  {/if}
  {#if ui.dialog}
    <ConfirmDialog req={ui.dialog} />
  {/if}
  {#if ui.newDocOpen}
    <NewDocDialog />
  {/if}
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--surface-dim);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    padding: 0 8px 8px 0;
    gap: 8px;
  }
  .work {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: var(--radius-l);
    overflow: hidden;
  }
  .work :global(.stage) {
    margin: 0 8px 8px;
  }
  .panel {
    width: 288px;
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: var(--radius-l);
    overflow: hidden;
    transition: width 200ms var(--ease), opacity 200ms var(--ease), margin 200ms var(--ease);
  }
  .panel.closed {
    width: 0;
    opacity: 0;
    margin-left: -8px;
    pointer-events: none;
  }
  .sheet-scrim {
    display: none;
  }

  /* ---------- phones ---------- */
  @media (max-width: 720px) {
    .body {
      padding: 0;
      gap: 0;
    }
    .work {
      border-radius: 0;
    }
    .work :global(.stage) {
      margin: 0;
      border-radius: 0;
    }
    .sheet-scrim {
      display: block;
      position: fixed;
      inset: 0;
      background: var(--scrim);
      z-index: 60;
      animation: fade-in 150ms var(--ease);
    }
    .panel {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      width: auto;
      max-height: 78vh;
      overflow-y: auto;
      border-radius: 28px 28px 0 0;
      box-shadow: var(--elev-3);
      z-index: 61;
      padding-bottom: env(safe-area-inset-bottom);
      transition: transform 250ms var(--ease), opacity 200ms var(--ease);
    }
    .panel.closed {
      width: auto;
      margin-left: 0;
      transform: translateY(100%);
    }
    .grabber {
      width: 32px;
      height: 4px;
      border-radius: 2px;
      background: var(--outline);
      margin: 10px auto 2px;
      flex: none;
    }
    .panel :global(.layers) {
      flex: none;
    }
    .panel :global(.layers .list) {
      max-height: 40vh;
    }
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  .divider {
    height: 1px;
    background: var(--outline-variant);
    margin: 0 16px;
    flex: none;
  }
  .drop-hint {
    position: fixed;
    inset: 8px;
    border: 2px dashed var(--primary);
    border-radius: var(--radius-l);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    display: grid;
    place-items: center;
    z-index: 120;
    pointer-events: none;
  }
  .drop-hint div {
    background: var(--surface);
    padding: 12px 20px;
    border-radius: var(--radius-full);
    box-shadow: var(--elev-2);
    font-weight: 500;
  }
  .snackbar {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    background: var(--on-surface);
    color: var(--surface);
    padding: 12px 20px;
    border-radius: var(--radius-s);
    box-shadow: var(--elev-3);
    z-index: 200;
    animation: up 200ms var(--ease);
  }
  @keyframes up {
    from {
      opacity: 0;
      transform: translate(-50%, 12px);
    }
  }
</style>
