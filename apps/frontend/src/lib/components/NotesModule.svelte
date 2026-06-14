<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { isOnline } from '$lib/stores/network';
  import { EditorState } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine, placeholder as cmPlaceholder } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import { yCollab } from 'y-codemirror.next';
  import type * as Y from 'yjs';
  import type { Awareness } from 'y-protocols/awareness';

  export let yText:     Y.Text;
  export let awareness: Awareness;

  let host:  HTMLDivElement;
  let view:  EditorView | null = null;
  let peers: { id: number; name: string; color: string }[] = [];

  // Fix #9: validate peer color is a real hex (peer controls this field)
  const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
  function safeColor(c: unknown): string {
    return typeof c === 'string' && COLOR_RE.test(c) ? c : '#888888';
  }

  /* ── Toolbar formatting (markdown) ─────────────────────── */

  function wrapSelection(left: string, right: string = left) {
    if (!view) return;
    const { state } = view;
    const sel = state.selection.main;
    const text = state.sliceDoc(sel.from, sel.to);
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: `${left}${text}${right}` },
      selection: { anchor: sel.from + left.length, head: sel.from + left.length + text.length },
    });
    view.focus();
  }

  function toggleLinePrefix(prefix: string) {
    if (!view) return;
    const { state } = view;
    const sel = state.selection.main;
    const line = state.doc.lineAt(sel.from);
    const already = line.text.startsWith(prefix);
    view.dispatch({
      changes: already
        ? { from: line.from, to: line.from + prefix.length, insert: '' }
        : { from: line.from, insert: prefix },
    });
    view.focus();
  }

  const fmtBold   = () => wrapSelection('**');
  const fmtItalic = () => wrapSelection('*');
  const fmtCode   = () => wrapSelection('`');
  const fmtHead   = () => toggleLinePrefix('# ');
  const fmtQuote  = () => toggleLinePrefix('> ');
  const fmtList   = () => toggleLinePrefix('- ');

  /* ── Copy whole document to clipboard ──────────────────── */

  let copyState: 'idle' | 'done' = 'idle';
  async function copyAll() {
    if (!view) return;
    try {
      await navigator.clipboard.writeText(view.state.doc.toString());
      copyState = 'done';
      setTimeout(() => (copyState = 'idle'), 1500);
    } catch { /* clipboard denied */ }
  }

  // Fix #9: also cap peer name length to avoid layout breaking by a malicious peer
  function safeName(n: unknown): string {
    if (typeof n !== 'string') return 'Anon';
    return n.length > 40 ? n.slice(0, 40) + '…' : n;
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

  onMount(() => {
    const state = EditorState.create({
      doc: yText.toString(),
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          { key: 'Mod-b', run: () => { fmtBold();   return true; } },
          { key: 'Mod-i', run: () => { fmtItalic(); return true; } },
          { key: 'Mod-e', run: () => { fmtCode();   return true; } },
        ]),
        markdown(),
        cmPlaceholder('Commencez à écrire — synchronisation temps réel via Y.js. Les curseurs des autres participants sont visibles.'),
        EditorView.lineWrapping,
        yCollab(yText, awareness),
        EditorView.theme({
          '&':            { height: '100%', fontFamily: 'var(--font-body)', fontSize: '15px' },
          '.cm-scroller': { fontFamily: 'var(--font-body)', lineHeight: '1.75', padding: '12px 0' },
          '.cm-content':  { padding: '12px 16px', color: 'var(--navy)' },
          '.cm-gutters':  { background: 'transparent', border: 'none', color: 'var(--navy-30)', fontFamily: 'var(--font-mono)', fontSize: '11px' },
          '.cm-activeLine':       { background: 'var(--navy-04)' },
          '.cm-activeLineGutter': { background: 'transparent', color: 'var(--navy-60)' },
          '.cm-cursor':           { borderLeftColor: 'var(--navy)' },
          '.cm-selectionBackground, ::selection': { background: 'var(--chartreuse) !important' },
        }, { dark: false }),
      ],
    });

    view = new EditorView({ state, parent: host });

    awareness.on('change', refreshPeers);
    refreshPeers();
  });

  onDestroy(() => {
    if (awareness) awareness.off('change', refreshPeers);
    view?.destroy();
    view = null;
  });
</script>

