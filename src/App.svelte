<script lang="ts">
  import type { ToolId } from './engine/Editor';
  import CanvasView from './ui/CanvasView.svelte';
  import ColorPicker from './ui/ColorPicker.svelte';
  import ContextBar from './ui/ContextBar.svelte';
  import LayersPanel from './ui/LayersPanel.svelte';
  import NewDocDialog from './ui/NewDocDialog.svelte';
  import ToolRail from './ui/ToolRail.svelte';
  import TopBar from './ui/TopBar.svelte';
  import { exportImage } from './ui/files';
  import { editor, settings, ui } from './ui/state.svelte';

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
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || ui.newDocOpen) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod) {
      const handled = () => e.preventDefault();
      if (k === 'z' && e.shiftKey) return handled(), editor.redo();
      if (k === 'z') return handled(), editor.undo();
      if (k === 'y') return handled(), editor.redo();
      if (k === 'n') return handled(), (ui.newDocOpen = true);
      if (k === 's' && e.shiftKey) return handled(), exportImage('image/png');
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

<svelte:window onkeydown={onKey} />

<div class="app">
  <TopBar />
  <div class="body">
    <ToolRail />
    <main class="work">
      <ContextBar />
      <CanvasView />
    </main>
    <aside class="panel" class:closed={!ui.panelOpen} aria-hidden={!ui.panelOpen}>
      <ColorPicker />
      <div class="divider"></div>
      <LayersPanel />
    </aside>
  </div>
  {#if ui.toast}
    <div class="snackbar" role="status">{ui.toast}</div>
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
  .divider {
    height: 1px;
    background: var(--outline-variant);
    margin: 0 16px;
    flex: none;
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
