<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import type * as Y from 'yjs';
  import type { Awareness } from 'y-protocols/awareness';
  import { localIdentity, type ChatBlock } from '$lib/yjs';
  import { isOnline } from '$lib/stores/network';
  import { isAdmin } from '$lib/stores/room';

  export let blocks:    Y.Array<ChatBlock>;
  export let awareness: Awareness;

  let messages: ChatBlock[] = [];
  let draft = '';
  let editingId: string | null = null;
  let editingDraft = '';
  let feedEl: HTMLDivElement;
  let inputEl: HTMLTextAreaElement;
  let peers: { id: number; name: string; color: string }[] = [];

  const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
  const MAX_TEXT = 2000;
  const GROUP_WINDOW_MS = 5 * 60 * 1000;

  function safeColor(c: unknown): string {
    return typeof c === 'string' && COLOR_RE.test(c) ? c : '#888888';
  }
  function safeName(n: unknown): string {
    if (typeof n !== 'string') return 'Anon';
    return n.length > 40 ? n.slice(0, 40) + '…' : n;
  }

  function refreshMessages() {
    messages = blocks.toArray();
    queueScroll();
  }
  function refreshPeers() {
    if (!awareness) { peers = []; return; }
    const list: typeof peers = [];
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === awareness.clientID) return;
      const u = (state as { user?: { name?: string; color?: string } }).user;
      if (u?.name) list.push({ id: clientId, name: safeName(u.name), color: safeColor(u.color) });
    });
    peers = list;
  }

  let scrollPending = false;
  function queueScroll() {
    if (scrollPending) return;
    scrollPending = true;
    tick().then(() => {
      scrollPending = false;
      if (feedEl) feedEl.scrollTop = feedEl.scrollHeight;
    });
  }

  // ── Send / Edit / Delete ─────────────────────────────────
  function send() {
    const text = draft.trim().slice(0, MAX_TEXT);
    if (!text) return;
    const block: ChatBlock = {
      id:          crypto.randomUUID(),
      authorId:    blocks.doc!.clientID,
      authorName:  localIdentity.name,
      authorColor: localIdentity.color,
      text,
      createdAt:   Date.now(),
    };
    blocks.push([block]);
    draft = '';
    if (navigator.vibrate) navigator.vibrate(8);
  }

  function startEdit(b: ChatBlock) {
    if (b.authorId !== blocks.doc!.clientID) return;
    editingId = b.id;
    editingDraft = b.text;
    tick().then(() => {
      const el = document.getElementById(`edit-${b.id}`) as HTMLTextAreaElement | null;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function saveEdit(b: ChatBlock) {
    const newText = editingDraft.trim().slice(0, MAX_TEXT);
    if (!newText || newText === b.text) { editingId = null; return; }
    const idx = blocks.toArray().findIndex(x => x.id === b.id);
    if (idx < 0) { editingId = null; return; }
    const updated: ChatBlock = { ...b, text: newText, editedAt: Date.now() };
    blocks.doc!.transact(() => {
      blocks.delete(idx, 1);
      blocks.insert(idx, [updated]);
    });
    editingId = null;
  }

  function cancelEdit() { editingId = null; editingDraft = ''; }

  function remove(b: ChatBlock) {
    const isOwn = b.authorId === blocks.doc!.clientID;
    if (!isOwn && !$isAdmin) return;
    if (!confirm('Supprimer ce message ?')) return;
    const idx = blocks.toArray().findIndex(x => x.id === b.id);
    if (idx >= 0) blocks.delete(idx, 1);
  }

  // ── Keyboard ─────────────────────────────────────────────
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
  function onEditKey(e: KeyboardEvent, b: ChatBlock) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(b); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  }

  // ── Display helpers ──────────────────────────────────────
  function fmtTime(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function initials(name: string): string {
    const m = name.match(/[A-Za-zÀ-ÿ]+/);
    return (m ? m[0].slice(0, 2) : '??').toUpperCase();
  }

  // Group: show header only if prev block has different author or > 5 min gap
  function showHeader(idx: number): boolean {
    if (idx === 0) return true;
    const prev = messages[idx - 1];
    const cur  = messages[idx];
    if (prev.authorId !== cur.authorId) return true;
    return cur.createdAt - prev.createdAt > GROUP_WINDOW_MS;
  }

  $: isMine = (b: ChatBlock) => b.authorId === blocks.doc?.clientID;

  // ── Copy whole feed (text export) ───────────────────────
  let copyState: 'idle' | 'done' = 'idle';
  async function copyAll() {
    const txt = messages
      .map(m => `[${fmtTime(m.createdAt)}] ${m.authorName} : ${m.text}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(txt);
      copyState = 'done';
      setTimeout(() => (copyState = 'idle'), 1500);
    } catch {}
  }

  onMount(() => {
    refreshMessages();
    refreshPeers();
    blocks.observe(refreshMessages);
    awareness.on('change', refreshPeers);
    queueScroll();
  });

  onDestroy(() => {
    blocks.unobserve(refreshMessages);
    awareness.off('change', refreshPeers);
  });
</script>

<div class="chat-zone">

  <!-- Header -->
  <div class="zone-header">
    <div class="zone-title-row">
      <span class="zone-ico">
        <svg viewBox="0 0 18 18" fill="none">
          <path d="M3 4.5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 15 4.5v6A1.5 1.5 0 0 1 13.5 12H7l-3.5 3v-3H4.5A1.5 1.5 0 0 1 3 10.5z"
                stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
      </span>
      <h2 class="zone-title">Bloc-notes — fil de messages</h2>
      {#if $isOnline}
        <span class="zone-tag">Y.js CRDT · messages segmentés</span>
      {:else}
        <span class="zone-tag offline">✎ Hors-ligne · sauvegardé localement</span>
      {/if}
    </div>
    <p class="zone-desc">
      Chaque participant écrit ses propres messages. Tu ne peux modifier ou supprimer que les tiens.
    </p>

    {#if peers.length > 0}
      <div class="peers">
        <span class="peers-lbl">En ligne :</span>
        {#each peers as p (p.id)}
          <span class="peer-chip" style:--peer-color={p.color}>
            <span class="peer-dot"></span>{p.name}
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Toolbar -->
  <div class="feed-toolbar">
    <span class="tb-meta">{messages.length} message{messages.length > 1 ? 's' : ''}</span>
    <button class="tool-btn copy-all" on:click={copyAll}
            title="Copier la conversation" aria-label="Copier tout">
      {#if copyState === 'done'}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" stroke-width="1.7"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Copié</span>
      {:else}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M3 10.5V4.5a1.5 1.5 0 0 1 1.5-1.5h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <span>Exporter</span>
      {/if}
    </button>
  </div>

  <!-- Feed -->
  <div class="feed" bind:this={feedEl}>
    {#if messages.length === 0}
      <div class="empty">
        <div class="empty-ico">💭</div>
        <p>Aucun message pour l'instant.</p>
        <p class="sub">Tape ton premier message ci-dessous.</p>
      </div>
    {/if}

    {#each messages as b, idx (b.id)}
      {@const head = showHeader(idx)}
      {@const mine = isMine(b)}
      <div class="block" class:mine class:grouped={!head}>
        {#if head}
          <div class="avatar" style:--c={safeColor(b.authorColor)}>{initials(b.authorName)}</div>
        {:else}
          <div class="avatar-spacer">
            <span class="hover-time mono">{fmtTime(b.createdAt)}</span>
          </div>
        {/if}

        <div class="bubble-col">
          {#if head}
            <div class="block-head">
              <span class="author" style:color={safeColor(b.authorColor)}>{safeName(b.authorName)}</span>
              <span class="ts mono">{fmtTime(b.createdAt)}</span>
              {#if b.editedAt}<span class="edited mono">(modifié)</span>{/if}
            </div>
          {/if}

          {#if editingId === b.id}
            <div class="edit-wrap">
              <textarea
                id="edit-{b.id}"
                class="edit-field"
                bind:value={editingDraft}
                on:keydown={(e) => onEditKey(e, b)}
                maxlength={MAX_TEXT}
                rows="2"
              ></textarea>
              <div class="edit-actions">
                <button class="btn-mini" on:click={cancelEdit}>Annuler</button>
                <button class="btn-mini btn-mini-cta" on:click={() => saveEdit(b)}>Enregistrer</button>
              </div>
              <span class="edit-hint mono">Entrée pour sauver · Échap pour annuler</span>
            </div>
          {:else}
            <div class="bubble">
              <p class="text">{b.text}</p>
              {#if mine || $isAdmin}
                <div class="row-actions">
                  {#if mine}
                    <button class="ico-btn" title="Modifier" on:click={() => startEdit(b)} aria-label="Modifier">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M2.5 13.5l1-3.5L11 2.5l2 2L5.5 12 2 13z"
                              stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                      </svg>
                    </button>
                  {/if}
                  <button class="ico-btn ico-del" title={mine ? 'Supprimer' : 'Supprimer (admin)'}
                          on:click={() => remove(b)} aria-label="Supprimer">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M3 4.5h10M6.5 7v4M9.5 7v4M4.5 4.5l.5 8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5"
                            stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Input -->
  <div class="composer">
    <div class="composer-avatar" style:--c={safeColor(localIdentity.color)}>
      {initials(localIdentity.name)}
    </div>
    <textarea
      bind:this={inputEl}
      bind:value={draft}
      on:keydown={onKey}
      class="composer-field"
      placeholder="Écris un message · Entrée pour envoyer · Maj+Entrée = saut de ligne"
      rows="1"
      maxlength={MAX_TEXT}
      aria-label="Message"
    ></textarea>
    <button
      class="send-btn"
      class:active={draft.trim().length > 0}
      on:click={send}
      disabled={draft.trim().length === 0}
      aria-label="Envoyer"
      title="Envoyer (Entrée)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2.5 8l11-5-3.5 11-2-4.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="currentColor"/>
      </svg>
    </button>
  </div>

</div>

<style>
  .chat-zone { display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0; }

  .zone-header { display: flex; flex-direction: column; gap: 8px; }
  .zone-title-row { display: flex; align-items: center; gap: 10px; }
  .zone-ico { width: 22px; height: 22px; color: var(--navy-60); flex-shrink: 0; }
  .zone-ico svg { width: 100%; height: 100%; }
  .zone-title { font-family: var(--font-head); font-weight: 700; font-size: 17px; color: var(--navy); margin: 0; letter-spacing: -0.01em; }
  .zone-tag {
    font-family: var(--font-mono); font-size: 10px;
    color: var(--navy-50); background: var(--navy-06);
    padding: 3px 8px; border-radius: var(--r-pill);
    letter-spacing: 0.06em; margin-left: auto; white-space: nowrap;
  }
  .zone-tag.offline { background: var(--warning); color: var(--navy); }
  .zone-desc { font-size: 13px; color: var(--navy-50); line-height: 1.5; margin: 0; max-width: 640px; }

  .peers { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .peers-lbl { font-family: var(--font-mono); font-size: 10px; color: var(--navy-50); letter-spacing: 0.06em; text-transform: uppercase; }
  .peer-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 9px 3px 7px; border-radius: var(--r-pill);
    background: var(--navy-06); font-size: 12px; font-weight: 500; color: var(--navy);
  }
  .peer-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--peer-color);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--peer-color) 25%, transparent);
  }

  /* Toolbar */
  .feed-toolbar {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 10px;
    background: var(--surface-cream-strong, var(--navy-04));
    border: 1px solid var(--navy-08);
    border-radius: var(--r-md) var(--r-md) 0 0;
    border-bottom: none;
    flex-shrink: 0;
  }
  .tb-meta { font-family: var(--font-mono); font-size: 11px; color: var(--navy-55); }
  .tool-btn {
    margin-left: auto;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border: none; background: transparent;
    color: var(--navy-55); cursor: pointer; border-radius: 6px;
    font-size: 12px; font-weight: 500;
    transition: background .15s, color .15s;
  }
  .tool-btn:hover { background: var(--chartreuse); color: var(--accent-ink); }

  /* Feed */
  .feed {
    flex: 1; min-height: 200px; overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--navy-10); border-top: none;
    padding: 14px 12px;
    display: flex; flex-direction: column; gap: 2px;
  }

  .empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    color: var(--navy-40); text-align: center; gap: 4px;
  }
  .empty-ico { font-size: 28px; margin-bottom: 8px; }
  .empty p { margin: 0; font-size: 14px; }
  .empty .sub { font-size: 12px; color: var(--navy-30); }

  /* Block */
  .block {
    display: flex; gap: 12px; padding: 4px 8px;
    border-radius: 6px; position: relative;
    transition: background .12s ease;
  }
  .block:hover { background: var(--navy-04); }
  .block.grouped { padding-top: 1px; padding-bottom: 1px; }

  .avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: var(--c);
    color: white; font-family: var(--font-mono); font-weight: 600; font-size: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: 2px;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 18%, transparent);
  }
  .avatar-spacer {
    width: 36px; flex-shrink: 0;
    display: flex; justify-content: center; align-items: center;
    opacity: 0; transition: opacity .15s;
  }
  .block:hover .avatar-spacer { opacity: 1; }
  .hover-time {
    font-size: 10px; color: var(--navy-40);
  }

  .bubble-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .block-head {
    display: flex; align-items: baseline; gap: 8px;
  }
  .author { font-weight: 600; font-size: 14px; }
  .ts { font-size: 11px; color: var(--navy-40); }
  .edited { font-size: 10px; color: var(--navy-30); font-style: italic; }

  .bubble {
    position: relative; display: flex;
  }
  .text {
    margin: 0; font-size: 14px; line-height: 1.55; color: var(--navy);
    white-space: pre-wrap; word-break: break-word;
    flex: 1; padding-right: 50px;
  }

  .row-actions {
    position: absolute; top: -10px; right: 0;
    display: flex; gap: 2px;
    background: var(--surface);
    border: 1px solid var(--navy-10);
    border-radius: 6px; padding: 2px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    opacity: 0; transition: opacity .12s;
  }
  .block:hover .row-actions { opacity: 1; }
  .ico-btn {
    width: 24px; height: 24px; border: none; background: transparent;
    color: var(--navy-55); cursor: pointer; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    transition: background .12s, color .12s;
  }
  .ico-btn:hover { background: var(--navy-08); color: var(--navy); }
  .ico-del:hover { background: #FBD9D9; color: #B05656; }

  /* Edit mode */
  .edit-wrap { display: flex; flex-direction: column; gap: 6px; }
  .edit-field {
    width: 100%; padding: 8px 10px;
    border: 1px solid var(--chartreuse); border-radius: 6px;
    font-family: var(--font-body); font-size: 14px; color: var(--navy);
    background: var(--paper); resize: vertical; min-height: 60px;
    outline: none;
  }
  .edit-field:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--chartreuse) 30%, transparent); }
  .edit-actions { display: flex; gap: 6px; }
  .btn-mini {
    padding: 4px 10px; font-size: 12px; border: 1px solid var(--navy-10);
    background: var(--surface); color: var(--navy-60); border-radius: 4px;
    cursor: pointer; font-weight: 500;
  }
  .btn-mini-cta { background: var(--chartreuse); color: var(--accent-ink); border-color: transparent; }
  .edit-hint { font-size: 10px; color: var(--navy-40); }

  /* Composer */
  .composer {
    display: flex; align-items: flex-end; gap: 10px;
    padding: 10px;
    background: var(--surface);
    border: 1px solid var(--navy-10);
    border-radius: var(--r-md);
    flex-shrink: 0;
    box-shadow: 0 -2px 8px rgba(0,0,0,0.02);
  }
  .composer-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--c); color: white;
    font-family: var(--font-mono); font-weight: 600; font-size: 11px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .composer-field {
    flex: 1; border: none; resize: none; outline: none;
    background: transparent; font-family: var(--font-body); font-size: 14px;
    color: var(--navy); line-height: 1.5;
    min-height: 32px; max-height: 160px;
    padding: 6px 0;
  }
  .composer-field::placeholder { color: var(--navy-40); }

  .send-btn {
    width: 36px; height: 36px; border-radius: 8px;
    border: none; background: var(--navy-08); color: var(--navy-40);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background .15s, color .15s, transform .1s;
    flex-shrink: 0;
  }
  .send-btn.active { background: var(--chartreuse); color: var(--accent-ink); }
  .send-btn.active:hover { transform: translateY(-1px); }
  .send-btn:disabled { cursor: not-allowed; }
</style>
