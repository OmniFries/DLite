<script lang="ts">
  import Icon from './Icon.svelte';
  import Segmented from './Segmented.svelte';
  import SettingButton from './SettingButton.svelte';
  import Slider from './Slider.svelte';
  import { editor, settings, ui } from './state.svelte';

  const pct = (v: number) => Math.round(v * 100) + '%';
  const px = (v: number) => v + ' px';

  let isVector = $derived((ui.version, editor.doc.active.kind === 'vector'));
  let paints = $derived(ui.tool === 'brush' || ui.tool === 'pencil' || ui.tool === 'eraser');
  let vectorEraser = $derived(ui.tool === 'eraser' && isVector);
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
  const hints: Record<string, string> = {
    select: 'Click a stroke, or drag to box-select. Shift adds. Drag handles to scale, the round handle to rotate.',
    subselect: 'Click a stroke to see its points. Drag points or handles. Alt-drag a point to curve it. Double-click the line to add a point; Delete removes one.',
    zoom: 'Click to zoom in, Alt+click to zoom out. Ctrl+scroll or pinch works with any tool.',
    hand: 'Drag to pan. Hold Space with any tool, or use two fingers.',
    eyedropper: 'Click to pick a color from the drawing.',
  };
  const gapNames: Record<number, string> = { 0: 'None', 4: 'S', 10: 'M', 24: 'L' };
</script>

