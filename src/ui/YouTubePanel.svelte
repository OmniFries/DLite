<script lang="ts">
  import Icon from './Icon.svelte';
  import { editor } from './state.svelte';
  import { embedUrl, parseYouTube } from './youtube';

  const KEY = 'dlite.youtube';

  // Remember the last video and whether the panel is open (this browser only).
  function load(): { src: string; open: boolean } {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      return { src: typeof v.src === 'string' && v.src.startsWith('https://www.youtube-nocookie.com/embed/') ? v.src : '', open: v.open !== false };
    } catch {
      return { src: '', open: true };
    }
  }
  const saved = load();
  let src = $state(saved.src);
  let open = $state(saved.open);
  let link = $state('');

  $effect(() => {
    const value = JSON.stringify({ src, open });
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* storage unavailable: nothing to remember */
    }
  });

  function play() {
    const ref = parseYouTube(link);
    if (!ref) {
      editor.toast("That doesn't look like a YouTube link");
      return;
    }
    src = embedUrl(ref);
    link = '';
    open = true;
  }
</script>

<section class="yt" class:open>
  <header>
    <button class="title" aria-expanded={open} onclick={() => (open = !open)}>
      <span class="logo"><Icon name="smart_display" filled /></span>
      <h2>YouTube</h2>
      <Icon name={open ? 'keyboard_arrow_down' : 'keyboard_arrow_up'} />
    </button>
    {#if src}
      <button class="icon-btn small tooltip below" data-tip="Remove video" aria-label="Remove video" onclick={() => (src = '')}>
        <Icon name="close" />
      </button>
    {/if}
  </header>

  {#if open}
    <form
      class="link"
      onsubmit={(e) => {
        e.preventDefault();
        play();
      }}
    >
      <input
        type="text"
        bind:value={link}
        placeholder="Paste a YouTube link"
        aria-label="YouTube link"
        spellcheck="false"
        onkeydown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur();
        }}
        onpaste={(e) => {
          // Play straight away when a link is pasted.
          const text = e.clipboardData?.getData('text') ?? '';
          if (parseYouTube(text)) {
            e.preventDefault();
            link = text;
            play();
          }
        }}
      />
      <button class="icon-btn small" type="submit" aria-label="Play" disabled={!link.trim()}>
        <Icon name="play_circle" />
      </button>
    </form>
    <div class="player">
      {#if src}
        {#key src}
          <iframe
            {src}
            title="YouTube video"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen
          ></iframe>
        {/key}
      {:else}
        <div class="empty">
          <Icon name="smart_display" />
          <span>Paste a link above to watch while you draw</span>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .yt {
    flex: none;
    border-top: 1px solid var(--outline-variant);
    padding: 4px 12px 12px;
  }
  .yt:not(.open) {
    padding-bottom: 4px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 8px 0 4px;
    border-radius: var(--radius-full);
    color: var(--on-surface-variant);
  }
  .title:hover {
    background: color-mix(in srgb, var(--on-surface) 6%, transparent);
  }
  .logo {
    color: #ff0033;
    display: grid;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--on-surface);
  }
  .link {
    display: flex;
    gap: 4px;
    align-items: center;
    margin: 4px 0 8px;
  }
  .link input {
    flex: 1;
    min-width: 0;
    height: 32px;
    border-radius: var(--radius-full);
    padding: 0 14px;
    font-size: 13px;
  }
  .link .icon-btn {
    color: var(--primary);
  }
  .player {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: var(--radius-m);
    overflow: hidden;
    background: var(--surface-container);
  }
  iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 24px;
    text-align: center;
    color: var(--on-surface-variant);
    font-size: 12px;
  }
  .empty :global(.icon) {
    font-size: 28px;
    opacity: 0.6;
  }
</style>
