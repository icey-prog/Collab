<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { createRoom, isValidRoomCode } from '$lib/api/room';
  import { isTauri } from '$lib/tauri';
  import ChromeTR from '$lib/components/ChromeTR.svelte';
  import QRShare from '$lib/components/QRShare.svelte';
  import HotspotHint from '$lib/components/HotspotHint.svelte';
  import { getSharableBase } from '$lib/utils/lan';

  // Tauri desktop : auto-redirect vers /host (mode local-first)
  onMount(() => {
    if (isTauri()) goto('/host');
  });

  type State = 'rest' | 'loading' | 'created' | 'error';

  let state: State = 'rest';
  let roomId = '';
  let roomUrl = '';
  let joinCode = '';
  let joinError = '';
  let copyOk = false;
  let errorMsg = '';

  async function handleCreate() {
    if (state === 'loading') return;
    // Haptic feedback mobile — Lot I (Touch Psy §6 confirmation tap)
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    state = 'loading';
    errorMsg = '';
    try {
      const res = await createRoom();
      roomId = res.roomId;
      const base = await getSharableBase();
      roomUrl = `${base}/room/${roomId}`;
      if (navigator.vibrate) navigator.vibrate([20, 30, 20]);  // success pattern
      state = 'created';
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Erreur réseau';
      state = 'error';
      setTimeout(() => (state = 'rest'), 2500);
    }
  }

  function handleJoinInput(e: Event) {
    const t = e.target as HTMLInputElement;
    joinCode = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    joinError = '';
  }

  function handleJoin() {
    if (!isValidRoomCode(joinCode)) {
      joinError = 'Code invalide (6 caractères)';
      return;
    }
    goto(`/room/${joinCode}`);
  }

  async function copyLink() {
    if (!roomId) return;
    const url = `${window.location.origin}/room/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      copyOk = true;
      setTimeout(() => (copyOk = false), 1800);
    } catch {}
  }

  function enterRoom() {
    if (roomId) goto(`/room/${roomId}`);
  }
</script>

<svelte:head>
  <title>Collab — Une room. Un instant. Disparu après.</title>
</svelte:head>

<div class="page noise" data-state={state}>

  <ChromeTR />

  <main id="main-content" class="viewport">
    <div class="col">
      <div class="hero-eyebrow eyebrow">EXXOLAB — Collaboration éphémère</div>
      <h1 class="hero">
        Une room.<br>
        Un instant.<br>
        <span class="hl">Disparu après.</span>
      </h1>
      <div class="hero-sub">Anonyme. Temps réel. Sans compte.</div>

      <div class="action">

        {#if state !== 'created'}
          <button
            class="btn btn-cta cta"
            id="cta"
            class:loading={state === 'loading'}
            on:click={handleCreate}
            disabled={state === 'loading'}
          >
            {#if state === 'loading'}
              <span class="spinner"></span>
              <span>Génération du code…</span>
            {:else if state === 'error'}
              <span>⚠ {errorMsg}</span>
            {:else}
              <span>Créer une room</span>
              <svg class="arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h9M9 4.5L12.5 8 9 11.5"
                      stroke="currentColor" stroke-width="1.7"
                      stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {/if}
          </button>

          <p class="cta-hint">ou rejoindre une room existante</p>

          <div class="join">
            <input
              class="field"
              class:error={joinError}
              type="text"
              placeholder="XXXXXX"
              maxlength="6"
              value={joinCode}
              on:input={handleJoinInput}
              aria-label="Code room"
            />
            <button class="btn btn-ghost" on:click={handleJoin}>Rejoindre</button>
          </div>
          {#if joinError}<p class="join-err">{joinError}</p>{/if}

        {:else}
          <div class="room-card card" role="status" aria-live="polite">
            <div class="rc-label">Room créée</div>
            <div class="rc-code">{roomId}</div>
            <div class="rc-meta">Expire dans 4h · 0 participant</div>
            <div class="rc-actions">
              <button class="btn btn-ghost" on:click={copyLink}>
                {copyOk ? '✓ Lien copié' : 'Copier le lien'}
              </button>
              <button class="btn btn-cta" style="box-shadow:none;padding:12px;" on:click={enterRoom}>Ouvrir la room</button>
            </div>
          </div>

          <div class="qr-card card" aria-label="QR code — inviter d'autres participants">
            <div class="qr-card-label mono">Scannez pour rejoindre</div>
            <QRShare url={roomUrl} size={160} />
          </div>

          <HotspotHint />
        {/if}

      </div>

      <div class="badges">
        <span class="b">Anonyme</span><span class="sepdot">·</span>
        <span class="b">4h TTL</span><span class="sepdot">·</span>
        <span class="b">4 max</span><span class="sepdot">·</span>
        <span class="b">Zéro compte</span>
      </div>
    </div>

    <div class="brand">
      <span class="word">Collab<span class="acc"></span></span>
      <div class="ver">v1.0 · MVP</div>
    </div>

    <div class="foot mono">EXXOLAB · Ouagadougou · 2026</div>
  </main>
</div>

<style>
  .page { min-height: 100%; background: var(--paper); position: relative; }

  .viewport {
    min-height: 100%;
    display: flex; align-items: center; justify-content: center;
    padding: 40px 20px;
    position: relative;
  }

  .col {
    width: 380px; max-width: 100%;
    display: flex; flex-direction: column;
  }

  /* Brand */
  .brand { position: absolute; top: 44px; left: 56px; }
  .brand .word {
    font-family: var(--font-head); font-weight: 700; font-size: 22px;
    color: var(--navy); display: inline-flex; align-items: baseline; gap: 3px;
  }
  .brand .word .acc {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--chartreuse); display: inline-block;
  }
  .brand .ver {
    font-family: var(--font-mono); font-size: 11px;
    color: var(--navy-40); margin-top: 5px;
  }

  /* Hero */
  .hero-eyebrow { margin-bottom: 26px; }
  .hero {
    font-family: var(--font-head); font-weight: 700;
    font-size: clamp(48px, 9vw, 68px); line-height: 1.0;
    letter-spacing: -0.02em; color: var(--navy); margin: 0;
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
    font-size: 15px; color: var(--navy-55); margin-top: 20px; font-weight: 400;
  }

  /* Action zone */
  .action { margin-top: 38px; }
  .cta {
    min-width: 230px;
  }
  .cta.loading { pointer-events: none; opacity: 0.92; }
  .spinner {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2.5px solid rgba(54,76,132,0.25);
    border-top-color: var(--navy);
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .cta-hint {
    font-size: 13px; color: var(--navy-40);
    margin-top: 16px; margin-bottom: 12px;
  }

  .join {
    display: flex; gap: 10px; width: 100%; max-width: 380px;
  }
  .join .field {
    flex: 1; text-align: left; font-size: 16px; border-radius: var(--r-md);
  }
  .join .field.error { border-color: var(--error); border-style: solid; }
  .join .btn-ghost {
    white-space: nowrap; border-radius: var(--r-md); padding: 0 22px;
  }
  .join-err {
    color: #B05656; font-size: 12px; margin: 8px 0 0;
  }

  /* Badges */
  .badges {
    margin-top: 44px; display: flex; align-items: center;
    gap: 4px; flex-wrap: wrap;
  }
  .badges .b {
    font-size: 12px; color: var(--navy-60);
    background: var(--navy-08); padding: 6px 14px;
    border-radius: var(--r-pill); font-weight: 500;
  }
  .badges .sepdot { color: var(--navy-25); padding: 0 4px; }

  /* Footer */
  .foot {
    position: absolute; bottom: 28px; left: 50%;
    transform: translateX(-50%);
    font-family: var(--font-mono); font-size: 11px;
    color: var(--navy-40);
  }

  /* Room created card */
  .room-card {
    margin-top: 26px;
    padding: 26px; max-width: 380px;
    animation: slideUp .45s cubic-bezier(.2,.8,.3,1) both;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .rc-label {
    font-size: 11px; letter-spacing: 0.15em;
    text-transform: uppercase; color: var(--navy-50); font-weight: 500;
  }
  .rc-code {
    font-family: var(--font-mono); font-weight: 500;
    font-size: 34px; color: var(--navy);
    letter-spacing: 0.12em; margin: 8px 0 4px;
  }
  .rc-meta {
    font-family: var(--font-mono); font-size: 12px;
    color: var(--navy-50); margin-bottom: 18px;
  }
  .rc-actions { display: flex; gap: 10px; }
  .rc-actions .btn { flex: 1; padding: 12px; font-size: 14px; min-height: 44px; }

  /* QR card */
  .qr-card {
    margin-top: 14px; padding: 20px;
    max-width: 380px;
    animation: slideUp .5s cubic-bezier(.2,.8,.3,1) .1s both;
  }
  .qr-card-label {
    font-family: var(--font-mono); font-size: 11px;
    color: var(--navy-50); text-align: center;
    letter-spacing: 0.08em; text-transform: uppercase;
    margin-bottom: 14px;
  }

  /* Responsive */
  @media (max-width: 600px) {
    .brand { top: 24px; left: 24px; }
    .hero { font-size: 42px; }
    .join { flex-direction: column; }
    .rc-actions { flex-direction: column; }
    .foot { position: static; transform: none; text-align: center; margin-top: 40px; }
  }
</style>
