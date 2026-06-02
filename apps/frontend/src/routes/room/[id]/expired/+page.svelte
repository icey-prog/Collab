<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createRoom } from '$lib/api/room';
  import ChromeTR from '$lib/components/ChromeTR.svelte';

  $: roomId = ($page.params.id ?? '').toUpperCase();

  let creating = false;
  let err = '';

  async function newRoom() {
    creating = true; err = '';
    try {
      const res = await createRoom();
      goto(`/room/${res.roomId}`);
    } catch (e) {
      err = e instanceof Error ? e.message : 'Erreur réseau';
      creating = false;
    }
  }
</script>

<svelte:head><title>Room expirée — Collab</title></svelte:head>

<div class="page noise">
  <ChromeTR />
  <a href="/" class="spec-home"><span class="acc"></span> Collab</a>

  <main class="viewport">
    <div class="col">
      <span class="eyebrow">Room introuvable</span>

      <h1 class="hero">
        <span class="hl mono">{roomId}</span><br>
        n'existe plus.
      </h1>

      <p class="hero-sub">
        Cette room a expiré (4h d'inactivité) ou a été close par son administrateur.
        Toutes les données ont été supprimées — comme prévu.
      </p>

      <div class="actions">
        <button class="btn btn-cta" on:click={newRoom} disabled={creating}>
          {#if creating}
            <span class="spinner"></span> Création…
          {:else}
            Créer une nouvelle room
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h9M9 4.5L12.5 8 9 11.5" stroke="currentColor"
                    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {/if}
        </button>
        <a class="btn btn-ghost" href="/">Retour accueil</a>
      </div>

      {#if err}<p class="err">⚠ {err}</p>{/if}

      <div class="callout">
        <strong>L'éphémère par design.</strong>
        Pas de backup, pas de récupération — c'est ce qui rend Collab utile pour
        les sessions courtes où aucune trace n'est désirée.
      </div>
    </div>
  </main>

  <div class="foot mono">EXXOLAB · Ouagadougou · 2026</div>
</div>

<style>
  .page { min-height: 100vh; background: var(--paper); position: relative; }
  .viewport { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 40px 20px; }
  .col { width: 520px; max-width: 100%; }

  .hero {
    font-family: var(--font-head); font-weight: 700;
    font-size: clamp(40px, 7vw, 56px); line-height: 1.05;
    letter-spacing: -0.02em; color: var(--navy); margin: 26px 0 0;
  }
  .hero .hl {
    position: relative; color: var(--accent-ink);
    font-family: var(--font-mono); letter-spacing: 0.08em;
  }
  .hero .hl::before {
    content: ""; position: absolute; left: -6px; right: -6px;
    top: 8%; bottom: 8%; background: var(--chartreuse);
    border-radius: 6px; z-index: -1; transform: rotate(-0.6deg);
  }

  .hero-sub {
    font-size: 15px; color: var(--navy-55);
    margin: 22px 0 32px; line-height: 1.65;
  }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; }
  .actions .btn { min-height: 48px; }

  .err { color: #B05656; font-size: 13px; margin: 16px 0 0; }

  .callout {
    margin-top: 36px; padding: 16px 18px;
    background: var(--navy-04); border-left: 3px solid var(--chartreuse);
    border-radius: var(--r-sm);
    font-size: 13.5px; color: var(--navy-70); line-height: 1.6;
  }
  .callout strong { color: var(--navy); font-weight: 600; }

  .spinner {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2.2px solid rgba(0,0,0,0.18); border-top-color: currentColor;
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .foot {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    font-family: var(--font-mono); font-size: 11px; color: var(--navy-40);
  }
</style>
