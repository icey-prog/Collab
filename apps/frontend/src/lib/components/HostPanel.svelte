<script lang="ts">
  import { onMount, tick } from 'svelte';
  import QRCode from 'qrcode';
  import { createRoom } from '$lib/api/room';
  import { getLocalIp, startBackend, isBackendRunning, getBackendPort, isTauri, getBackendUrl, setJoinHostOverride } from '$lib/tauri';
  import { pushToast } from '$lib/stores/room';
  import { getSharableBase } from '$lib/utils/lan';

  type State = 'idle' | 'starting' | 'ready' | 'error';

  let state: State = 'idle';
  let roomId      = '';
  let localIp     = '';
  let port        = 47931;    // Port réel du sidecar (récupéré dynamiquement ci-dessous)
  let qrSvg       = '';
  let copyOk      = false;
  let sharableBase = '';

  /**
   * Attend que le sidecar soit réellement prêt à accepter des connexions.
   * Correction bug H2 (TAURI-PLAN §14.3) : le process peut être spawné mais
   * le port pas encore bound quand le front tente le premier fetch.
   *
   * Correction bug B1 : remplace AbortSignal.timeout (Chrome 103+, indispo dans
   * vieilles WebView2) par AbortController + setTimeout. Timeout porté à 3000ms
   * pour ne pas avorter une réponse en cours (sidecar init lent sous CPU saturé).
   */
  async function waitForBackendReady(maxMs = 10000, intervalMs = 300): Promise<boolean> {
    const backendUrl = await getBackendUrl();
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 3000);
      try {
        const res = await fetch(`${backendUrl}/`, { signal: ctl.signal });
        clearTimeout(timer);
        if (res.ok) return true;
      } catch { /* sidecar pas prêt ou abort — continue */ }
      clearTimeout(timer);
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return false;
  }

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

  // Bug A fix : empêche le spam-click sur "Réessayer" pendant que le backend
  // est down — sans ça chaque clic empile un toast "Failed to fetch" identique.
  let retryCooldown = false;
  const RETRY_COOLDOWN_MS = 1500;

  async function hostRoom() {
    if (state === 'starting' || retryCooldown) return;
    retryCooldown = true;
    setTimeout(() => (retryCooldown = false), RETRY_COOLDOWN_MS);
    state = 'starting';
    // Bug D fix : on héberge toujours sur SA propre machine — un override de
    // join (cross-machine) laissé par une session précédente doit être purgé.
    setJoinHostOverride(null);
    try {
      // Si Tauri, démarrer le backend sidecar local et récupérer l'IP via Rust invoke
      if (isTauri()) {
        // Correction B5 : check si déjà tournant avant invoke (idempotence,
        // évite race avec auto-start setup() Rust qui peut être en cours).
        const alreadyRunning = await isBackendRunning();
        if (!alreadyRunning) {
          const ok = await startBackend();
          // invokeSafe retourne null en cas d'erreur (jamais false) — vérifier null
          if (ok === null) {
            pushToast('Impossible de démarrer le backend local — voir les logs.', 'error', 6000);
            state = 'error';
            return;
          }
        }

        // Attendre que le sidecar soit réellement prêt (fix race condition H2 + B1)
        const ready = await waitForBackendReady();
        if (!ready) {
          pushToast('Le backend local ne répond pas après 10 secondes. Réessayer ?', 'error', 6000);
          state = 'error';
          return;
        }

        // Récupérer le port réel depuis Rust et l'IP LAN
        const backendPort = await getBackendPort();
        if (backendPort) port = backendPort;

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
      // Bug B fix : roomUrl est un `$:` réactif — attendre le flush Svelte
      // avant de lire sa valeur, sinon renderQR() lit l'ancienne valeur (vide).
      await tick();
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
      {#if isTauri()}<p class="sub">Démarrage du backend local…</p>{/if}
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
      <button class="btn btn-ghost" on:click={hostRoom} disabled={retryCooldown}>Réessayer</button>
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
