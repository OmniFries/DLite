<script lang="ts">
  import Icon from './Icon.svelte';
  import { closeTabRequest, newDocumentRequest } from './files';
  import { editor, ui } from './state.svelte';

  let dragFrom = $state<number | null>(null);
  let dropAt = $state<number | null>(null);

  function drop(to: number) {
    if (dragFrom !== null && dragFrom !== to) editor.moveTab(dragFrom, to);
    dragFrom = dropAt = null;
  }
</script>

<div class="tabs" role="tablist" aria-label="Open drawings">
  {#each ui.tabs as t, i (t.id)}
    <div
      class="tab"
      class:active={i === ui.activeTab}
      class:drop-before={dropAt === i && dragFrom !== null && dragFrom > i}
      class:drop-after={dropAt === i && dragFrom !== null && dragFrom < i}
      role="tab"
      tabindex={i === ui.activeTab ? 0 : -1}
      aria-selected={i === ui.activeTab}
      title={t.name}
      draggable="true"
      onclick={() => editor.switchTab(i)}
      onauxclick={(e) => e.button === 1 && closeTabRequest(i)}
      onmousedown={(e) => e.button === 1 && e.preventDefault()}
      onkeydown={(e) => {
        if (e.key === 'ArrowRight') editor.switchTab(Math.min(ui.tabs.length - 1, i + 1));
        if (e.key === 'ArrowLeft') editor.switchTab(Math.max(0, i - 1));
      }}
      ondragstart={(e) => {
        dragFrom = i;
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('application/x-dlite-tab', String(i));
      }}
      ondragover={(e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        e.stopPropagation();
        dropAt = i;
      }}
      ondrop={(e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        e.stopPropagation();
        drop(i);
      }}
      ondragend={() => (dragFrom = dropAt = null)}
    >
      <span class="name">{t.name}</span>
      <button
        class="close"
        class:dirty={t.dirty}
        aria-label={t.dirty ? `Close ${t.name} (unsaved changes)` : `Close ${t.name}`}
        title={t.dirty ? 'Unsaved changes · Close (Ctrl+W)' : 'Close (Ctrl+W)'}
        onclick={(e) => {
          e.stopPropagation();
          closeTabRequest(i);
        }}
      >
        <span class="dot"></span>
        <Icon name="close" />
      </button>
    </div>
  {/each}
  <button class="icon-btn small new tooltip below" data-tip="New drawing (Ctrl+N)" aria-label="New drawing" onclick={newDocumentRequest}>
    <Icon name="add" />
  </button>
</div>

<style>
  .tabs {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 44px;
    padding: 6px 8px 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    border-bottom: 1px solid var(--outline-variant);
    flex: none;
  }
  .tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 38px;
    min-width: 96px;
    max-width: 220px;
    padding: 0 6px 0 14px;
    border-radius: var(--radius-m) var(--radius-m) 0 0;
    color: var(--on-surface-variant);
    cursor: pointer;
    outline: none;
    flex: none;
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
  }
  .tab:hover {
    background: color-mix(in srgb, var(--on-surface) 5%, transparent);
  }
  .tab:focus-visible {
    box-shadow: inset 0 0 0 2px var(--primary);
  }
  .tab.active {
    background: var(--primary-container);
    color: var(--on-primary-container);
    font-weight: 500;
  }
  /* The active tab's underline, Google-style. */
  .tab.active::after {
    content: '';
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 0;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: var(--primary);
  }
  .tab.drop-before {
    box-shadow: inset 2px 0 0 var(--primary);
  }
  .tab.drop-after {
    box-shadow: inset -2px 0 0 var(--primary);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .close {
    position: relative;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    color: inherit;
  }
  .close :global(.icon) {
    font-size: 16px;
    opacity: 0;
    transition: opacity var(--dur) var(--ease);
  }
  .tab:hover .close :global(.icon),
  .tab.active .close :global(.icon) {
    opacity: 0.8;
  }
  .close:hover {
    background: color-mix(in srgb, var(--on-surface) 10%, transparent);
  }
  /* Unsaved: show a dot; it turns into the × on hover. */
  .dot {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--primary);
    display: none;
  }
  .tab .close.dirty .dot {
    display: block;
  }
  .tab .close.dirty :global(.icon) {
    opacity: 0;
  }
  .tab .close.dirty:hover .dot {
    display: none;
  }
  .tab .close.dirty:hover :global(.icon) {
    opacity: 0.8;
  }
  .new {
    align-self: center;
    margin-left: 4px;
    flex: none;
  }
</style>
