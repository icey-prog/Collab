<script lang="ts">
  import { networkMode, isOnline } from '$lib/stores/network';
</script>

<div class="network-badge" class:offline={!$isOnline} class:lan={$networkMode === 'lan'} class:cloud={$networkMode === 'cloud' && $isOnline}>
  {#if !$isOnline}
    <span class="dot offline"></span> Hors-ligne
  {:else if $networkMode === 'lan'}
    <span class="dot lan"></span> Local LAN
  {:else}
    <span class="dot cloud"></span> Cloud Sync
  {/if}
</div>

<style>
  .network-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 8px; border-radius: var(--r-pill);
    font-family: var(--font-mono); font-size: 10px; font-weight: 600;
    letter-spacing: 0.05em; text-transform: uppercase;
    transition: background 0.2s, color 0.2s;
  }
  .network-badge.cloud {
    background: var(--navy-06); color: var(--navy-60);
  }
  .network-badge.lan {
    background: var(--chartreuse); color: var(--accent-ink);
  }
  .network-badge.offline {
    background: var(--error); color: var(--accent-ink);
  }
  
  .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .dot.cloud { background: var(--chartreuse); }
  .dot.lan { background: var(--accent-ink); }
  .dot.offline { background: #B05656; }
</style>
