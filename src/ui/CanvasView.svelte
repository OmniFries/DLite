<script lang="ts">
  import { onMount } from 'svelte';
  import { editor } from './state.svelte';

  let canvas: HTMLCanvasElement;
  onMount(() => {
    editor.attach(canvas);
    editor.refreshCursor();
    return () => editor.detach();
  });
</script>

<div class="stage">
  <canvas bind:this={canvas} data-testid="canvas"></canvas>
</div>

<style>
  .stage {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--radius-l);
    background: var(--workspace);
  }
  canvas {
    position: absolute;
    inset: 0;
    display: block;
    touch-action: none;
    --workspace: inherit;
  }
</style>
