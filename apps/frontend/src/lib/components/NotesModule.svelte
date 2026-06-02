<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
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

<div class="editor card">
  <h3 class="doc-title">Bloc-notes — Sprint en cours</h3>
  <textarea
    bind:this={textarea}
    {value}
    on:input={onInput}
    placeholder="Commencez à écrire — synchronisation temps réel via Y.js"
    spellcheck="false"
  ></textarea>

  <div class="editor-toolbar">
    <button class="tool-btn" title="Gras"><b>B</b></button>
    <button class="tool-btn" title="Italique" style="font-style:italic;">I</button>
    <button class="tool-btn" title="Code" style="font-family:var(--font-mono);font-size:12px;">&lt;/&gt;</button>
    <button class="tool-btn" title="Titre">H</button>
  </div>
</div>

<style>
  .editor {
    flex: 1; padding: 36px 40px;
    display: flex; flex-direction: column; min-height: 0;
  }
  .doc-title {
    font-family: var(--font-head); font-weight: 700; font-size: 22px;
    color: var(--navy); margin: 0 0 18px;
  }
  textarea {
    flex: 1; min-height: 200px;
    background: transparent; border: none; outline: none; resize: none;
    font-family: var(--font-body); font-size: 15px; line-height: 1.75;
    color: var(--navy);
  }
  textarea::placeholder { color: var(--navy-30); }

  .editor-toolbar {
    display: flex; gap: 4px;
    margin-top: 18px; padding-top: 16px;
    border-top: 1px solid var(--navy-08);
  }
  .tool-btn {
    width: 40px; height: 40px; border-radius: var(--r-sm);
    border: none; background: transparent; color: var(--navy-50);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-family: var(--font-head); font-weight: 700; font-size: 14px;
  }
  .tool-btn:hover { background: var(--navy-06); color: var(--navy); }
</style>
