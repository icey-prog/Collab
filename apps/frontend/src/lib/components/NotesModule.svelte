<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { isOnline } from '$lib/stores/network';
  import type * as Y from 'yjs';

  export let yText: Y.Text;

  let textarea: HTMLTextAreaElement;
  let value = yText.toString();
  let suppress = false;          // guards against re-applying our own change

  /* — Pull remote updates into the textarea — */
  function onYChange() {
    if (suppress) return;
    const s = yText.toString();
    if (s !== value) {
      const sel = textarea ? [textarea.selectionStart, textarea.selectionEnd] : [0, 0];
      value = s;
      // restore cursor on next tick
      queueMicrotask(() => {
        if (textarea) textarea.setSelectionRange(sel[0], sel[1]);
      });
    }
  }

  /* — Push local edits into Y.Text via minimal diff — */
  function onInput(e: Event) {
    const next = (e.target as HTMLTextAreaElement).value;
    const prev = yText.toString();
    if (next === prev) return;

    // tiny single-edit diff (good enough for human typing speed)
    let start = 0;
    while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
    let endPrev = prev.length, endNext = next.length;
    while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
      endPrev--; endNext--;
    }
    const removed  = endPrev - start;
    const inserted = next.slice(start, endNext);

    suppress = true;
    yText.doc?.transact(() => {
      if (removed)  yText.delete(start, removed);
      if (inserted) yText.insert(start, inserted);
    });
    suppress = false;
    value = next;
  }

  onMount(() => {
    value = yText.toString();
    yText.observe(onYChange);
  });
  onDestroy(() => yText.unobserve(onYChange));
</script>

<div class="notes-zone">

  <!-- Zone header — titre + meta -->
  <div class="zone-header">
    <div class="zone-title-row">
      <span class="zone-ico">
        <svg viewBox="0 0 18 18" fill="none">
          <path d="M4 2.5h7L14.5 6v9.5H4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          <path d="M10.5 2.5V6h4M6.5 9.5h5M6.5 12h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </span>
      <h2 class="zone-title">Bloc-notes</h2>
      {#if $isOnline}
        <span class="zone-tag">CRDT · temps réel</span>
      {:else}
        <span class="zone-tag offline">✎ Hors-ligne · sauvegardé localement</span>
      {/if}
    </div>
    <p class="zone-desc">Édition collaborative en temps réel via Y.js — toutes les modifications sont synchronisées instantanément entre participants.</p>
  </div>

  <!-- Éditeur -->
  <div class="editor">
    <!-- Toolbar haut style IDE -->
    <div class="editor-toolbar">
      <button class="tool-btn" title="Gras (Ctrl+B)"><b>B</b></button>
      <button class="tool-btn" title="Italique (Ctrl+I)" style="font-style:italic;">I</button>
      <button class="tool-btn" title="Code (Ctrl+E)" style="font-family:var(--font-mono);font-size:12px;">&lt;/&gt;</button>
      <button class="tool-btn" title="Titre">H</button>
      <span class="tb-sep"></span>
      <span class="tb-meta">Markdown</span>
    </div>

    <textarea
      bind:this={textarea}
      {value}
      on:input={onInput}
      placeholder="Commencez à écrire — synchronisation temps réel via Y.js entre tous les participants connectés."
      spellcheck="false"
    ></textarea>
  </div>

</div>

<style>
  .notes-zone {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
    min-height: 0;
  }

  /* ── Zone header ── */
  .zone-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .zone-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .zone-ico {
    width: 22px; height: 22px;
    display: inline-flex;
    color: var(--navy-60);
    flex-shrink: 0;
  }
  .zone-ico svg { width: 100%; height: 100%; }
  .zone-title {
    font-family: var(--font-head); font-weight: 700;
    font-size: 17px; color: var(--navy); margin: 0;
    letter-spacing: -0.01em;
  }
  .zone-tag {
    font-family: var(--font-mono); font-size: 10px;
    color: var(--navy-50); background: var(--navy-06);
    padding: 3px 8px; border-radius: var(--r-pill);
    letter-spacing: 0.06em; margin-left: auto;
    white-space: nowrap;
    transition: background 0.3s, color 0.3s;
  }
  .zone-tag.offline {
    background: var(--warning); color: var(--navy);
  }
  .zone-desc {
    font-size: 13px; color: var(--navy-50);
    line-height: 1.5; margin: 0;
    max-width: 640px;
  }

  /* ── Editor ── */
  .editor {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--navy-10);
    border-radius: var(--r-md);
    display: flex; flex-direction: column; min-height: 0;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }

  .editor-toolbar {
    display: flex; align-items: center; gap: 2px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--navy-08);
    background: var(--surface-cream-strong, var(--navy-04));
    flex-shrink: 0;
  }
  .tool-btn {
    width: 32px; height: 32px; border-radius: 6px;
    border: none; background: transparent; color: var(--navy-55);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-family: var(--font-head); font-weight: 700; font-size: 13px;
    transition: background .15s ease, color .15s ease;
  }
  .tool-btn:hover { background: var(--navy-08); color: var(--navy); }
  .tool-btn:active { background: var(--navy-12); }
  .tb-sep {
    width: 1px; height: 18px; background: var(--navy-12);
    margin: 0 6px;
  }
  .tb-meta {
    font-family: var(--font-mono); font-size: 11px;
    color: var(--navy-50);
    margin-left: auto;
    letter-spacing: 0.05em;
  }

  textarea {
    flex: 1; min-height: 200px;
    padding: 28px 32px;
    background: transparent; border: none; outline: none; resize: none;
    font-family: var(--font-body); font-size: 15px; line-height: 1.75;
    color: var(--navy);
  }
  textarea::placeholder {
    color: var(--navy-40);
    font-style: italic;
  }
</style>

