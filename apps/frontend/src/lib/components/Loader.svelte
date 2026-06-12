<script lang="ts">
  /** Loader animé réutilisable — fruit_loop.gif */
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let label = '';
  export let inline = false;

  const px = { sm: 24, md: 48, lg: 96 }[size];
</script>

<div class="loader" class:inline>
  <img
    src="/animations/fruit_loop.gif"
    alt=""
    width={px}
    class="loader-gif"
    loading="lazy"
  />
  {#if label}<span class="loader-label">{label}</span>{/if}
</div>

<style>
  .loader {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 20px;
  }
  .loader.inline {
    flex-direction: row;
    gap: 10px;
  }
  .loader-gif {
    /* width is set via attribute; height auto preserves native aspect ratio */
    height: auto;
    object-fit: contain;
    mix-blend-mode: multiply;
    flex-shrink: 0;
  }
  :global(body.theme-dark) .loader-gif {
    mix-blend-mode: normal;
  }
  .loader-label {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--navy-55);
    letter-spacing: 0.04em;
  }
</style>
