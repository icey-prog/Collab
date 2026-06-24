<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto }    from '$app/navigation';
  import { page }    from '$app/stores';
  import * as Y from 'yjs';

  import { initSocket, getSocket, disconnectSocket } from '$lib/socket';
  import { createRoomDoc, type YDocBundle } from '$lib/yjs';
  import { isValidRoomCode } from '$lib/api/room';

  import {
    activeModule, participants, isAdmin, status,
    expiresInSec, expiresLabel, pushToast
  } from '$lib/stores/room';
  import { registerOutboxFlush } from '$lib/stores/network';
  import { outboxFlush, outboxCount } from '$lib/offline/outbox';
  import { questions, type Question } from '$lib/stores/qa';
  import { files,     type RoomFile } from '$lib/stores/files';

  import Sidebar      from '$lib/components/Sidebar.svelte';
  import NotesModule  from '$lib/components/NotesModule.svelte';
  import FilesModule  from '$lib/components/FilesModule.svelte';
  import QAModule     from '$lib/components/QAModule.svelte';
  import ToastStack   from '$lib/components/ToastStack.svelte';
  import Loader       from '$lib/components/Loader.svelte';
  import QRShare      from '$lib/components/QRShare.svelte';
  import { getSharableBase } from '$lib/utils/lan';

  $: roomId = $page.params.id?.toUpperCase() ?? '';

  let yBundle: YDocBundle | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let copied = false;
  let showShare = false;
  // Initialise synchroniquement avec window.location.origin pour éviter race
  // au premier clic share avant que getSharableBase() async ne résolve l'IP LAN.
  let joinUrl = typeof window !== 'undefined' && roomId
    ? `${window.location.origin}/room/${roomId}`
    : '';

  function clickOutside(node: HTMLElement, callback: () => void) {
    const onClick = (e: MouseEvent) => {
      if (!node.contains(e.target as Node)) callback();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') callback();
    };
    document.addEventListener('mousedown', onClick, true);
    document.addEventListener('keydown', onKey);
    return {
      destroy() {
        document.removeEventListener('mousedown', onClick, true);
        document.removeEventListener('keydown', onKey);
      }
    };
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(roomId); copied = true; setTimeout(()=>copied=false, 1500); } catch {}
  }

  /* ─────────────────────────────────────────────────────
   *  Socket wiring
   * ───────────────────────────────────────────────────── */
  async function wire() {
    const s = await initSocket();

    s.on('room:joined', ({ participants: n, isAdmin: a }) => {
      participants.set(n);
      isAdmin.set(!!a);
      status.set('joined');
    });

    s.on('room:error', ({ code }) => {
      if (code === 'NOT_FOUND') {
        status.set('not_found');
        goto(`/room/${roomId}/expired`);
      }
    });

    s.on('room:full',   () => status.set('full'));
    
    // Bug #5 centralisation handler room:closed
    s.on('room:closed', () => {
      status.set('closed');
      goto(`/room/${roomId}/expired`);
    });

    s.on('participants:count', ({ count }) => participants.set(count));

    s.on('qa:updated',    (q: Question[]) => questions.set(q));
    s.on('files:updated', (f: RoomFile[]) => files.set(f));

    /* Y.js doc */
    yBundle = createRoomDoc(s, roomId);

    /* Connect + join */
    s.emit('join:room', { roomId });
  }

  function closeRoom() {
    if (!confirm('Clore définitivement cette room ?')) return;
    fetch(`/api/room/${roomId}`, { method: 'DELETE', credentials: 'include' })
      .then((r) => {
        if (r.ok) { pushToast('Room close', 'success'); goto('/'); }
        else pushToast('Échec de la fermeture', 'info', 4000);
      })
      .catch(() => pushToast('Erreur réseau', 'info', 4000));
  }

  /* ─────────────────────────────────────────────────────
   *  Lifecycle
   * ───────────────────────────────────────────────────── */
  onMount(async () => {
    if (!isValidRoomCode(roomId)) {
      pushToast('Code room invalide', 'info', 3000);
      goto('/');
      return;
    }

    // Résoudre l'URL partageable (LAN IP si localhost, sinon origin)
    const base = await getSharableBase();
    joinUrl = `${base}/room/${roomId}`;

    await wire();
    countdownTimer = setInterval(() => {
      expiresInSec.update((s) => Math.max(0, s - 1));
    }, 1000);

    // Register outbox flush — fires automatically when network comes back online
    // Fix #3 race: the lock is inside outboxFlush itself
    registerOutboxFlush(async () => {
      const n = await outboxFlush(getSocket());
      if (n > 0) pushToast(`${n} action${n > 1 ? 's' : ''} synchronisée${n > 1 ? 's' : ''} après retour réseau`, 'success');
    });

    // Flush any pending actions from previous offline session
    const pending = await outboxCount();
    if (pending > 0) {
      const flushed = await outboxFlush(getSocket());
      if (flushed > 0) pushToast(`${flushed} action${flushed > 1 ? 's' : ''} synchronisée${flushed > 1 ? 's' : ''} (session précédente)`, 'success');
    }
  });

  onDestroy(() => {
    if (countdownTimer) clearInterval(countdownTimer);
    yBundle?.destroy();
    yBundle = null;
    disconnectSocket();
    // Reset stores so re-entering a different room starts clean
    participants.set(0);
    isAdmin.set(false);
    questions.set([]);
    files.set([]);
    activeModule.set('notes');
  });

  /* Module title shown in topbar */
  $: modTitle = {
    notes: 'Bloc-notes',
    files: 'Fichiers partagés',
    qa:    'Q&A'
  }[$activeModule];
