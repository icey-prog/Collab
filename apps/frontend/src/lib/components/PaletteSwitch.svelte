<script lang="ts">
  import { palette, setPalette, type Palette } from '$lib/stores/theme';

  /** rail = compact vertical (used in Room sidebar rail) */
  export let variant: 'inline' | 'rail' = 'inline';

  const options: { id: Palette; sw: string; label: string }[] = [
    { id: 'a', sw: '#E7F1A8', label: 'A · Chartreuse' },
    { id: 'b', sw: '#9580D4', label: 'B · Périwinkle' },
    { id: 'c', sw: '#D44D5C', label: 'C · Lobster Pink' },
    { id: 'd', sw: '#4C5856', label: 'D · Sage' }
  ];
</script>

<div class="pal-switch" class:rail={variant === 'rail'}>
  {#if variant === 'inline'}<span class="pal-lbl">Palette</span>{/if}
  {#each options as opt}
    <button
      type="button"
      class="pal-opt"
      class:on={$palette === opt.id}
      data-pal={opt.id}
      title={opt.label}
      aria-label={opt.label}
      aria-pressed={$palette === opt.id}
      on:click={() => setPalette(opt.id)}
    >
      <span class="sw" style="background:{opt.sw};"></span>
      <span>{opt.id.toUpperCase()}</span>
    </button>
  {/each}
</div>
