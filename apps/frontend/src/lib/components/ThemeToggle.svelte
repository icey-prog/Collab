<script lang="ts">
  import { mode, toggleMode } from '$lib/stores/theme';
</script>

<button
  class="theme-toggle theme-ctl"
  on:click={toggleMode}
  title="Basculer clair / sombre"
  aria-label="Basculer le thème"
>
  {#if $mode === 'dark'}
    <span class="ti">
      <svg viewBox="0 0 16 16" fill="none">
        <path d="M13 9.6A5.6 5.6 0 0 1 6.4 3 5.6 5.6 0 1 0 13 9.6z"
              stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>
    </span>
    Sombre
  {:else}
    <span class="ti">
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3.1" stroke="currentColor" stroke-width="1.4"/>
        <path d="M8 1.4v1.7M8 12.9v1.7M1.4 8h1.7M12.9 8h1.7M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M12.7 3.3l-1.2 1.2M4.5 11.5l-1.2 1.2"
              stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </span>
    Clair
  {/if}
</button>

<style>
  .ti { width: 16px; height: 16px; display: inline-flex; }
</style>
