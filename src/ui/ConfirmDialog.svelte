<script lang="ts">
  import type { DialogRequest } from './state.svelte';
  let { req }: { req: DialogRequest } = $props();
  let box: HTMLDivElement;
  $effect(() => {
    // Focus the main button so Enter confirms.
    box?.querySelector<HTMLButtonElement>('.filled-btn')?.focus();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" onclick={() => req.resolve('cancel')}>
  <div
    class="dialog"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="cd-title"
    aria-describedby="cd-msg"
    tabindex="-1"
    bind:this={box}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      e.stopPropagation();
      if (e.key === 'Escape') req.resolve('cancel');
    }}
  >
    <h2 id="cd-title">{req.title}</h2>
    <p id="cd-msg">{req.message}</p>
    <div class="buttons">
      {#each req.buttons as b (b.id)}
        <button class={b.kind === 'filled' ? 'filled-btn' : 'text-btn'} onclick={() => req.resolve(b.id)}>{b.label}</button>
      {/each}
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
    z-index: 150;
    animation: fade 150ms var(--ease);
  }
  .dialog {
    width: min(420px, calc(100vw - 32px));
    background: var(--surface-container);
    border-radius: 28px;
    padding: 24px;
    box-shadow: var(--elev-3);
    outline: none;
    animation: pop 200ms var(--ease);
  }
  h2 {
    margin: 0 0 12px;
    font-size: 22px;
    font-weight: 400;
  }
  p {
    margin: 0;
    color: var(--on-surface-variant);
    line-height: 1.5;
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
