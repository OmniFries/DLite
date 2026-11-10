<script lang="ts">
  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    /** Maps the slider position to a display string. */
    format?: (v: number) => string;
    /** Use a squared curve so small values get more of the track (brush size). */
    curve?: boolean;
    width?: number;
  }
  let { label, value = $bindable(), min, max, step = 1, format = (v) => String(v), curve = false, width = 120 }: Props = $props();

  const toPos = (v: number) => (curve ? Math.sqrt((v - min) / (max - min)) : (v - min) / (max - min));
  const fromPos = (p: number) => {
    const v = curve ? min + p * p * (max - min) : min + p * (max - min);
    return Math.round(v / step) * step;
  };
  let pos = $derived(toPos(value) * 1000);
</script>

<label class="slider">
  <span class="label">{label}</span>
  <input
    type="range"
    min="0"
    max="1000"
    value={pos}
    style="width:{width}px; --fill:{pos / 10}%"
    oninput={(e) => (value = Math.min(max, Math.max(min, fromPos(+e.currentTarget.value / 1000))))}
  />
  <span class="value">{format(value)}</span>
</label>

<style>
  .slider {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .label {
    color: var(--on-surface-variant);
    font-size: 13px;
  }
  .value {
    min-width: 40px;
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }
</style>
