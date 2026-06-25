<script lang="ts">
  import { goto } from '$app/navigation';
  import { isValidRoomCode } from '$lib/api/room';
  import { pushToast } from '$lib/stores/room';
  import { isTauri, setJoinHostOverride } from '$lib/tauri';

  let code = '';
  let err  = '';
  let scanSupported = false;

  // Bug D fix : depuis l'app desktop, le code seul ne suffit pas — il faut
  // savoir SUR QUELLE MACHINE chercher la room (le sidecar local n'a pas la
  // room d'un autre PC). Champ IP optionnel, requis si l'hôte est distant.
  let hostAddr = '';

  function normalizeHostAddr(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/$/, '');
    // IP seule ou IP:port → ajoute le port sidecar par défaut si absent
    return /:\d+$/.test(trimmed) ? `http://${trimmed}` : `http://${trimmed}:47931`;
  }

  // BarcodeDetector is the modern, native, no-dep way to scan QR.
  // Falls back gracefully if browser doesn't support it.
  if (typeof window !== 'undefined') {
    scanSupported = 'BarcodeDetector' in window;
  }

  function onInput(e: Event) {
    const t = e.target as HTMLInputElement;
    code = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    err = '';
  }

  function submit() {
    if (!isValidRoomCode(code)) {
      err = 'Code invalide (6 caractères)';
      return;
    }
    if (isTauri()) {
      // Sur desktop, sans IP renseignée on ne peut viser que le sidecar local
      // (room hébergée sur CETTE machine). Avec IP → cible la machine distante.
      setJoinHostOverride(hostAddr ? normalizeHostAddr(hostAddr) : null);
    }
    if (navigator.vibrate) navigator.vibrate(10);
    goto(`/room/${code}`);
  }

  async function scanQR() {
    if (!scanSupported) {
      pushToast('Le scan QR n\'est pas supporté sur ce navigateur', 'info', 4000);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video  = document.createElement('video');
      video.srcObject = stream; await video.play();

      /* @ts-expect-error BarcodeDetector is experimental, types not yet in lib.dom */
      const detector = new BarcodeDetector({ formats: ['qr_code'] });

      const loop = async () => {
        try {
          const results = await detector.detect(video);
          if (results.length > 0) {
            const raw = results[0].rawValue as string;
            const m = raw.match(/\/room\/([A-Z0-9]{6})/i);
            if (m) {
              code = m[1].toUpperCase();
              // Bug D fix : le QR contient l'URL complète (http://<ip-hôte>:<port>/room/CODE) —
              // récupérer l'origine pour cibler la bonne machine, pas juste le code.
              try { hostAddr = new URL(raw).origin; } catch { /* QR malformé, fallback sidecar local */ }
              stream.getTracks().forEach(t => t.stop());
              submit();
              return;
            }
          }
        } catch { /* keep scanning */ }
        requestAnimationFrame(loop);
      };
      loop();
    } catch {
      pushToast('Accès caméra refusé', 'info', 4000);
    }
  }
</script>

<div class="join-panel">
  <p class="hint">Entrez le code à 6 caractères affiché par l'hôte.</p>

  <div class="form">
    <input
      class="field code-input"
      class:error={err}
      type="text"
      inputmode="text"
      autocapitalize="characters"
      placeholder="XXXXXX"
      maxlength="6"
      value={code}
      on:input={onInput}
      on:keydown={(e) => e.key === 'Enter' && submit()}
      aria-label="Code room"
    />
    <button
      class="btn btn-cta join-btn"
      on:click={submit}
      disabled={code.length < 6}
      aria-label="Rejoindre la room"
    >
      Rejoindre
    </button>
  </div>

  {#if err}<p class="err">{err}</p>{/if}

  {#if isTauri()}
    <div class="host-field">
      <label class="host-label" for="host-addr">IP de l'ordinateur hôte (laisser vide si room sur cette machine)</label>
      <input
        id="host-addr"
        class="field host-input"
        type="text"
        placeholder="192.168.1.42"
        bind:value={hostAddr}
        aria-label="IP de l'hôte"
      />
    </div>
  {/if}

  {#if scanSupported}
    <div class="or">ou</div>
    <button class="btn btn-ghost scan" on:click={scanQR}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 6V3.5A1.5 1.5 0 0 1 3.5 2H6M10 2h2.5A1.5 1.5 0 0 1 14 3.5V6M14 10v2.5a1.5 1.5 0 0 1-1.5 1.5H10M6 14H3.5A1.5 1.5 0 0 1 2 12.5V10"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <rect x="5" y="5" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      Scanner un QR code
    </button>
  {/if}
</div>

<style>
  .join-panel { display: flex; flex-direction: column; gap: 14px; }
  .hint { font-size: 13px; color: var(--navy-60); margin: 0 0 4px; }

  .form { display: flex; gap: 10px; }
  .code-input {
    flex: 1; text-align: center; letter-spacing: 0.3em;
    font-family: var(--font-mono); font-size: 22px; font-weight: 500;
    text-transform: uppercase;
  }
  .code-input.error { border-color: var(--error); border-style: solid; }
  .join-btn { padding: 0 22px; min-height: 56px; min-width: 120px; }

  .err { color: #B05656; font-size: 12px; margin: 0; }

  .host-field { display: flex; flex-direction: column; gap: 6px; }
  .host-label { font-size: 12px; color: var(--navy-55); }
  .host-input { font-family: var(--font-mono); font-size: 13px; }

  .or {
    text-align: center; font-size: 11px; color: var(--navy-40);
    letter-spacing: 0.15em; text-transform: uppercase;
    margin: 4px 0;
  }
  .scan {
    width: 100%; padding: 14px;
    display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  }
</style>
