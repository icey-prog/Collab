<script lang="ts">
  import { onMount, tick } from 'svelte';
  import QRCode from 'qrcode';
  import { createRoom } from '$lib/api/room';
  import { pushToast } from '$lib/stores/room';
  import { isOnline } from '$lib/stores/network';

  type State = 'idle' | 'starting' | 'ready' | 'error';

  let state: State = 'idle';
  let roomId      = '';
  let qrSvg       = '';
  let copyOk      = false;
  let retryCooldown = false;
  const RETRY_COOLDOWN_MS = 1500;

  // Lien de partage = URL du FRONTEND (où on ouvre la room dans un navigateur),
  // jamais VITE_API_URL (le backend) — voir lib/utils/lan.ts.
  function getPublicBase(): string {
    if (typeof window === 'undefined') return '';
    return import.meta.env.VITE_PUBLIC_URL || window.location.origin;
  }

  $: roomUrl = roomId ? `${getPublicBase()}/room/${roomId}` : '';

  async function renderQR() {
    if (!roomUrl) return;
    try {
      qrSvg = await QRCode.toString(roomUrl, {
        type: 'svg',
        margin: 1,
        width: 220,
        color: { dark: '#364C84', light: '#0000' },
      });
    } catch {
      qrSvg = '';
    }
  }

  async function hostRoom() {
    if (state === 'starting' || retryCooldown) return;
    if (!$isOnline) {
      pushToast('Pas de connexion internet — impossible de créer une room', 'error', 5000);
      state = 'error';
      return;
    }
    retryCooldown = true;
    setTimeout(() => (retryCooldown = false), RETRY_COOLDOWN_MS);
    state = 'starting';
    try {
      const res = await createRoom();
      roomId = res.roomId;
      state  = 'ready';
      await tick();
      await renderQR();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Erreur création room', 'error', 4000);
      state = 'error';
    }
  }

  async function copyUrl() {
    if (!roomUrl) return;
    try {
      await navigator.clipboard.writeText(roomUrl);
      copyOk = true;
      setTimeout(() => (copyOk = false), 1500);
    } catch { /* clipboard denied */ }
  }

  onMount(() => {
    hostRoom();
  });
</script>

<div class="host-panel">
  {#if state === 'starting'}
    <div class="loading">
      <span class="spinner"></span>
      <p>Préparation de la room…</p>
    </div>
  {:else if state === 'ready'}
    <div class="ready">
      <div class="qr-card card">
        {#if qrSvg}
          {@html qrSvg}
        {:else}
          <div class="qr-fallback">QR indisponible</div>
        {/if}
      </div>

      <div class="meta">
        <div class="label">Code room</div>
        <div class="code">{roomId}</div>
        <div class="url-row">
          <code class="url">{roomUrl}</code>
          <button class="btn btn-ghost copy" on:click={copyUrl}>
            {copyOk ? '✓ Copié' : 'Copier'}
          </button>
        </div>

        <a class="btn btn-cta open" href="/room/{roomId}">
          Rejoindre cette room
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h9M9 4.5L12.5 8 9 11.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
      </div>
    </div>
  {:else if state === 'error'}
    <div class="error">
      {#if !$isOnline}
        <p>Connexion internet requise pour créer une room.</p>
      {:else}
        <p>Échec du démarrage.</p>
      {/if}
      <button class="btn btn-ghost" on:click={hostRoom} disabled={retryCooldown || !$isOnline}>
        Réessayer
      </button>
    </div>
  {/if}
</div>

<style>
  .host-panel {
    display: flex; flex-direction: column; gap: 24px;
    min-height: 380px;
  }

  .loading {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 14px;
    color: var(--navy-60); font-size: 14px;
  }
  .spinner {
    width: 32px; height: 32px; border-radius: 50%;
    border: 3px solid var(--navy-12);
    border-top-color: var(--navy);
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .ready { display: flex; flex-direction: column; align-items: center; gap: 24px; }
  .qr-card {
    padding: 18px; background: var(--surface);
    display: flex; align-items: center; justify-content: center;
    border-radius: var(--r-lg);
  }
  .qr-card :global(svg) { display: block; width: 220px; height: 220px; }
  .qr-fallback {
    width: 220px; height: 220px; display: flex;
    align-items: center; justify-content: center;
    color: var(--navy-40); font-size: 13px;
  }

  .meta { width: 100%; max-width: 420px; }
  .label {
    font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase;
    color: var(--navy-50); font-weight: 500; margin-bottom: 4px;
  }
  .code {
    font-family: var(--font-mono); font-size: 30px; font-weight: 500;
    color: var(--navy); letter-spacing: 0.12em; margin-bottom: 14px;
  }
  .url-row {
    display: flex; gap: 8px; align-items: stretch;
    margin-bottom: 16px;
  }
  .url {
    flex: 1; font-family: var(--font-mono); font-size: 12px;
    color: var(--navy-70); background: var(--navy-04);
    padding: 10px 12px; border-radius: var(--r-sm);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    min-width: 0;
  }
  .copy { padding: 0 16px; font-size: 13px; min-height: 40px; }
  .open { width: 100%; padding: 14px; }

  .error {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 14px;
    color: var(--navy-60);
  }
</style>
