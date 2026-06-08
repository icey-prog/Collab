<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto }    from '$app/navigation';
  import { page }    from '$app/stores';
  import * as Y from 'yjs';

  import { getSocket, disconnectSocket } from '$lib/socket';
  import { createRoomDoc, type YDocBundle } from '$lib/yjs';

  import {
    activeModule, participants, isAdmin, status,
    expiresInSec, pushToast
  } from '$lib/stores/room';
  import { questions, type Question } from '$lib/stores/qa';
  import { files,     type RoomFile } from '$lib/stores/files';

  import Sidebar      from '$lib/components/Sidebar.svelte';
  import NotesModule  from '$lib/components/NotesModule.svelte';
  import FilesModule  from '$lib/components/FilesModule.svelte';
  import QAModule     from '$lib/components/QAModule.svelte';
  import ToastStack   from '$lib/components/ToastStack.svelte';

  $: roomId = $page.params.id?.toUpperCase() ?? '';

  let yBundle: YDocBundle | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;

  /* ─────────────────────────────────────────────────────
   *  Socket wiring
   * ───────────────────────────────────────────────────── */
  function wire() {
    const s = getSocket();

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
    s.on('room:closed', () => {
      status.set('closed');
      pushToast('La room a été close par l\'administrateur', 'info', 5000);
      setTimeout(() => goto('/'), 1500);
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
  onMount(() => {
    wire();
    countdownTimer = setInterval(() => {
      expiresInSec.update((s) => Math.max(0, s - 1));
    }, 1000);
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

  <main class="main">
    <div class="topbar">
      <h2>{modTitle}</h2>
      <div class="status">
        {#if $status === 'connecting'}
          <span class="pill">Connexion…</span>
        {:else if $status === 'joined'}
          <span class="pill pill-online"><span class="dot"></span>{$participants} en ligne</span>
        {:else if $status === 'full'}
          <span class="pill pill-error">Room pleine (50/50)</span>
        {:else if $status === 'not_found'}
          <span class="pill pill-error">Room introuvable</span>
        {:else if $status === 'closed'}
          <span class="pill pill-warn">Room fermée</span>
        {/if}
      </div>
    </div>

    <div class="module">
      {#if $activeModule === 'notes' && yBundle}
        <NotesModule yText={yBundle.text} />
      {:else if $activeModule === 'files'}
        <FilesModule {roomId} />
      {:else if $activeModule === 'qa'}
        <QAModule />
      {/if}
    </div>
  </main>

  <ToastStack />
</div>

<style>
  .room-shell {
    display: flex; min-height: 100vh; background: var(--paper);
  }
  .room-shell.dim .main { opacity: 0.7; pointer-events: none; }

  .main {
    flex: 1; display: flex; flex-direction: column; min-width: 0;
  }
  .topbar {
    height: 72px; flex-shrink: 0; padding: 0 36px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--navy-08);
  }
  .topbar h2 {
    font-family: var(--font-head); font-weight: 700; font-size: 18px;
    color: var(--navy); margin: 0;
  }
  .module {
    flex: 1; padding: 32px 36px; overflow: auto; min-height: 0;
    display: flex; flex-direction: column;
  }
</style>