<div class="bar" role="toolbar" aria-label="Tool settings">
  <span class="tool-name">{names[ui.tool]}</span>
  <span
    class="chip tooltip above"
    class:vector={isVector}
    data-tip={isVector ? 'Vector layer: strokes stay editable' : 'Raster layer: paints pixels'}
    aria-label={isVector ? 'Vector layer' : 'Raster layer'}
  >
    <Icon name={isVector ? 'gesture' : 'image'} />
  </span>
  <span class="sep"></span>

  {#if paints}
    {#if vectorEraser}
      <SettingButton id="eraser-mode" icon={settings.eraserMode === 'free' ? 'ink_eraser' : 'deselect'} label="Eraser mode" value={settings.eraserMode === 'free' ? 'Free' : 'Stroke'}>
        <Segmented
          bind:value={settings.eraserMode}
          options={[
            { value: 'stroke', label: 'Stroke', tip: 'Deletes any whole stroke it touches' },
            { value: 'free', label: 'Free', tip: 'Erases only where you rub' },
          ]}
        />
        <span class="note">Press E again to switch.</span>
      </SettingButton>
    {:else if isVector}
      <SettingButton id="draw-mode" icon="join" label="Drawing mode" value={settings.drawMode === 'merge' ? 'Merge' : 'Object'}>
        <Segmented
          bind:value={settings.drawMode}
          options={[
            { value: 'object', label: 'Object', tip: 'Each stroke stays separate' },
            { value: 'merge', label: 'Merge', tip: 'Joins same colors, cuts other colors' },
          ]}
        />
      </SettingButton>
    {/if}

    <SettingButton id="size" icon="line_weight" label="Size" value={String(settings.size)}>
      <Slider label="" bind:value={settings.size} min={1} max={500} curve format={px} />
    </SettingButton>

    {#if !vectorEraser}
      <SettingButton id="opacity" icon="opacity" label="Opacity" value={pct(settings.opacity)}>
        <Slider label="" bind:value={settings.opacity} min={0.01} max={1} step={0.01} format={pct} />
      </SettingButton>
    {/if}

    {#if ui.tool !== 'pencil' && !isVector}
      <SettingButton id="hardness" icon="lens_blur" label="Hardness" value={pct(settings.hardness)}>
        <Slider label="" bind:value={settings.hardness} min={0} max={1} step={0.01} format={pct} />
      </SettingButton>
    {/if}

    {#if !vectorEraser}
      <SettingButton id="smoothing" icon="timeline" label="Smoothing" value={pct(settings.smoothing)}>
        <Slider label="" bind:value={settings.smoothing} min={0} max={0.9} step={0.01} format={pct} />
      </SettingButton>
    {/if}

    {#if ui.tool !== 'pencil' && !vectorEraser}
      <SettingButton id="pressure" icon="stylus" label="Pen pressure" active={settings.pressureSize || (!isVector && settings.pressureOpacity)}>
        <label class="check"><input type="checkbox" bind:checked={settings.pressureSize} /> Changes the size</label>
        {#if !isVector}
          <label class="check"><input type="checkbox" bind:checked={settings.pressureOpacity} /> Changes the opacity</label>
        {/if}
      </SettingButton>
    {/if}
  {:else if ui.tool === 'fill'}
    {#if isVector}
      <SettingButton id="gap" icon="conversion_path" label="Close gaps" value={gapNames[settings.fillGap] ?? ''}>
        <Segmented
          bind:value={settings.fillGap}
          options={[
            { value: 0, label: 'None' },
            { value: 4, label: 'Small' },
            { value: 10, label: 'Medium' },
            { value: 24, label: 'Large' },
          ]}
        />
        <span class="note">Click inside lines to fill, or click a fill to recolor it.</span>
      </SettingButton>
    {:else}
      <SettingButton id="tolerance" icon="tune" label="Tolerance" value={String(settings.tolerance)}>
        <Slider label="" bind:value={settings.tolerance} min={0} max={255} />
      </SettingButton>
    {/if}
    <SettingButton id="fill-opacity" icon="opacity" label="Opacity" value={pct(settings.opacity)}>
      <Slider label="" bind:value={settings.opacity} min={0.01} max={1} step={0.01} format={pct} />
    </SettingButton>
  {:else if ui.tool === 'select' && ui.selectionCount}
    <span class="count">{ui.selectionCount} selected</span>
    <button class="icon-btn tooltip above" data-tip="Flip horizontal" aria-label="Flip horizontal" onclick={() => editor.flipSelection(true)}>
      <Icon name="flip" />
    </button>
    <button class="icon-btn tooltip above flip-v" data-tip="Flip vertical" aria-label="Flip vertical" onclick={() => editor.flipSelection(false)}>
      <Icon name="flip" />
    </button>
    <button class="icon-btn tooltip above" data-tip="Apply current color" aria-label="Apply color" onclick={() => editor.recolorSelection(settings.color)}>
      <Icon name="format_paint" />
    </button>
    <button class="icon-btn tooltip above" data-tip="Delete (Del)" aria-label="Delete" onclick={() => editor.deleteSelection()}>
      <Icon name="delete" />
    </button>
    <button class="icon-btn tooltip above" data-tip="Deselect (Esc)" aria-label="Deselect" onclick={() => editor.deselect()}>
      <Icon name="deselect" />
    </button>
  {/if}

  {#if hints[ui.tool] && !(ui.tool === 'select' && ui.selectionCount)}
    <SettingButton id="hint-{ui.tool}" icon="help" label="How to use {names[ui.tool]}">
      <span class="note">
        {(ui.tool === 'select' || ui.tool === 'subselect') && !isVector ? 'Choose a vector layer first. ' : ''}{hints[ui.tool]}
      </span>
    </SettingButton>
  {/if}
</div>

<style>
  .bar {
    height: 52px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px;
    border-top: 1px solid var(--outline-variant);
    flex: none;
  }
  @media (max-width: 720px) {
    .bar {
      overflow-x: auto;
      scrollbar-width: none;
      padding: 0 6px;
    }
    /* The left tool strip already shows the active tool. */
    .tool-name {
      display: none;
    }
    .sep {
      margin: 0 2px;
    }
  }
  .tool-name {
    font-weight: 500;
    margin-right: 4px;
    white-space: nowrap;
  }
  .chip {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: var(--radius-s);
    border: 1px solid var(--outline-variant);
    color: var(--on-surface-variant);
    flex: none;
  }
  .chip :global(.icon) {
    font-size: 18px;
  }
  .chip.vector {
    background: var(--primary-container);
    color: var(--on-primary-container);
    border-color: transparent;
  }
  .sep {
    width: 1px;
    height: 24px;
    background: var(--outline-variant);
    margin: 0 6px;
    flex: none;
  }
  .count {
    font-size: 13px;
    color: var(--on-surface-variant);
    white-space: nowrap;
    margin-right: 4px;
  }
  .flip-v :global(.icon) {
    transform: rotate(90deg);
  }
  .note {
    font-size: 13px;
    line-height: 1.45;
    color: var(--on-surface-variant);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    cursor: pointer;
  }
  .check input {
    accent-color: var(--primary);
    width: 18px;
    height: 18px;
  }
</style>
