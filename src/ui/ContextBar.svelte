<script lang="ts">
  import Icon from './Icon.svelte';
  import Segmented from './Segmented.svelte';
  import Slider from './Slider.svelte';
  import { editor, settings, ui } from './state.svelte';

  const pct = (v: number) => Math.round(v * 100) + '%';
  const px = (v: number) => v + ' px';

  let isVector = $derived((ui.version, editor.doc.active.kind === 'vector'));
  let paints = $derived(ui.tool === 'brush' || ui.tool === 'pencil' || ui.tool === 'eraser');
  let strokeEraser = $derived(ui.tool === 'eraser' && isVector && settings.eraserMode === 'stroke');
  const names: Record<string, string> = {
    brush: 'Brush',
    pencil: 'Pencil',
    eraser: 'Eraser',
    fill: 'Fill',
    eyedropper: 'Eyedropper',
    select: 'Select',
    subselect: 'Edit points',
    hand: 'Hand',
    zoom: 'Zoom',
  };
</script>

<div class="bar">
  <span class="tool-name">{names[ui.tool]}</span>
  <span class="chip" class:vector={isVector} title={isVector ? 'Strokes on this layer stay editable' : 'This layer paints pixels'}>
    <Icon name={isVector ? 'gesture' : 'image'} />
    {isVector ? 'Vector layer' : 'Raster layer'}
  </span>

  {#if paints}
    {#if ui.tool === 'eraser' && isVector}
      <Segmented
        label="Mode"
        bind:value={settings.eraserMode}
        options={[
          { value: 'stroke', label: 'Stroke', tip: 'Deletes any whole stroke it touches (E to switch)' },
          { value: 'free', label: 'Free', tip: 'Erases only where you rub, splitting strokes (E to switch)' },
        ]}
      />
    {/if}
    {#if ui.tool !== 'eraser' && isVector}
      <Segmented
        label="Drawing"
        bind:value={settings.drawMode}
        options={[
          { value: 'object', label: 'Object', tip: 'Each stroke stays separate and editable' },
          { value: 'merge', label: 'Merge', tip: 'Joins same-color shapes and cuts through other colors, like Animate' },
        ]}
      />
    {/if}
    <Slider label="Size" bind:value={settings.size} min={1} max={500} curve format={px} />
    {#if ui.tool !== 'eraser' || !isVector}
      <Slider label="Opacity" bind:value={settings.opacity} min={0.01} max={1} step={0.01} format={pct} width={96} />
    {/if}
    {#if ui.tool !== 'pencil' && !isVector}
      <Slider label="Hardness" bind:value={settings.hardness} min={0} max={1} step={0.01} format={pct} width={96} />
    {/if}
    {#if ui.tool !== 'eraser' || !isVector}
      <Slider label="Smoothing" bind:value={settings.smoothing} min={0} max={0.9} step={0.01} format={pct} width={96} />
    {/if}
    {#if ui.tool !== 'pencil' && !(ui.tool === 'eraser' && isVector)}
      <label class="toggle tooltip below" data-tip="Pen pressure changes the size">
        <input type="checkbox" bind:checked={settings.pressureSize} />
        <Icon name="stylus" /> Size
      </label>
      {#if !isVector}
        <label class="toggle tooltip below" data-tip="Pen pressure changes the opacity">
          <input type="checkbox" bind:checked={settings.pressureOpacity} />
          <Icon name="stylus" /> Opacity
        </label>
      {/if}
    {/if}
    {#if strokeEraser}
      <span class="hint">Touch a stroke to delete it</span>
    {/if}
  {:else if ui.tool === 'fill'}
    {#if isVector}
      <Segmented
        label="Close gaps"
        bind:value={settings.fillGap}
        options={[
          { value: 0, label: 'None' },
          { value: 4, label: 'Small' },
          { value: 10, label: 'Medium' },
          { value: 24, label: 'Large' },
        ]}
      />
    {:else}
      <Slider label="Tolerance" bind:value={settings.tolerance} min={0} max={255} width={140} />
    {/if}
    <Slider label="Opacity" bind:value={settings.opacity} min={0.01} max={1} step={0.01} format={pct} width={96} />
    {#if isVector}<span class="hint">Click inside lines to fill, or click a fill to recolor it</span>{/if}
  {:else if ui.tool === 'select'}
    {#if ui.selectionCount}
      <span class="hint">{ui.selectionCount} selected</span>
      <button class="icon-btn small tooltip below" data-tip="Flip horizontal" aria-label="Flip horizontal" onclick={() => editor.flipSelection(true)}>
        <Icon name="flip" />
      </button>
      <button class="icon-btn small tooltip below flip-v" data-tip="Flip vertical" aria-label="Flip vertical" onclick={() => editor.flipSelection(false)}>
        <Icon name="flip" />
      </button>
      <button class="text-btn" onclick={() => editor.recolorSelection(settings.color)}>Apply color</button>
      <button class="text-btn" onclick={() => editor.deleteSelection()}>Delete</button>
      <button class="text-btn" onclick={() => editor.deselect()}>Deselect</button>
      <span class="hint">Drag handles to scale (Shift keeps shape, Alt from center), round handle to rotate</span>
    {:else}
      <span class="hint">{isVector ? 'Click a stroke, or drag to box-select. Shift adds to the selection.' : 'Choose a vector layer to select strokes.'}</span>
    {/if}
  {:else if ui.tool === 'subselect'}
    <span class="hint">
      {isVector
        ? 'Click a stroke to see its points. Drag points or handles · Alt-drag a point to curve it · Double-click the line to add a point · Delete removes a point'
        : 'Choose a vector layer to edit points.'}
    </span>
  {:else if ui.tool === 'zoom'}
    <span class="hint">Click to zoom in, Alt+click to zoom out. Ctrl+scroll works with any tool.</span>
  {:else if ui.tool === 'hand'}
    <span class="hint">Drag to pan. Hold Space with any tool to pan.</span>
  {:else if ui.tool === 'eyedropper'}
    <span class="hint">Click to pick a color from the drawing</span>
  {/if}
</div>

<style>
  .bar {
    height: 48px;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 0 16px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }
  .tool-name {
    font-weight: 500;
    min-width: 72px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border-radius: var(--radius-s);
    border: 1px solid var(--outline-variant);
    color: var(--on-surface-variant);
    font-size: 12px;
    white-space: nowrap;
  }
  .chip :global(.icon) {
    font-size: 16px;
  }
  .chip.vector {
    background: var(--primary-container);
    color: var(--on-primary-container);
    border-color: transparent;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--on-surface-variant);
    cursor: pointer;
    white-space: nowrap;
  }
  .toggle input {
    accent-color: var(--primary);
  }
  .toggle :global(.icon) {
    font-size: 18px;
  }
  .flip-v :global(.icon) {
    transform: rotate(90deg);
  }
  .hint {
    color: var(--on-surface-variant);
    font-size: 13px;
    white-space: nowrap;
  }
</style>
