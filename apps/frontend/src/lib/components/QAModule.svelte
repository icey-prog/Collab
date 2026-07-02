<script lang="ts">
  import { questions } from '$lib/stores/qa';
  import { getSocket } from '$lib/socket';
  import { isAdmin, pushToast } from '$lib/stores/room';
  import { isOnline } from '$lib/stores/network';
  import { outboxAdd } from '$lib/offline/outbox';

  let text    = '';
  let voted   = new Set<string>();
  let roomId  = '';

  // roomId injected by parent via prop (optional — gracefully absent)
  export { roomId };

  async function submit() {
    const t = text.trim();
    if (t.length < 3 || t.length > 500) return;

    if (!$isOnline) {
      await outboxAdd('qa:add', roomId, { text: t });
      pushToast('Question enregistrée hors ligne — envoyée au retour réseau', 'info', 5000);
      text = '';
      return;
    }

    getSocket().emit('qa:add', { text: t });
    text = '';
  }
  // Identifiant de vote persistant (sessionStorage) — survit aux reconnexions
  // socket, contrairement à socket.id (revote possible sinon après reconnect).
  function getVoterId(): string {
    try {
      let v = sessionStorage.getItem('collab.voterId');
      if (!v) { v = crypto.randomUUID(); sessionStorage.setItem('collab.voterId', v); }
      return v;
    } catch { return ''; } // Safari privé — fallback socket.id côté serveur
  }

  function vote(id: string) {
    if (voted.has(id)) return;
    voted.add(id); voted = voted;     // trigger reactivity
    getSocket().emit('qa:vote', { questionId: id, voterId: getVoterId() });
  }
  function remove(id: string) {
    if (!$isAdmin) return;
    getSocket().emit('qa:delete', { questionId: id });
  }

  function fmtTime(ts: number) {
    const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (m < 1) return 'à l\'instant';
    if (m < 60) return `il y a ${m} min`;
    return `il y a ${Math.floor(m / 60)}h`;
  }

  /* ── Copy question text — Claude Desktop style ──────────── */

  let copiedId: string | null = null;
  async function copyQuestion(q: { id: string; text: string }) {
    try {
      await navigator.clipboard.writeText(q.text);
      copiedId = q.id;
      setTimeout(() => { if (copiedId === q.id) copiedId = null; }, 1500);
    } catch { /* clipboard denied */ }
  }
</script>

