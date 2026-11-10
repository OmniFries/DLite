<script lang="ts">
  import Icon from './Icon.svelte';
  import { editor, ui } from './state.svelte';
  import { exportImage } from './files';

  let exportOpen = $state(false);
  let zoomText = $derived(Math.round(ui.zoom * 100) + '%');

  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    editor.requestRender();
  }
</script>

<header class="top">
  <div class="brand">
    <div class="logo" aria-hidden="true">
      <Icon name="draw" filled />
    </div>
    <span class="title">Lite Draw</span>
  </div>

  <div class="group">
    <button class="icon-btn tooltip below" data-tip="New drawing (Ctrl+N)" aria-label="New drawing" onclick={() => (ui.newDocOpen = true)}>
      <Icon name="note_add" />
    </button>
    <button class="icon-btn tooltip below" data-tip="Undo (Ctrl+Z)" aria-label="Undo" disabled={!ui.canUndo} onclick={() => editor.undo()}>
      <Icon name="undo" />
    </button>
    <button class="icon-btn tooltip below" data-tip="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!ui.canRedo} onclick={() => editor.redo()}>
      <Icon name="redo" />
    </button>
  </div>

  <div class="spacer"></div>

  <div class="zoom">
    <button class="icon-btn small" aria-label="Zoom out" onclick={() => editor.zoomTo(ui.zoom / 1.25)}>
      <Icon name="remove" />
    </button>
    <button class="zoom-val tooltip below" data-tip="Actual size (Ctrl+1)" onclick={() => editor.zoomTo(1)}>{zoomText}</button>
    <button class="icon-btn small" aria-label="Zoom in" onclick={() => editor.zoomTo(ui.zoom * 1.25)}>
      <Icon name="add" />
    </button>
    <button class="icon-btn small tooltip below" data-tip="Fit to screen (Ctrl+0)" aria-label="Fit to screen" onclick={() => editor.fitToScreen()}>
      <Icon name="fit_screen" />
    </button>
  </div>

  <div class="group">
    <button class="icon-btn tooltip below" data-tip="Light / dark" aria-label="Toggle theme" onclick={toggleTheme}>
      <Icon name="contrast" />
    </button>
    <button class="icon-btn tooltip below" data-tip="Panels (Tab)" aria-label="Toggle panels" onclick={() => (ui.panelOpen = !ui.panelOpen)}>
      <Icon name={ui.panelOpen ? 'right_panel_close' : 'right_panel_open'} />
    </button>
    <div class="export">
      <button class="filled-btn" onclick={() => (exportOpen = !exportOpen)}>
        <Icon name="download" /> Export
      </button>
      {#if exportOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="scrim" onclick={() => (exportOpen = false)}></div>
        <div class="menu" role="menu">
          {#each [['image/png', 'PNG', 'Lossless, keeps transparency'], ['image/jpeg', 'JPG', 'Small file, no transparency'], ['image/webp', 'WebP', 'Small file, keeps transparency']] as [type, label, desc] (type)}
            <button role="menuitem" onclick={() => { exportOpen = false; exportImage(type as 'image/png'); }}>
              <strong>{label}</strong><span>{desc}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  .top {
    height: 56px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px 0 14px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-right: 12px;
  }
  .logo {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    color: #fff;
    background: conic-gradient(from 200deg, #4285f4, #34a853, #fbbc04, #ea4335, #4285f4);
  }
  .logo :global(.icon) {
    font-size: 20px;
  }
  .title {
    font-size: 18px;
    color: var(--on-surface-variant);
  }
  .group {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .spacer {
    flex: 1;
  }
  .zoom {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
    border-radius: var(--radius-full);
    background: var(--surface-container);
    margin-right: 8px;
  }
  .zoom-val {
    min-width: 52px;
    height: 28px;
    border-radius: var(--radius-full);
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }
  .zoom-val:hover {
    background: color-mix(in srgb, var(--on-surface) 8%, transparent);
  }
  .export {
    position: relative;
    margin-left: 8px;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
  }
  .menu {
    position: absolute;
    right: 0;
    top: 44px;
    z-index: 41;
    min-width: 240px;
    padding: 8px 0;
    background: var(--surface-container);
    border-radius: var(--radius-s);
    box-shadow: var(--elev-2);
  }
  .menu button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    padding: 8px 16px;
    text-align: left;
  }
  .menu button:hover {
    background: color-mix(in srgb, var(--on-surface) 8%, transparent);
  }
  .menu span {
    font-size: 12px;
    color: var(--on-surface-variant);
  }
</style>
