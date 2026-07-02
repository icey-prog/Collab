<script lang="ts">
  import { goto } from '$app/navigation';
  import { isValidRoomCode } from '$lib/api/room';
  import { pushToast } from '$lib/stores/room';
  import { isOnline } from '$lib/stores/network';

  let code = '';
  let err  = '';
  let scanSupported = false;

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
    if (!$isOnline) {
      pushToast('Pas de connexion internet — impossible de rejoindre une room', 'error', 5000);
      return;
    }
    if (navigator.vibrate) navigator.vibrate(10);
    goto(`/room/${code}`);
  }

  async function scanQR() {
    if (!scanSupported) {
      pushToast('Le scan QR n\'est pas supporté sur ce navigateur', 'info', 4000);
      return;
    }
    if (!$isOnline) {
      pushToast('Pas de connexion internet — impossible de rejoindre une room', 'error', 5000);
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