<div class="qa-zone">

  <!-- Zone header -->
  <div class="zone-header">
    <div class="zone-title-row">
      <span class="zone-ico">
        <svg viewBox="0 0 18 18" fill="none">
          <path d="M9 2C5.13 2 2 4.91 2 8.5c0 1.48.52 2.85 1.4 3.94L2.5 15.5l3.3-1.18A7.04 7.04 0 0 0 9 15c3.87 0 7-2.91 7-6.5S12.87 2 9 2z"
                stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          <path d="M9 9V7.5a1.5 1.5 0 1 1 1.5 1.5H9m0 2.5v.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </span>
      <h2 class="zone-title">Q&amp;A</h2>
      {#if $questions.length > 0}
        <span class="zone-count">{$questions.length}</span>
      {/if}
      <span class="zone-tag">Vote · Temps réel</span>
    </div>
    <p class="zone-desc">Posez vos questions — les participants peuvent voter pour faire remonter les plus pertinentes en haut.</p>
  </div>

  <!-- Input question -->
  <form class="qa-input" on:submit|preventDefault={submit}>
    <input
      class="field"
      bind:value={text}
      type="text"
      placeholder="Posez votre question…"
      maxlength="500"
      aria-label="Votre question"
    />
    <button class="btn btn-cta" type="submit" disabled={text.trim().length < 3}>Envoyer</button>
  </form>

  {#if $questions.length === 0}
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="1.5" opacity="0.15"/>
          <path d="M32 14C22.06 14 14 21.4 14 30.5c0 3.7 1.3 7.12 3.5 9.85L16 48l7.2-2.62A18.5 18.5 0 0 0 32 47c9.94 0 18-7.4 18-16.5S41.94 14 32 14z"
                stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" opacity="0.4"/>
          <path d="M32 34v-4a4 4 0 1 1 4 4h-4m0 6v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.6"/>
        </svg>
      </div>
      <p class="empty-title">Aucune question pour l'instant</p>
      <p class="empty-sub">Sois le premier à demander quelque chose ↑</p>
    </div>
  {:else}
    <div class="qa-list">
      {#each $questions as q (q.id)}
        <div class="qa-card">
          <div class="vote">
            <span class="score">{q.votes}</span>
            <button
              class="up"
              class:voted={voted.has(q.id)}
              on:click={() => vote(q.id)}
              aria-label={voted.has(q.id) ? 'Déjà voté' : 'Voter pour cette question'}
              disabled={voted.has(q.id)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 3l4 5H3z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <div class="qa-body">
            <div class="qa-q">{q.text}</div>
            <div class="qa-time">{fmtTime(q.createdAt)}</div>
          </div>
          <div class="qa-actions">
            <button
              class="icon-copy"
              class:copied={copiedId === q.id}
              on:click={() => copyQuestion(q)}
              title={copiedId === q.id ? 'Copié' : 'Copier la question'}
              aria-label="Copier la question"
            >
              {#if copiedId === q.id}
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {:else}
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M3 10.5V4.5a1.5 1.5 0 0 1 1.5-1.5h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
              {/if}
            </button>
            {#if $isAdmin}
              <button class="icon-del" on:click={() => remove(q.id)} title="Supprimer" aria-label="Supprimer cette question">×</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

</div>

<style>
  .qa-zone { display: flex; flex-direction: column; gap: 16px; min-height: 0; }

  /* ── Zone header ── */
  .zone-header { display: flex; flex-direction: column; gap: 8px; }
  .zone-title-row { display: flex; align-items: center; gap: 10px; }
  .zone-ico {
    width: 22px; height: 22px; display: inline-flex;
    color: var(--navy-60); flex-shrink: 0;
  }
  .zone-ico svg { width: 100%; height: 100%; }
  .zone-title {
    font-family: var(--font-head); font-weight: 700;
    font-size: 17px; color: var(--navy); margin: 0;
    letter-spacing: -0.01em;
  }
  .zone-count {
    font-family: var(--font-mono); font-size: 11px; font-weight: 600;
    background: var(--navy); color: var(--paper);
    padding: 2px 8px; border-radius: var(--r-pill);
  }
  .zone-tag {
    font-family: var(--font-mono); font-size: 10px;
    color: var(--navy-50); background: var(--navy-06);
    padding: 3px 8px; border-radius: var(--r-pill);
    letter-spacing: 0.06em; margin-left: auto; white-space: nowrap;
  }
  .zone-desc {
    font-size: 13px; color: var(--navy-50); line-height: 1.5; margin: 0;
  }

  /* ── Input ── */
  .qa-input { display: flex; gap: 10px; }
  .qa-input .field {
    flex: 1; font-family: var(--font-body); letter-spacing: 0; text-align: left;
  }
  .qa-input .field::placeholder { letter-spacing: 0; }
  .qa-input .btn { padding: 0 26px; font-size: 14px; min-height: 44px; }

  /* ── Empty state ── */
  .empty-state {
    display: flex; flex-direction: column; align-items: center;
    gap: 10px; padding: 48px 32px;
    border: 1px dashed var(--navy-25); border-radius: var(--r-lg);
    background: var(--navy-04);
  }
  .empty-icon { width: 64px; height: 64px; color: var(--navy-50); }
  .empty-icon svg { width: 100%; height: 100%; }
  .empty-title { font-family: var(--font-head); font-weight: 600; font-size: 16px; color: var(--navy-60); margin: 0; }
  .empty-sub { font-size: 13px; color: var(--navy-40); margin: 0; }

  /* ── List ── */
  .qa-list { display: flex; flex-direction: column; gap: 10px; }
  .qa-card {
    display: flex; align-items: center; gap: 18px;
    padding: 16px 20px;
    background: var(--surface); border-radius: var(--r-md);
    box-shadow: 0 2px 12px rgba(0,0,0,0.05);
    transition: box-shadow .18s ease;
  }
  .qa-card:hover { box-shadow: 0 4px 18px rgba(0,0,0,0.09); }

  .vote {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    width: 52px; flex-shrink: 0;
  }
  .score {
    font-family: var(--font-head); font-weight: 700; font-size: 22px;
    color: var(--navy); line-height: 1;
  }
  .up {
    width: 32px; height: 26px; border-radius: 7px;
    border: none; background: var(--navy-06); color: var(--navy-50);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background .15s, color .15s;
  }
  .up:hover:not(.voted) { background: var(--navy-12); color: var(--navy); }
  .up.voted { background: var(--chartreuse); color: var(--accent-ink); cursor: default; }
  .up:disabled { pointer-events: none; }
  .qa-body { flex: 1; }
  .qa-q { font-size: 14.5px; color: var(--navy); line-height: 1.45; }
  .qa-time { font-family: var(--font-mono); font-size: 11px; color: var(--navy-40); margin-top: 6px; }
  .qa-actions {
    display: flex; align-items: center; gap: 4px;
    opacity: 0; transition: opacity .18s ease;
  }
  .qa-card:hover .qa-actions,
  .qa-card:focus-within .qa-actions { opacity: 1; }
  .qa-actions .icon-copy.copied,
  .qa-card:has(.icon-copy.copied) .qa-actions { opacity: 1; } /* keep visible during ✓ */

  .icon-copy {
    width: 28px; height: 28px; border-radius: 6px; border: none; cursor: pointer;
    background: transparent; color: var(--navy-50);
    display: inline-flex; align-items: center; justify-content: center;
    transition: background .15s, color .15s;
  }
  .icon-copy:hover { background: var(--navy-08); color: var(--navy); }
  .icon-copy.copied { background: var(--chartreuse); color: var(--accent-ink); }

  .icon-del {
    width: 28px; height: 28px; border-radius: 6px; border: none; cursor: pointer;
    background: transparent; color: var(--navy-40); font-size: 18px; line-height: 1;
    transition: background .15s, color .15s;
  }
  .icon-del:hover { background: rgba(244,168,168,0.25); color: #B05656; }
</style>
