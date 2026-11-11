<script lang="ts">
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';
  import { editor, ui } from './state.svelte';
  import { exportImage, openDocument, saveDocument } from './files';
  import { appVersion, canSelfUpdate, checkForUpdates, RELEASES_URL } from './updates';

  const desktop = canSelfUpdate();
  const inApp = '__TAURI_INTERNALS__' in window;
  let aboutOpen = $state(false);
  let version = $state('');
  void appVersion().then((v) => (version = v));

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
  <div class="brand-wrap">
    <button class="brand" aria-label="About DLite" aria-expanded={aboutOpen} onclick={() => (aboutOpen = !aboutOpen)}>
      <Logo />
      <span class="title">DLite</span>
    </button>
    {#if aboutOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="scrim" onclick={() => (aboutOpen = false)}></div>
      <div class="menu about" role="menu">
        <div class="about-head">
          <strong>DLite</strong>
          <span>Version {version}</span>
        </div>
        {#if desktop}
          <button role="menuitem" onclick={() => { aboutOpen = false; checkForUpdates(true); }}>
            <Icon name="update" /> Check for updates
          </button>
        {:else}
          <a role="menuitem" href={RELEASES_URL} target="_blank" rel="noopener noreferrer" onclick={() => (aboutOpen = false)}>
            <Icon name="download" /> {inApp ? 'Get the latest version' : 'Get the desktop app'}
          </a>
        {/if}
      </div>
    {/if}
  </div>
  <div class="group">
    <button class="icon-btn tooltip below" data-tip="Open (Ctrl+O)" aria-label="Open" onclick={openDocument}>
      <Icon name="folder_open" />
    </button>
    <button class="icon-btn tooltip below" data-tip="Save (Ctrl+S)" aria-label="Save" onclick={() => saveDocument(false)}>
      <Icon name="save" />
    </button>
    <button class="icon-btn tooltip below desktop-only" data-tip="Save as… (Ctrl+Shift+S)" aria-label="Save as" onclick={() => saveDocument(true)}>
      <Icon name="save_as" />
    </button>
    <div class="vsep"></div>
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
    <button class="icon-btn tooltip below desktop-only" data-tip="Light / dark" aria-label="Toggle theme" onclick={toggleTheme}>
      <Icon name="contrast" />
    </button>
    <button class="icon-btn tooltip below" data-tip="Panels (Tab)" aria-label="Toggle panels" onclick={() => (ui.panelOpen = !ui.panelOpen)}>
      <Icon name={ui.panelOpen ? 'right_panel_close' : 'right_panel_open'} />
    </button>
    <div class="export">
      <button class="filled-btn" onclick={() => (exportOpen = !exportOpen)}>
        <Icon name="download" /> <span class="export-label">Export</span>
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
  /* Phones: icon-only, scrolls sideways if it still doesn't fit. */
  @media (max-width: 720px) {
    .top {
      gap: 2px;
      padding: env(safe-area-inset-top) 6px 0;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .title,
    .desktop-only,
    .export-label,
    .vsep,
    .zoom .icon-btn:not(:last-child),
    .spacer {
      display: none;
    }
    .brand-wrap {
      margin-right: 0;
    }
    .zoom {
      margin: 0 0 0 auto;
    }
    .export {
      margin-left: 2px;
    }
    .export .filled-btn {
      padding: 0 12px;
    }
  }
  .brand-wrap {
    position: relative;
    margin-right: 12px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 40px;
    padding: 0 12px 0 4px;
    border-radius: var(--radius-full);
    transition: background var(--dur) var(--ease);
  }
  .brand:hover {
    background: color-mix(in srgb, var(--on-surface) 6%, transparent);
  }
  .menu.about {
    left: 0;
    right: auto;
    min-width: 220px;
  }
  .about-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 16px 10px;
    border-bottom: 1px solid var(--outline-variant);
    margin-bottom: 4px;
  }
  .about-head span {
    font-size: 12px;
    color: var(--on-surface-variant);
  }
  .menu.about button,
  .menu.about a {
    flex-direction: row;
    align-items: center;
    gap: 12px;
    color: inherit;
    text-decoration: none;
    display: flex;
    width: 100%;
    padding: 10px 16px;
  }
  .menu.about a:hover {
    background: color-mix(in srgb, var(--on-surface) 8%, transparent);
  }
  .title {
    font-size: 18px;
    color: var(--on-surface-variant);
  }
  .vsep {
    width: 1px;
    height: 20px;
    background: var(--outline-variant);
    margin: 0 6px;
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
