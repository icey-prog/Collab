<script lang="ts">
  import HostPanel  from '$lib/components/HostPanel.svelte';
  import JoinPanel  from '$lib/components/JoinPanel.svelte';
  import ChromeTR   from '$lib/components/ChromeTR.svelte';
  import ToastStack from '$lib/components/ToastStack.svelte';
  import { isTauri } from '$lib/tauri';

  type Tab = 'host' | 'join';
  let tab: Tab = 'host';

  // On non-Tauri (mobile PWA / browser), default to join — only desktop can host
  if (typeof window !== 'undefined' && !isTauri()) {
    tab = 'join';
  }
</script>

<svelte:head><title>Collab — Héberger ou rejoindre</title></svelte:head>

<div class="page noise">
  <ChromeTR />
  <a href="/" class="spec-home"><span class="acc"></span> Collab</a>

  <main id="main-content" class="viewport">
    <div class="col">
      <div class="eyebrow">EXXOLAB — Mode local</div>
      <h1 class="hero">
        Une room.<br>
        <span class="hl">Ici, maintenant.</span>
      </h1>
      <p class="sub">
        {#if isTauri()}
          Hébergez sur votre machine ou rejoignez une room existante.
        {:else}
          Rejoignez une room en cours sur ce réseau.
        {/if}
      </p>

      <!-- Tab toggle -->
      <div class="tabs" role="tablist">
        <button
          class="tab" class:active={tab === 'host'}
          role="tab" aria-selected={tab === 'host'}
          on:click={() => (tab = 'host')}
        >Héberger</button>
        <button
          class="tab" class:active={tab === 'join'}
          role="tab" aria-selected={tab === 'join'}
          on:click={() => (tab = 'join')}
        >Rejoindre</button>
      </div>

      <!-- Active panel -->
      <div class="panel">
        {#if tab === 'host'}
          <HostPanel />
        {:else}
          <JoinPanel />
        {/if}
      </div>
    </div>

    <div class="foot mono">EXXOLAB · Ouagadougou · 2026</div>
  </main>

  <ToastStack />
</div>

<style>
  .page { min-height: 100%; background: var(--paper); position: relative; }
  .viewport {
    min-height: 100%; display: flex; align-items: center; justify-content: center;
    padding: 36px 20px 36px;
  }
  .col { width: 460px; max-width: 100%; display: flex; flex-direction: column; }

  .hero {
    font-family: var(--font-head); font-weight: 700;
    font-size: clamp(32px, 5vw, 44px); line-height: 1.05;
    letter-spacing: -0.02em; color: var(--navy); margin: 12px 0 0;
  }
  .hero .hl {
    color: var(--accent-ink); white-space: nowrap;
    background: var(--chartreuse); border-radius: 7px;
    padding: 2px 10px; display: inline-block;
  }
  .sub { font-size: 14px; color: var(--navy-55); margin: 14px 0 20px; }

  .tabs {
    display: inline-flex; gap: 4px;
    background: var(--navy-06); padding: 4px;
    border-radius: var(--r-pill);
    margin-bottom: 18px;
    align-self: flex-start;
  }
  .tab {
    border: none; background: transparent; cursor: pointer;
    padding: 9px 22px; font-size: 14px; font-weight: 500;
    color: var(--navy-55); border-radius: var(--r-pill);
    min-height: 44px;
    transition: background .18s ease, color .18s ease;
  }
  .tab:hover { color: var(--navy); }
  .tab.active {
    background: var(--surface-cream-strong);
    color: var(--navy); font-weight: 600;
  }
  .tab:disabled { opacity: 0.4; cursor: not-allowed; }

  .panel {
    background: var(--surface); border: 1px solid var(--navy-10);
    border-radius: var(--r-lg); padding: 22px;
    box-shadow: var(--shadow-card);
  }

  .foot {
    position: absolute; bottom: 14px; left: 50%;
    transform: translateX(-50%);
    font-family: var(--font-mono); font-size: 10px;
    color: var(--navy-40);
  }

  @media (max-width: 600px) {
    .viewport { padding: 60px 16px 40px; }
    .panel { padding: 20px; }
    .foot { position: static; transform: none; text-align: center; margin-top: 32px; }
  }
</style>
