<script lang="ts">
  import Icon from './Icon.svelte';
  import type { ToolId } from '../engine/Editor';
  import { editor, ui } from './state.svelte';

  const tools: { id: ToolId; icon: string; label: string; key: string }[] = [
    { id: 'select', icon: 'arrow_selector_tool', label: 'Select, move, scale, rotate', key: 'V' },
    { id: 'subselect', icon: 'polyline', label: 'Edit points', key: 'A' },
    { id: 'brush', icon: 'brush', label: 'Brush', key: 'B' },
    { id: 'pencil', icon: 'edit', label: 'Pencil', key: 'P' },
    { id: 'eraser', icon: 'ink_eraser', label: 'Eraser', key: 'E' },
    { id: 'fill', icon: 'format_color_fill', label: 'Fill', key: 'G' },
    { id: 'eyedropper', icon: 'colorize', label: 'Eyedropper', key: 'I' },
    { id: 'hand', icon: 'pan_tool', label: 'Hand', key: 'H' },
    { id: 'zoom', icon: 'zoom_in', label: 'Zoom', key: 'Z' },
  ];
</script>

<nav class="rail">
  {#each tools as t (t.id)}
    <button
      class="tool tooltip right"
      class:active={ui.tool === t.id}
      data-tip="{t.label} ({t.key})"
      aria-label={t.label}
      aria-pressed={ui.tool === t.id}
      onclick={() => editor.setTool(t.id)}
    >
      <Icon name={t.icon} filled={ui.tool === t.id} />
    </button>
    {#if t.id === 'subselect' || t.id === 'eyedropper'}
      <div class="sep"></div>
    {/if}
  {/each}
</nav>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 0;
    width: 64px;
  }
  .tool {
    width: 48px;
    height: 40px;
    border-radius: var(--radius-l);
    display: grid;
    place-items: center;
    color: var(--on-surface-variant);
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
  }
  .tool :global(.icon) {
    font-size: 22px;
  }
  .tool:hover {
    background: color-mix(in srgb, var(--on-surface) 8%, transparent);
  }
  .tool.active {
    background: var(--primary-container);
    color: var(--on-primary-container);
  }
  .sep {
    width: 24px;
    height: 1px;
    background: var(--outline-variant);
    margin: 4px 0;
  }
</style>
