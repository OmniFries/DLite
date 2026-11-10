<script lang="ts">
  import Icon from './Icon.svelte';
  import { BLEND_MODES, type Layer } from '../engine/Layer';
  import { editor, ui } from './state.svelte';

  // Re-read the document whenever it changes.
  let layers = $derived((ui.version, editor.doc.layers.map((l, i) => ({ l, i })).reverse()));
  let active = $derived((ui.version, editor.doc.active));
  let activeIndex = $derived((ui.version, editor.doc.activeIndex));

  let renaming = $state<number | null>(null);
  let dragFrom = $state<number | null>(null);
  let dropAt = $state<number | null>(null);
  let opacityStart: number | null = null;
  let menuOpen = $state(false);

  function thumb(node: HTMLCanvasElement, layer: Layer) {
    let current = layer;
    const draw = () => editor.drawThumbnail(current, node);
    draw();
    return {
      update(l: Layer) {
        current = l;
        draw();
      },
    };
  }

  // Redraw thumbnails after any document change.
  let thumbs: Record<number, HTMLCanvasElement> = {};
  $effect(() => {
    ui.version;
    for (const { l } of layers) {
      const c = thumbs[l.id];
      if (c) editor.drawThumbnail(l, c);
    }
  });

  function rename(layer: Layer, e: Event) {
    const name = (e.currentTarget as HTMLInputElement).value.trim();
    renaming = null;
    if (name && name !== layer.name) editor.setLayerProp(layer, 'name', name);
  }

  function drop(to: number) {
    if (dragFrom !== null && dragFrom !== to) editor.moveLayer(dragFrom, to);
    dragFrom = dropAt = null;
  }

  function select(i: number) {
    editor.setActiveLayer(i);
  }
</script>

