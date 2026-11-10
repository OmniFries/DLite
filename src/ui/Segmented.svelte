<script lang="ts" generics="T extends string | number">
  import Icon from './Icon.svelte';

  interface Props {
    label?: string;
    value: T;
    options: { value: T; label: string; icon?: string; tip?: string }[];
  }
  let { label, value = $bindable(), options }: Props = $props();
</script>

<div class="wrap">
  {#if label}<span class="label">{label}</span>{/if}
  <div class="seg" role="radiogroup" aria-label={label}>
    {#each options as o (o.value)}
      <button
        role="radio"
        aria-checked={value === o.value}
        class:on={value === o.value}
        class="tooltip below"
        data-tip={o.tip}
        onclick={() => (value = o.value)}
      >
        {#if value === o.value}<Icon name="check" />{:else if o.icon}<Icon name={o.icon} />{/if}
        {o.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .label {
    color: var(--on-surface-variant);
    font-size: 13px;
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--outline);
    border-radius: var(--radius-full);
    overflow: visible;
    height: 32px;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    font-size: 13px;
    font-weight: 500;
    color: var(--on-surface);
    transition: background var(--dur) var(--ease);
  }
  button + button {
    border-left: 1px solid var(--outline);
  }
  button:first-child {
    border-radius: var(--radius-full) 0 0 var(--radius-full);
  }
  button:last-child {
    border-radius: 0 var(--radius-full) var(--radius-full) 0;
  }
  button:hover {
    background: color-mix(in srgb, var(--on-surface) 8%, transparent);
  }
  button.on {
    background: var(--primary-container);
    color: var(--on-primary-container);
  }
  button :global(.icon) {
    font-size: 18px;
  }
</style>
