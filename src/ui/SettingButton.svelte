<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { ui } from './state.svelte';

  interface Props {
    /** Unique id; only one setting pop-up is open at a time. */
    id: string;
    icon: string;
    label: string;
    /** Short value shown next to the icon (e.g. "12" or "80%"). */
    value?: string;
    /** Highlights the icon (e.g. a toggle that is on). */
    active?: boolean;
    children: Snippet;
  }
  let { id, icon, label, value, active = false, children }: Props = $props();

  let btn: HTMLButtonElement;
  let popEl: HTMLDivElement | undefined = $state();
  let pos = $state({ left: 0, bottom: 0 });
  let open = $derived(ui.openSetting === id);

  // Close when tapping anywhere else. A tap on the canvas only closes the
  // pop-up (it doesn't draw); a tap on another setting icon opens that one.
  $effect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popEl?.contains(t) || btn.contains(t)) return;
      ui.openSetting = null;
      if ((t as HTMLElement).tagName === 'CANVAS') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  });

  function toggle() {
    if (open) {
      ui.openSetting = null;
      return;
    }
    // Fixed position above the button, kept on screen.
    const r = btn.getBoundingClientRect();
    const width = 280;
    pos = {
      left: Math.max(8, Math.min(window.innerWidth - width - 8, r.left + r.width / 2 - width / 2)),
      bottom: window.innerHeight - r.top + 8,
    };
    ui.openSetting = id;
  }
</script>

<button
  bind:this={btn}
  class="setting tooltip above"
  class:open
  class:active
  data-tip={open ? undefined : label}
  aria-label={value ? `${label}: ${value}` : label}
  aria-expanded={open}
  onclick={toggle}
>
  <Icon name={icon} />
  {#if value}<span class="value">{value}</span>{/if}
</button>

{#if open}
  <div
    bind:this={popEl}
    class="pop"
    role="dialog"
    aria-label={label}
    tabindex="-1"
    style="left:{pos.left}px; bottom:{pos.bottom}px"
    onkeydown={(e) => e.key === 'Escape' && (ui.openSetting = null)}
  >
    <div class="pop-title">{label}</div>
    {@render children()}
  </div>
{/if}

<style>
  .setting {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 36px;
    padding: 0 10px;
    border-radius: var(--radius-full);
    color: var(--on-surface-variant);
    flex: none;
    transition: background var(--dur) var(--ease);
  }
  @media (max-width: 720px) {
    .setting {
      padding: 0 7px;
      gap: 3px;
    }
  }
  /* Narrow phones: icons only; the value shows in the pop-up. */
  @media (max-width: 400px) {
    .value {
      display: none;
    }
    .setting {
      padding: 0 8px;
    }
  }
  .setting:hover {
    background: color-mix(in srgb, var(--on-surface) 8%, transparent);
  }
  .setting.open,
  .setting.active {
    background: var(--primary-container);
    color: var(--on-primary-container);
  }
  .value {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    min-width: 2ch;
  }
  .pop {
    position: fixed;
    z-index: 71;
    width: 280px;
    padding: 12px 16px 14px;
    background: var(--surface-container);
    border-radius: var(--radius-m);
    box-shadow: var(--elev-2);
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: pop-in 140ms var(--ease);
    outline: none;
  }
  .pop-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--on-surface-variant);
  }
  .pop :global(.slider) {
    width: 100%;
  }
  .pop :global(.slider input) {
    flex: 1;
    width: auto !important;
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>
