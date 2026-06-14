<script lang="ts">
  import { page } from '$app/stores';
  import ChromeTR from '$lib/components/ChromeTR.svelte';

  $: status  = $page.status;
  $: message = $page.error?.message ?? 'Une erreur est survenue';

  $: title = status === 404 ? 'Introuvable'
           : status >= 500 ? 'Erreur serveur'
           : 'Erreur';

  $: subtitle = status === 404
    ? 'La page que vous cherchez n\'existe pas — ou elle a déjà disparu (c\'est un peu notre marque de fabrique).'
    : status >= 500
    ? 'Quelque chose s\'est mal passé côté serveur. Pas de panique — ça n\'a rien à voir avec vous.'
    : message;
</script>

<svelte:head><title>{status} — Collab</title></svelte:head>

<div class="page noise">
  <ChromeTR />
  <a href="/" class="spec-home"><span class="acc"></span> Collab</a>

  <main id="main-content" class="viewport">
    <div class="col">
      <span class="eyebrow">Erreur · {status}</span>
      <h1 class="hero">
        {title}.<br>
        <span class="hl">Disparu.</span>
      </h1>
      <p class="hero-sub">{subtitle}</p>

      <div class="actions">
        <a class="btn btn-cta" href="/">
          Retour à l'accueil
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h9M9 4.5L12.5 8 9 11.5"
                  stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
        <a class="btn btn-ghost" href="/about">En savoir plus</a>
      </div>
    </div>
  </main>

  <div class="foot mono">EXXOLAB · Ouagadougou · 2026</div>
</div>

<style>
  .page { min-height: 100vh; background: var(--paper); position: relative; }
  .viewport {
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 40px 20px;
  }
  .col {
    width: 480px; max-width: 100%;
    display: flex; flex-direction: column;
  }
  .hero {
    font-family: var(--font-head); font-weight: 700;
    font-size: clamp(48px, 9vw, 64px); line-height: 1.0;
    letter-spacing: -0.02em; color: var(--navy); margin: 26px 0 0;
    isolation: isolate;
  }
  .hero .hl {
    color: var(--accent-ink); white-space: nowrap;
    background: var(--chartreuse);
    border-radius: 7px;
    padding: 2px 10px;
    display: inline-block;
  }
  .hero-sub {
    font-size: 15px; color: var(--navy-55);
    margin: 20px 0 36px; line-height: 1.6;
  }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; }
  .actions .btn { min-height: 48px; }
  .foot {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    font-family: var(--font-mono); font-size: 11px; color: var(--navy-40);
  }
</style>
