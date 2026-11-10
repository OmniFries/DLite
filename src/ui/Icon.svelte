<script lang="ts">
  import { icons } from './icons';
  let { name, filled = false }: { name: string; filled?: boolean } = $props();
  let svg = $derived((filled && icons[name + '-fill']) || icons[name] || '');
</script>

<span class="icon" aria-hidden="true">{@html svg}</span>