<div class="notes-zone">

  <!-- Zone header -->
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
        <span class="zone-tag">CRDT · curseurs partagés</span>
      {:else}
        <span class="zone-tag offline">✎ Hors-ligne · sauvegardé localement</span>
      {/if}
    </div>
    <p class="zone-desc">Édition collaborative temps réel via Y.js — les curseurs et sélections des autres participants apparaissent en couleur dans le texte.</p>

    {#if peers.length > 0}
      <div class="peers">
        <span class="peers-lbl">En train d'éditer :</span>
        {#each peers as p (p.id)}
          <span class="peer-chip" style:--peer-color={p.color}>
            <span class="peer-dot"></span>{p.name}
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Éditeur -->
  <div class="editor">
    <div class="editor-toolbar">
      <button class="tool-btn" on:click={fmtBold}   title="Gras (Ctrl+B)" aria-label="Gras"><b>B</b></button>
      <button class="tool-btn" on:click={fmtItalic} title="Italique (Ctrl+I)" aria-label="Italique" style="font-style:italic;">I</button>
      <button class="tool-btn" on:click={fmtCode}   title="Code inline (Ctrl+E)" aria-label="Code" style="font-family:var(--font-mono);font-size:12px;">&lt;/&gt;</button>
      <span class="tb-sep"></span>
      <button class="tool-btn" on:click={fmtHead}  title="Titre" aria-label="Titre">H</button>
      <button class="tool-btn" on:click={fmtList}  title="Liste" aria-label="Liste">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="3" cy="4" r="1" fill="currentColor"/>
          <circle cx="3" cy="8" r="1" fill="currentColor"/>
          <circle cx="3" cy="12" r="1" fill="currentColor"/>
          <path d="M6.5 4h7M6.5 8h7M6.5 12h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="tool-btn" on:click={fmtQuote} title="Citation" aria-label="Citation">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 5h2v6H3zM7 5h2v6H7z" fill="currentColor" opacity="0.6"/>
        </svg>
      </button>
      <span class="tb-sep"></span>
      <span class="tb-meta">Markdown · CodeMirror 6</span>
      <button class="tool-btn copy-all" on:click={copyAll} title="Copier tout le bloc-notes" aria-label="Copier tout">
        {#if copyState === 'done'}
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
    </div>

    <div class="cm-host" bind:this={host}></div>
  </div>

</div>

<style>
  .notes-zone { display: flex; flex-direction: column; gap: 16px; flex: 1; min-height: 0; }

  /* ── Zone header ── */
  .zone-header { display: flex; flex-direction: column; gap: 8px; }
  .zone-title-row { display: flex; align-items: center; gap: 10px; }
  .zone-ico { width: 22px; height: 22px; display: inline-flex; color: var(--navy-60); flex-shrink: 0; }
  .zone-ico svg { width: 100%; height: 100%; }
  .zone-title {
    font-family: var(--font-head); font-weight: 700;
    font-size: 17px; color: var(--navy); margin: 0; letter-spacing: -0.01em;
  }
  .zone-tag {
    font-family: var(--font-mono); font-size: 10px;
    color: var(--navy-50); background: var(--navy-06);
    padding: 3px 8px; border-radius: var(--r-pill);
    letter-spacing: 0.06em; margin-left: auto; white-space: nowrap;
    transition: background 0.3s, color 0.3s;
  }
  .zone-tag.offline { background: var(--warning); color: var(--navy); }
  .zone-desc {
    font-size: 13px; color: var(--navy-50);
    line-height: 1.5; margin: 0; max-width: 640px;
  }

  /* ── Peers chips ── */
  .peers {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-top: 4px;
  }
  .peers-lbl {
    font-family: var(--font-mono); font-size: 10px;
    color: var(--navy-50); letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .peer-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 9px 3px 7px; border-radius: var(--r-pill);
    background: var(--navy-06);
    font-size: 12px; font-weight: 500; color: var(--navy);
  }
  .peer-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--peer-color);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--peer-color) 25%, transparent);
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
  .tool-btn.copy-all { color: var(--navy-50); }
  .tool-btn.copy-all:hover { background: var(--chartreuse); color: var(--accent-ink); }
  .tb-sep { width: 1px; height: 18px; background: var(--navy-12); margin: 0 6px; }
  .tb-meta {
    font-family: var(--font-mono); font-size: 11px;
    color: var(--navy-50); margin-left: auto; letter-spacing: 0.05em;
  }

  /* CodeMirror host */
  .cm-host { flex: 1; min-height: 200px; overflow: auto; }
  :global(.cm-host .cm-editor) { height: 100%; }
  :global(.cm-host .cm-editor.cm-focused) { outline: none; }

  /* y-codemirror.next remote cursor tags */
  :global(.cm-ySelection) { background-color: var(--remote-color-light, rgba(255,200,0,0.25)) !important; }
  :global(.cm-yLineSelection) { background-color: var(--remote-color-light, rgba(255,200,0,0.18)) !important; }
  :global(.cm-ySelectionCaret) { position: relative; border-left: 2px solid; margin-left: -1px; margin-right: -1px; box-sizing: border-box; }
  :global(.cm-ySelectionCaretDot) { border-radius: 50%; position: absolute; width: 6px; height: 6px; top: -3px; left: -3px; }
  :global(.cm-ySelectionInfo) {
    position: absolute; top: -1.1em; left: -1px;
    font-family: var(--font-mono); font-size: 10px; font-weight: 600;
    line-height: normal; user-select: none;
    color: white; padding: 2px 6px; border-radius: 4px 4px 4px 0;
    z-index: 101; white-space: nowrap;
    transition: opacity .25s ease-in-out;
  }
</style>
