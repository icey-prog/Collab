<script lang="ts">
  import { questions } from '$lib/stores/qa';
  import { getSocket } from '$lib/socket';
  import { isAdmin } from '$lib/stores/room';

  let text = '';
  let voted = new Set<string>();

  function submit() {
    const t = text.trim();
    if (t.length < 3 || t.length > 500) return;
    getSocket().emit('qa:add', { text: t });
    text = '';
  }
  function vote(id: string) {
    if (voted.has(id)) return;
    voted.add(id); voted = voted;     // trigger reactivity
    getSocket().emit('qa:vote', { questionId: id });
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
</script>

<div class="qa">
  <form class="qa-input" on:submit|preventDefault={submit}>
    <input
      class="field"
      bind:value={text}
      type="text"
      placeholder="Posez votre question…"
      maxlength="500"
    />
    <button class="btn btn-cta" type="submit" disabled={text.trim().length < 3}>Envoyer</button>
  </form>

  {#if $questions.length === 0}
    <p class="empty">Aucune question pour l'instant — sois le premier à demander.</p>
  {:else}
    <div class="qa-list">
      {#each $questions as q (q.id)}
        <div class="qa-card">
          <div class="vote">
            <span class="score">{q.votes}</span>
            <button class="up" class:voted={voted.has(q.id)} on:click={() => vote(q.id)} aria-label="Voter">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 3l4 5H3z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <div class="qa-body">
            <div class="qa-q">{q.text}</div>
            <div class="qa-time">{fmtTime(q.createdAt)}</div>
          </div>
          {#if $isAdmin}
            <button class="icon-del" on:click={() => remove(q.id)} title="Supprimer">×</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .qa { display: flex; flex-direction: column; min-height: 0; }
  .qa-input { display: flex; gap: 10px; }
  .qa-input .field {
    flex: 1; font-family: var(--font-body); letter-spacing: 0; text-align: left;
  }
  .qa-input .field::placeholder { letter-spacing: 0; }
  .qa-input .btn { padding: 0 26px; font-size: 14px; min-height: 44px; }

  .empty {
    margin-top: 24px; padding: 32px;
    text-align: center; color: var(--navy-50);
    font-size: 14px; background: var(--navy-04);
    border: 1px dashed var(--navy-25); border-radius: var(--r-md);
  }

  .qa-list { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }
  .qa-card {
    display: flex; align-items: center; gap: 18px;
    padding: 16px 20px;
    background: var(--surface); border-radius: var(--r-md);
    box-shadow: 0 2px 12px rgba(0,0,0,0.05);
  }
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
  }
  .up:hover { background: var(--navy-12); }
  .up.voted { background: var(--chartreuse); color: var(--accent-ink); cursor: default; }
  .qa-body { flex: 1; }
  .qa-q { font-size: 14.5px; color: var(--navy); line-height: 1.45; }
  .qa-time { font-family: var(--font-mono); font-size: 11px; color: var(--navy-40); margin-top: 6px; }
  .icon-del {
    width: 28px; height: 28px; border-radius: 6px; border: none; cursor: pointer;
    background: transparent; color: var(--navy-40); font-size: 18px; line-height: 1;
  }
  .icon-del:hover { background: rgba(244,168,168,0.25); color: #B05656; }
</style>