<section class="layers">
  <header>
    <h2>Layers</h2>
    <div class="actions">
      <button class="icon-btn small tooltip below" data-tip="New raster layer" aria-label="New raster layer" onclick={() => editor.addLayer('raster')}>
        <Icon name="add_photo_alternate" />
      </button>
      <button class="icon-btn small tooltip below" data-tip="New vector layer" aria-label="New vector layer" onclick={() => editor.addLayer('vector')}>
        <Icon name="gesture" />
      </button>
      <div class="menu-wrap">
        <button class="icon-btn small" aria-label="More layer actions" onclick={() => (menuOpen = !menuOpen)}>
          <Icon name="more_vert" />
        </button>
        {#if menuOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="scrim" onclick={() => (menuOpen = false)}></div>
          <div class="menu" role="menu">
            <button role="menuitem" onclick={() => { editor.duplicateLayer(); menuOpen = false; }}><Icon name="content_copy" />Duplicate</button>
            <button role="menuitem" onclick={() => { editor.mergeDown(); menuOpen = false; }}><Icon name="vertical_align_bottom" />Merge down</button>
            {#if active.kind === 'vector'}
              <button role="menuitem" onclick={() => { editor.rasterizeLayer(); menuOpen = false; }}><Icon name="texture" />Rasterize</button>
            {/if}
            <button role="menuitem" onclick={() => { editor.clearLayer(); menuOpen = false; }}><Icon name="layers_clear" />Clear</button>
            <button role="menuitem" class="danger" onclick={() => { editor.deleteLayer(); menuOpen = false; }}><Icon name="delete" />Delete</button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <div class="props">
    <select
      value={active.blend}
      aria-label="Blend mode"
      onchange={(e) => editor.setLayerProp(active, 'blend', e.currentTarget.value as Layer['blend'])}
    >
      {#each BLEND_MODES as m (m.id)}
        <option value={m.id}>{m.label}</option>
      {/each}
    </select>
    <label class="opacity">
      <Icon name="opacity" />
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(active.opacity * 100)}
        style="--fill:{active.opacity * 100}%"
        aria-label="Layer opacity"
        onpointerdown={() => (opacityStart = active.opacity)}
        oninput={(e) => {
          editor.setLayerPropLive(active, 'opacity', +e.currentTarget.value / 100);
          ui.version++;
        }}
        onchange={(e) => {
          editor.setLayerProp(active, 'opacity', +e.currentTarget.value / 100, opacityStart ?? undefined);
          opacityStart = null;
        }}
      />
      <span class="num">{Math.round(active.opacity * 100)}%</span>
    </label>
  </div>

  <ul class="list">
    {#each layers as { l, i } (l.id)}
      <li
        class="row"
        class:active={i === activeIndex}
        class:hidden={!l.visible}
        class:drop-above={dropAt === i && dragFrom !== null && dragFrom < i}
        class:drop-below={dropAt === i && dragFrom !== null && dragFrom > i}
        draggable={renaming !== l.id}
        ondragstart={(e) => {
          dragFrom = i;
          e.dataTransfer!.effectAllowed = 'move';
        }}
        ondragover={(e) => {
          e.preventDefault();
          dropAt = i;
        }}
        ondragend={() => (dragFrom = dropAt = null)}
        ondrop={() => drop(i)}
        onclick={() => select(i)}
        onkeydown={(e) => e.key === 'Enter' && select(i)}
        tabindex="0"
        role="option"
        aria-selected={i === activeIndex}
      >
        <canvas class="thumb" width="56" height="40" bind:this={thumbs[l.id]} use:thumb={l}></canvas>
        <div class="meta">
          {#if renaming === l.id}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              type="text"
              value={l.name}
              autofocus
              onblur={(e) => rename(l, e)}
              onkeydown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') renaming = null;
                e.stopPropagation();
              }}
              onclick={(e) => e.stopPropagation()}
            />
          {:else}
            <span class="name" role="textbox" tabindex="-1" ondblclick={() => (renaming = l.id)}>{l.name}</span>
          {/if}
          <span class="kind">
            <Icon name={l.kind === 'vector' ? 'gesture' : 'image'} />
            {l.kind === 'vector' ? 'Vector' : 'Raster'}{l.opacity < 1 ? ` · ${Math.round(l.opacity * 100)}%` : ''}
          </span>
        </div>
        <button
          class="icon-btn small"
          class:on={l.locked}
          aria-label={l.locked ? 'Unlock layer' : 'Lock layer'}
          onclick={(e) => {
            e.stopPropagation();
            editor.setLayerProp(l, 'locked', !l.locked);
          }}
        >
          <Icon name={l.locked ? 'lock' : 'lock_open'} />
        </button>
        <button
          class="icon-btn small"
          aria-label={l.visible ? 'Hide layer' : 'Show layer'}
          onclick={(e) => {
            e.stopPropagation();
            editor.setLayerProp(l, 'visible', !l.visible);
          }}
        >
          <Icon name={l.visible ? 'visibility' : 'visibility_off'} />
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .layers {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 8px 4px 16px;
  }
  h2 {
    font-size: 14px;
    font-weight: 500;
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 2px;
  }
  .menu-wrap {
    position: relative;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
  }
  .menu {
    position: absolute;
    right: 0;
    top: 32px;
    z-index: 41;
    min-width: 180px;
    padding: 8px 0;
    background: var(--surface-container);
    border-radius: var(--radius-s);
    box-shadow: var(--elev-2);
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    height: 40px;
    padding: 0 16px;
    text-align: left;
  }
  .menu button:hover {
    background: color-mix(in srgb, var(--on-surface) 8%, transparent);
  }
  .menu .danger {
    color: #d93025;
  }
  .props {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 4px 16px 8px;
  }
  .props select {
    width: 108px;
    flex: none;
  }
  .opacity {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
    color: var(--on-surface-variant);
  }
  .opacity input {
    flex: 1;
    min-width: 0;
  }
  .opacity :global(.icon) {
    font-size: 18px;
  }
  .num {
    width: 36px;
    text-align: right;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0 8px 8px;
    overflow-y: auto;
    flex: 1;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 4px 6px 8px;
    border-radius: var(--radius-m);
    cursor: pointer;
    outline: none;
    border-top: 2px solid transparent;
    border-bottom: 2px solid transparent;
    transition: background var(--dur) var(--ease);
  }
  .row:hover {
    background: color-mix(in srgb, var(--on-surface) 5%, transparent);
  }
  .row:focus-visible {
    box-shadow: inset 0 0 0 2px var(--primary);
  }
  .row.active {
    background: var(--primary-container);
    color: var(--on-primary-container);
  }
  .row.hidden .thumb,
  .row.hidden .meta {
    opacity: 0.45;
  }
  .row.drop-above {
    border-top-color: var(--primary);
  }
  .row.drop-below {
    border-bottom-color: var(--primary);
  }
  .thumb {
    width: 56px;
    height: 40px;
    border-radius: 6px;
    flex: none;
    background: repeating-conic-gradient(#e8eaed 0 25%, #fff 0 50%) 0 0 / 10px 10px;
    box-shadow: inset 0 0 0 1px var(--outline-variant);
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta input {
    height: 24px;
    padding: 0 6px;
    width: 100%;
  }
  .kind {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    opacity: 0.75;
  }
  .kind :global(.icon) {
    font-size: 14px;
  }
  .row .icon-btn {
    color: inherit;
    opacity: 0.7;
  }
  .row .icon-btn.on {
    opacity: 1;
  }
</style>
