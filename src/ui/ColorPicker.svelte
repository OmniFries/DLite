<script lang="ts">
  import { hexToRgb, rgbToHex } from '../engine/util';
  import { editor, pushRecent, settings, ui } from './state.svelte';

  // HSV is the source of truth while dragging so hue doesn't jump at grey/black.
  let h = $state(0), s = $state(0), v = $state(0);
  let hexInput = $state(settings.color);
  let lastHex = '';

  function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let hh = 0;
    if (d) {
      if (max === r) hh = ((g - b) / d) % 6;
      else if (max === g) hh = (b - r) / d + 2;
      else hh = (r - g) / d + 4;
      hh *= 60;
      if (hh < 0) hh += 360;
    }
    return [hh, max ? d / max : 0, max];
  }
  function hsvToHex(hh: number, ss: number, vv: number) {
    const f = (n: number) => {
      const k = (n + hh / 60) % 6;
      return (vv - vv * ss * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
    };
    return rgbToHex(f(5), f(3), f(1));
  }

  // Sync from outside (eyedropper, swatches).
  $effect(() => {
    const c = settings.color;
    if (c.toLowerCase() === lastHex.toLowerCase()) return;
    const [nh, ns, nv] = rgbToHsv(...hexToRgb(c));
    if (ns > 0 && nv > 0) h = nh;
    if (nv > 0) s = ns;
    v = nv;
    hexInput = c;
    lastHex = c;
  });

  function setHsv(nh: number, ns: number, nv: number) {
    h = nh; s = ns; v = nv;
    const hex = hsvToHex(h, s, v);
    lastHex = hex;
    hexInput = hex;
    settings.color = hex;
  }

  function drag(node: HTMLElement, onPos: (x: number, y: number) => void) {
    const handle = (e: PointerEvent) => {
      const r = node.getBoundingClientRect();
      onPos(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
    };
    const down = (e: PointerEvent) => {
      node.setPointerCapture(e.pointerId);
      handle(e);
      node.addEventListener('pointermove', handle);
    };
    const up = () => {
      node.removeEventListener('pointermove', handle);
      commit();
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    return { destroy: () => { node.removeEventListener('pointerdown', down); node.removeEventListener('pointerup', up); } };
  }

  function commit() {
    pushRecent(settings.color);
    if (ui.selectionCount) editor.recolorSelection(settings.color);
  }

  function onHex(e: Event) {
    let t = (e.currentTarget as HTMLInputElement).value.trim();
    if (!t.startsWith('#')) t = '#' + t;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) {
      const full = rgbToHex(...hexToRgb(t));
      settings.color = full;
      commit();
    } else hexInput = settings.color;
  }

  function pick(c: string) {
    settings.color = c;
    commit();
  }
</script>

<section class="picker">
  <div
    class="sv"
    style="background-color: hsl({h} 100% 50%)"
    use:drag={(x, y) => setHsv(h, x, 1 - y)}
    role="slider"
    aria-label="Saturation and brightness"
    aria-valuenow={Math.round(s * 100)}
    tabindex="-1"
  >
    <div class="knob" style="left:{s * 100}%; top:{(1 - v) * 100}%; background:{settings.color}"></div>
  </div>
  <div class="hue" use:drag={(x) => setHsv(x * 359.9, s, v)} role="slider" aria-label="Hue" aria-valuenow={Math.round(h)} tabindex="-1">
    <div class="knob" style="left:{(h / 360) * 100}%; top:50%; background:hsl({h} 100% 50%)"></div>
  </div>
  <div class="row">
    <div class="current" style="background:{settings.color}"></div>
    <input type="text" class="hex" bind:value={hexInput} onchange={onHex} onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()} spellcheck="false" aria-label="Hex color" />
  </div>
  <div class="swatches">
    {#each ui.recentColors as c (c)}
      <button class="swatch" class:on={c.toLowerCase() === settings.color.toLowerCase()} style="background:{c}" aria-label={c} title={c} onclick={() => pick(c)}></button>
    {/each}
  </div>
</section>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }
  .sv {
    position: relative;
    height: 140px;
    border-radius: var(--radius-m);
    background-image: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent);
    cursor: crosshair;
    touch-action: none;
  }
  .hue {
    position: relative;
    height: 12px;
    border-radius: 6px;
    background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
    cursor: pointer;
    touch-action: none;
  }
  .knob {
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 3px solid #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25), var(--elev-1);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .row {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .current {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    flex: none;
  }
  .hex {
    flex: 1;
    min-width: 0;
    font-family: 'Roboto Mono', ui-monospace, monospace;
    text-transform: uppercase;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }
  .swatch {
    aspect-ratio: 1;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    transition: transform var(--dur) var(--ease);
  }
  .swatch:hover {
    transform: scale(1.1);
  }
  .swatch.on {
    box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--primary);
  }
</style>
