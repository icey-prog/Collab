<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getRoomPreview, isValidRoomCode, type RoomPreview } from '$lib/api/room';
  import ChromeTR from '$lib/components/ChromeTR.svelte';

  $: roomId = ($page.params.id ?? '').toUpperCase();

  let loading = true;
  let preview: RoomPreview | null = null;
  let error = '';

  onMount(async () => {
    if (!isValidRoomCode(roomId)) {
      error = 'Code invalide';
      loading = false;
      return;
    }
    try {
      preview = await getRoomPreview(roomId);
      if (!preview.exists) {
        // redirect to expired page — preserves the id so user can act
        goto(`/room/${roomId}/expired`);
        return;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Erreur réseau';
    } finally {
      loading = false;
    }
  });

  function enter() { goto(`/room/${roomId}`); }
  function copy() {
    navigator.clipboard?.writeText(`${location.origin}/join/${roomId}`);
  }

  function fmt(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${String(m).padStart(2,'0')}` : `${m} min`;
  }
</script>

<svelte:head><title>Rejoindre {roomId} — Collab</title></svelte:head>

<div class="page noise">
  <ChromeTR />
  <a href="/" class="spec-home"><span class="acc"></span> Collab</a>

  <main class="viewport">
    <div class="col">
      <span class="eyebrow">Rejoindre une room</span>

      <div class="card preview-card">
        {#if loading}
          <div class="row center">
            <div class="spinner"></div>
            <span class="muted">Vérification du code…</span>
          </div>
        {:else if error}
          <div class="rc-label">Erreur</div>
          <div class="rc-msg">{error}</div>
          <button class="btn btn-cta full" on:click={() => goto('/')}>Retour</button>
        {:else if preview}
          <div class="rc-label">Room ouverte</div>
          <div class="rc-code">{roomId}</div>

          <div class="meta-grid">
            <div class="meta">
              <div class="meta-k">Participants</div>
              <div class="meta-v">
                {preview.participants} / 4
                {#if preview.full}<span class="pill pill-error">complète</span>{/if}
              </div>
            </div>
            <div class="meta">
              <div class="meta-k">Expire dans</div>
              <div class="meta-v mono">{fmt(preview.expiresInSec)}</div>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn-ghost" on:click={copy}>Copier le lien</button>
            <button class="btn btn-cta" on:click={enter} disabled={preview.full}>
              {preview.full ? 'Room pleine' : 'Entrer'}
              {#if !preview.full}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h9M9 4.5L12.5 8 9 11.5" stroke="currentColor"
                        stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {/if}
            </button>
          </div>

          <p class="hint">Anonyme · sans compte · aucune donnée conservée après 4h.</p>
        {/if}
      </div>
    </div>
  </main>

  <div class="foot mono">EXXOLAB · Ouagadougou · 2026</div>
</div>

<style>
  .page { min-height: 100vh; background: var(--paper); position: relative; }
  .viewport { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 40px 20px; }
  .col { width: 460px; max-width: 100%; }

  .preview-card { padding: 32px; margin-top: 26px; }
  .row.center { display: flex; align-items: center; gap: 12px; }
  .muted { color: var(--navy-50); font-size: 14px; }

  .rc-label {
    font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase;
    color: var(--navy-50); font-weight: 500; margin-bottom: 4px;
  }
  .rc-code {
    font-family: var(--font-mono); font-weight: 500;
    font-size: 38px; color: var(--navy);
    letter-spacing: 0.12em; margin: 6px 0 20px;
  }
  .rc-msg { color: var(--navy); font-size: 15px; margin: 8px 0 20px; }

  .meta-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    padding: 16px 0; border-top: 1px solid var(--navy-08);
    border-bottom: 1px solid var(--navy-08); margin-bottom: 24px;
  }
  .meta-k { font-size: 11px; color: var(--navy-50); margin-bottom: 4px;
           letter-spacing: 0.08em; text-transform: uppercase; font-weight: 500; }
  .meta-v { font-size: 16px; color: var(--navy); font-weight: 600;
            display: flex; align-items: center; gap: 8px; }
  .meta-v.mono { font-family: var(--font-mono); }

  .actions { display: flex; gap: 10px; }
  .actions .btn { flex: 1; }
  .btn.full { width: 100%; }

  .hint { font-size: 12px; color: var(--navy-40); margin: 16px 0 0; text-align: center; }

  .spinner {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2.5px solid rgba(0,0,0,0.12); border-top-color: var(--navy);
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .foot {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    font-family: var(--font-mono); font-size: 11px; color: var(--navy-40);
  }
</style>