</script>

<svelte:head>
  <title>Room {roomId} — Collab</title>
</svelte:head>

<div class="room-shell" class:dim={$status !== 'joined'}>

  <Sidebar {roomId} onClose={closeRoom} />

  <main id="main-content" class="main">
    <!-- Topbar IDE-like : tab + actions -->
    <div class="topbar">
      <div class="tab-row">
        <div class="tab active">
          {#if $activeModule === 'notes'}
            <svg class="tab-ico" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 2h6L13 5.5V14H3.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
              <path d="M9 2v3.5h4M5.5 9h5M5.5 11.5h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
          {:else if $activeModule === 'files'}
            <svg class="tab-ico" viewBox="0 0 16 16" fill="none">
              <path d="M2 5A1.4 1.4 0 0 1 3.4 3.7h2.7L7.5 5.3H12.6A1.4 1.4 0 0 1 14 6.7v6A1.4 1.4 0 0 1 12.6 14H3.4A1.4 1.4 0 0 1 2 12.7z"
                    stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            </svg>
          {:else}
            <svg class="tab-ico" viewBox="0 0 16 16" fill="none">
              <path d="M8 2l1.8 3.6L14 6.1l-3 2.8.8 4.1L8 11l-3.8 2L5 8.9 2 6.1l4.2-.5z"
                    stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
            </svg>
          {/if}
          <span class="tab-label">{modTitle}</span>
        </div>
        <div class="tab-meta">
          <span class="breadcrumb">room <span class="bc-sep">/</span> <span class="bc-code">{roomId}</span></span>
        </div>
      </div>
      <div class="status">
        <div class="room-code-badge">
          <span class="code-text">{roomId}</span>
          <button class="code-copy-btn" on:click={copyCode} title={copied ? 'Copié' : 'Copier le code'}>
            {#if copied}✓{:else}
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <rect x="5.5" y="5.5" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.5"/>
                <path d="M3.5 10.5A1.5 1.5 0 0 1 2.5 9V4A1.5 1.5 0 0 1 4 2.5h5a1.5 1.5 0 0 1 1.5 1.5" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            {/if}
          </button>
        </div>

        <!-- Share / QR button -->
        <div class="share-wrap" use:clickOutside={() => (showShare = false)}>
          <button
            class="share-btn"
            class:active={showShare}
            on:click={() => (showShare = !showShare)}
            title="Inviter — QR code"
            aria-label="Inviter des participants"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="12.5" cy="3.5" r="1.8" stroke="currentColor" stroke-width="1.4"/>
              <circle cx="12.5" cy="12.5" r="1.8" stroke="currentColor" stroke-width="1.4"/>
              <circle cx="3.5" cy="8" r="1.8" stroke="currentColor" stroke-width="1.4"/>
              <path d="M5.2 7.1 10.8 4.4M5.2 8.9l5.6 2.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </button>

          {#if showShare}
            <div class="share-popover card">
              <p class="share-hint mono">Inviter dans la room</p>
              <QRShare url={joinUrl} size={150} />
            </div>
          {/if}
        </div>

        <div class="status-sep"></div>

        {#if $status === 'connecting'}
          <span class="pill pill-connecting"><span class="dot"></span>Connexion…</span>
        {:else if $status === 'joined'}
          <span class="pill pill-online"><span class="dot"></span>{$participants} en ligne</span>
        {:else if $status === 'full'}
          <span class="pill pill-error">Room pleine (4/4)</span>
        {:else if $status === 'not_found'}
          <span class="pill pill-error">Room introuvable</span>
        {:else if $status === 'closed'}
          <span class="pill pill-warn">Room fermée</span>
        {/if}
      </div>
    </div>

    <div class="module">
      {#if $status === 'connecting'}
        <div class="connect-overlay">
          <Loader size="lg" label="Établissement de la connexion…" />
        </div>
      {:else if $activeModule === 'notes' && yBundle}
        <NotesModule
          yText={yBundle.text}
          awareness={yBundle.awareness}
          authors={yBundle.authors}
        />
      {:else if $activeModule === 'files'}
        <FilesModule {roomId} />
      {:else if $activeModule === 'qa'}
        <QAModule {roomId} />
      {/if}
    </div>

    <!-- Status bar bottom — IDE style -->
    <div class="statusbar">
      <div class="sb-left">
        <span class="sb-item">
          <span class="sb-dot" class:on={$status === 'joined'}></span>
          {$status === 'joined' ? 'LAN · cloud' : 'déconnecté'}
        </span>
        <span class="sb-sep"></span>
        <span class="sb-item">UTF-8</span>
        <span class="sb-sep"></span>
        <span class="sb-item">Y.js CRDT</span>
      </div>
      <div class="sb-right">
        <span class="sb-item">{$participants}/4 participants</span>
        <span class="sb-sep"></span>
        <span class="sb-item">expire {$expiresLabel}</span>
      </div>
    </div>
  </main>

  <ToastStack />
</div>

<style>
  .room-shell {
    display: flex; height: 100%; background: var(--paper); overflow: hidden;
  }
  .room-shell.dim .main { opacity: 0.7; pointer-events: none; }

  .main {
    flex: 1; display: flex; flex-direction: column; min-width: 0;
    background: var(--paper);
  }

  /* ── Topbar IDE-like ── */
  .topbar {
    height: 48px; flex-shrink: 0; padding: 0 18px 0 0;
    display: flex; align-items: stretch; justify-content: space-between;
    border-bottom: 1px solid var(--navy-10);
    background: var(--paper);
  }
  .tab-row { display: flex; align-items: stretch; height: 100%; gap: 16px; }
  .tab {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 0 18px; height: 100%;
    background: var(--paper); color: var(--navy);
    font-size: 13.5px; font-weight: 600;
    border-right: 1px solid var(--navy-10);
    position: relative;
  }
  .tab.active::before {
    content: ''; position: absolute; left: 0; right: 0; top: 0;
    height: 2px; background: var(--chartreuse);
  }
  .tab-ico { width: 15px; height: 15px; color: var(--navy-60); }
  .tab.active .tab-ico { color: var(--navy); }
  .tab-label { letter-spacing: -0.01em; }

  .tab-meta { display: flex; align-items: center; }
  .breadcrumb {
    font-family: var(--font-mono); font-size: 12px;
    color: var(--navy-50);
  }
  .bc-sep { color: var(--navy-30); padding: 0 2px; }
  .bc-code { color: var(--navy); font-weight: 500; }

  .status { display: flex; align-items: center; }

  .room-code-badge {
    display: flex; align-items: center; gap: 8px;
    background: var(--surface); border: 1px solid var(--navy-10);
    padding: 4px 5px 4px 10px; border-radius: 8px;
  }
  .code-text {
    font-family: var(--font-mono); font-weight: 600; font-size: 14px;
    color: var(--navy); letter-spacing: 0.05em;
  }
  .code-copy-btn {
    width: 24px; height: 24px; border-radius: 6px;
    border: none; background: var(--navy-06); color: var(--navy-55);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
    font-weight: bold;
  }
  .code-copy-btn:hover { background: var(--chartreuse); color: var(--accent-ink); }

  /* Share button + popover */
  .share-wrap { position: relative; margin-left: 6px; }
  .share-btn {
    width: 28px; height: 28px; border-radius: 7px;
    border: 1px solid var(--navy-10); background: var(--surface);
    color: var(--navy-55); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background .15s, color .15s, border-color .15s;
  }
  .share-btn:hover, .share-btn.active {
    background: var(--chartreuse); color: var(--accent-ink);
    border-color: transparent;
  }
  .share-popover {
    position: absolute; top: calc(100% + 10px); right: 0;
    min-width: 240px; padding: 18px;
    z-index: 200;
    box-shadow: 0 8px 32px rgba(27,36,69,0.14), 0 2px 8px rgba(27,36,69,0.08);
    animation: popIn .2s cubic-bezier(.2,.8,.3,1) both;
  }
  @keyframes popIn {
    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .share-hint {
    font-family: var(--font-mono); font-size: 11px;
    color: var(--navy-50); text-align: center;
    letter-spacing: 0.08em; text-transform: uppercase;
    margin: 0 0 14px;
  }

  .status-sep {
    width: 1px; height: 16px; background: var(--navy-10); margin: 0 14px;
  }

  .pill-connecting {
    background: var(--navy-08); color: var(--navy-60);
  }
  .pill-connecting .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--navy-40);
    animation: blink 1.2s ease-in-out infinite;
  }
  @keyframes blink {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }

  /* ── Module area — desktop polish, padding réduit ── */
  .module {
    flex: 1; padding: 16px 20px; overflow: auto; min-height: 0;
    display: flex; flex-direction: column;
    background: var(--paper);
  }
  .connect-overlay {
    flex: 1;
    display: flex; align-items: center; justify-content: center;
  }

  /* ── Status bar bottom (IDE style) ── */
  .statusbar {
    height: 28px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 18px;
    background: var(--paper);
    border-top: 1px solid var(--navy-10);
    font-family: var(--font-mono); font-size: 11px;
    color: var(--navy-55);
  }
  .sb-left, .sb-right { display: flex; align-items: center; gap: 0; }
  .sb-item {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 0 12px; height: 28px;
    transition: background .15s ease, color .15s ease;
  }
  .sb-item:hover { background: var(--navy-06); color: var(--navy); cursor: default; }
  .sb-sep {
    width: 1px; height: 14px; background: var(--navy-10);
    margin: 0 2px;
  }
  .sb-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--navy-30);
  }
  .sb-dot.on {
    background: #2E7D4F;
    box-shadow: 0 0 0 2px rgba(46,125,79,0.15);
  }
</style>
