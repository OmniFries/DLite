<script lang="ts">
  import { editor, ui } from './state.svelte';

  const presets = [
    { label: 'HD', w: 1920, h: 1080 },
    { label: 'Square', w: 2048, h: 2048 },
    { label: 'A4 · 150 dpi', w: 1240, h: 1754 },
    { label: '4K', w: 3840, h: 2160 },
    { label: 'Phone', w: 1080, h: 1920 },
    { label: 'Icon', w: 512, h: 512 },
  ];
  let w = $state(1920);
  let h = $state(1080);
  let bg = $state<'white' | 'transparent'>('white');

  function create() {
    const W = Math.round(Math.min(8192, Math.max(1, w)));
    const H = Math.round(Math.min(8192, Math.max(1, h)));
    editor.newDocument(W, H, bg === 'white' ? '#ffffff' : null);
    ui.newDocOpen = false;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" onclick={() => (ui.newDocOpen = false)}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="nd-title"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      e.stopPropagation();
      if (e.key === 'Escape') ui.newDocOpen = false;
      if (e.key === 'Enter') create();
    }}
  >
    <h2 id="nd-title">New drawing</h2>
    <p class="warn">It opens in a new tab.</p>
    <div class="presets">
      {#each presets as p (p.label)}
        <button class="preset" class:on={w === p.w && h === p.h} onclick={() => ((w = p.w), (h = p.h))}>
          <span class="shape" style="aspect-ratio:{p.w}/{p.h}"></span>
          <strong>{p.label}</strong>
          <span>{p.w} × {p.h}</span>
        </button>
      {/each}
    </div>
    <div class="size">
      <label>Width <input type="number" bind:value={w} min="1" max="8192" /></label>
      <span class="x">×</span>
      <label>Height <input type="number" bind:value={h} min="1" max="8192" /></label>
      <span class="unit">px</span>
    </div>
    <div class="bg">
      <label><input type="radio" bind:group={bg} value="white" /> White background</label>
      <label><input type="radio" bind:group={bg} value="transparent" /> Transparent</label>
    </div>
    <div class="buttons">
      <button class="text-btn" onclick={() => (ui.newDocOpen = false)}>Cancel</button>
      <button class="filled-btn" onclick={create}>Create</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    display: grid;
    place-items: center;
    z-index: 100;
    animation: fade 150ms var(--ease);
  }
  .dialog {
    width: min(560px, calc(100vw - 32px));
    background: var(--surface-container);
    border-radius: 28px;
    padding: 24px;
    box-shadow: var(--elev-3);
    outline: none;
    animation: pop 200ms var(--ease);
  }
  h2 {
    margin: 0 0 4px;
    font-size: 24px;
    font-weight: 400;
  }
  .warn {
    margin: 0 0 16px;
    color: var(--on-surface-variant);
  }
  .presets {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .preset {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 8px;
    border-radius: var(--radius-m);
    border: 1px solid var(--outline-variant);
    transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
  }
  .preset:hover {
    background: color-mix(in srgb, var(--on-surface) 5%, transparent);
  }
  .preset.on {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
  }
  .preset span:last-child {
    font-size: 12px;
    color: var(--on-surface-variant);
  }
  .shape {
    height: 28px;
    max-width: 48px;
    border: 2px solid var(--on-surface-variant);
    border-radius: 3px;
    margin-bottom: 4px;
  }
  .size {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    margin: 20px 0 12px;
  }
  .size label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--on-surface-variant);
  }
  .size input {
    width: 120px;
    color: var(--on-surface);
    font-size: 14px;
  }
  .x,
  .unit {
    padding-bottom: 7px;
    color: var(--on-surface-variant);
  }
  .bg {
    display: flex;
    gap: 20px;
  }
  .bg label {
    display: flex;
    gap: 6px;
    align-items: center;
    cursor: pointer;
  }
  .bg input {
    accent-color: var(--primary);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 24px;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
  }
</style>
