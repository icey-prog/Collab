<script lang="ts">
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';
  import { createRoom } from '$lib/api/room';
  import { getLocalIp, startBackend, isTauri } from '$lib/tauri';
  import { pushToast } from '$lib/stores/room';
  import { getSharableBase } from '$lib/utils/lan';

  type State = 'idle' | 'starting' | 'ready' | 'error';

  let state: State = 'idle';
  let roomId      = '';
  let localIp     = '';
  let port        = 3001;
  let qrSvg       = '';
  let copyOk      = false;
  let sharableBase = '';

  $: roomUrl = roomId && sharableBase ? `${sharableBase}/room/${roomId}` : '';

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
    if (state === 'starting') return;
    state = 'starting';
    try {
      // Si Tauri, démarrer le backend local et récupérer l'IP via Rust invoke
      if (isTauri()) {
        const ok = await startBackend();
        if (ok === false) {
          pushToast('Impossible de démarrer le backend Docker — installé ?', 'info', 5000);
          state = 'error';
          return;
        }
        const ip = await getLocalIp();
        if (ip) {
          localIp = ip;
          sharableBase = `http://${ip}:${port}`;
        }
      }

      // Résoudre IP LAN si encore inconnue (mode browser non-Tauri)
      if (!sharableBase) sharableBase = await getSharableBase();

      const res = await createRoom();
      roomId = res.roomId;
      state  = 'ready';
      await renderQR();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Erreur création room', 'info', 4000);
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
    // Auto-start hosting if user landed here intending to host
    hostRoom();
  });
</script>

<div class="host-panel">
  {#if state === 'starting'}
    <div class="loading">
      <span class="spinner"></span>
      <p>Préparation de la room…</p>
      {#if isTauri()}<p class="sub">Démarrage du backend local Docker</p>{/if}
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

        {#if isTauri() && localIp}
          <div class="lan-tag">LAN · {localIp}:{port}</div>
        {/if}

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
      <p>Échec du démarrage.</p>
      <button class="btn btn-ghost" on:click={hostRoom}>Réessayer</button>
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
  .loading .sub { font-size: 12px; color: var(--navy-40); margin-top: -4px; }
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
    margin-bottom: 12px;
  }
  .url {
    flex: 1; font-family: var(--font-mono); font-size: 12px;
    color: var(--navy-70); background: var(--navy-04);
    padding: 10px 12px; border-radius: var(--r-sm);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    min-width: 0;
  }
  .copy { padding: 0 16px; font-size: 13px; min-height: 40px; }
  .lan-tag {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--font-mono); font-size: 11px;
    background: var(--chartreuse); color: var(--accent-ink);
    padding: 4px 10px; border-radius: var(--r-pill);
    margin-bottom: 14px;
  }
  .open { width: 100%; padding: 14px; }

  .error {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 14px;
    color: var(--navy-60);
  }
</style>
