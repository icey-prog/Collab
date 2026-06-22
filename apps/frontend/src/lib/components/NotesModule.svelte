<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { isOnline } from '$lib/stores/network';
  import { pushToast } from '$lib/stores/room';
  import { localIdentity, type AuthorMeta } from '$lib/yjs';

  import { EditorState } from '@codemirror/state';
  import {
    EditorView, keymap, highlightActiveLine,
    placeholder as cmPlaceholder, ViewPlugin,
  } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { yCollab } from 'y-codemirror.next';
  import type * as Y from 'yjs';
  import type { Awareness } from 'y-protocols/awareness';

  import {
    sectionsField, sectionDecorations, ownershipFilter, authorResolverFacet,
    type AuthorInfo, MARK_LINE_RE,
  } from '$lib/notes/sections';

  export let yText:     Y.Text;
  export let awareness: Awareness;
  export let authors:   Y.Map<AuthorMeta>;

  let host: HTMLDivElement;
  let view: EditorView | null = null;
  let peers: { id: number; name: string; color: string; cursor?: { line: number; col: number } }[] = [];

  const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
  function safeColor(c: unknown): string { return typeof c === 'string' && COLOR_RE.test(c) ? c : '#888888'; }
  function safeName(n: unknown): string {
    if (typeof n !== 'string') return 'Anon';
    return n.length > 40 ? n.slice(0, 40) + '…' : n;
  }

  // Resolver clientID → AuthorInfo basé sur Y.Map authors + fallback awareness
  function resolveAuthor(clientId: number): AuthorInfo {
    const fromMap = authors.get(String(clientId));
    if (fromMap) return { id: clientId, name: safeName(fromMap.name), color: safeColor(fromMap.color) };
    // fallback : peut-être encore dans awareness
    const st = awareness.getStates().get(clientId) as { user?: { name?: string; color?: string } } | undefined;
    if (st?.user) return { id: clientId, name: safeName(st.user.name), color: safeColor(st.user.color) };
    return { id: clientId, name: `Utilisateur #${clientId}`, color: '#888888' };
  }

  function refreshPeers() {
    if (!awareness) { peers = []; return; }
    const list: typeof peers = [];
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === awareness.clientID) return;
      const s = state as {
        user?:   { name?: string; color?: string };
        cursor?: { anchor: { type: { client: number; clock: number } } };
      };
      if (s.user?.name) {
        list.push({ id: clientId, name: safeName(s.user.name), color: safeColor(s.user.color) });
      }
    });
    peers = list;
  }

  // Force redraw of decorations when authors map updates (un participant rejoint)
  function refreshDecorations() {
    if (view) view.dispatch({});
  }

  const notebookContentClass = ViewPlugin.fromClass(class {
    constructor(readonly view: EditorView) { this.sync(); }
    update() { this.sync(); }
    sync() {
      this.view.dom.classList.toggle('cm-notebook-has-content', this.view.state.doc.length > 0);
    }
  });

  /* ── Copy: strip section markers ─────────────────── */
  let copyState: 'idle' | 'done' = 'idle';
  async function copyAll() {
    if (!view) return;
    const lines = view.state.doc.toString().split('\n');
    const clean = lines
      .map(line => {
        const m = MARK_LINE_RE.exec(line);
        if (!m) return line;
        const info = resolveAuthor(Number(m[1]));
        return `─── ${info.name} ───`;
      })
      .join('\n');
    try {
      await navigator.clipboard.writeText(clean);
      copyState = 'done';
      setTimeout(() => (copyState = 'idle'), 1500);
    } catch {}
  }

  onMount(() => {
    const myId = yText.doc!.clientID;

    const state = EditorState.create({
      doc: yText.toString(),
      extensions: [
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        cmPlaceholder('Hiii my N*gga !'),
        notebookContentClass,
        EditorView.lineWrapping,

        // Section system
        sectionsField,
        authorResolverFacet.of(resolveAuthor),
        sectionDecorations(myId, resolveAuthor),
        ownershipFilter(myId, {
          onBlocked: (name) => pushToast(`Section verrouillée par ${name} · ton texte va dans une nouvelle section.`, 'info', 2200),
        }),

        // Y.js binding (after our filter so it sees the final transaction)
        yCollab(yText, awareness),

        EditorView.theme({
          '&':            { height: '100%', fontFamily: 'var(--font-body)', fontSize: '15px' },
          '.cm-scroller': { fontFamily: 'var(--font-body)', lineHeight: '1.7', padding: '4px 0 16px' },
          '.cm-content':  { padding: '8px 16px', color: 'var(--navy)', caretColor: 'var(--navy)' },
          '.cm-activeLine':       { background: 'transparent' },
          '.cm-cursor':           { borderLeftColor: 'var(--navy)', borderLeftWidth: '2px' },
          '.cm-selectionBackground, ::selection': { background: 'var(--chartreuse) !important' },
        }, { dark: false }),
      ],
    });

    view = new EditorView({ state, parent: host });

    awareness.on('change', refreshPeers);
    authors.observe(refreshDecorations);
    refreshPeers();
  });

  onDestroy(() => {
    if (awareness) awareness.off('change', refreshPeers);
    if (authors)   authors.unobserve(refreshDecorations);
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
      <h2 class="zone-title">Bloc-notes — sections verrouillées</h2>
      {#if $isOnline}
        <span class="zone-tag">CRDT · ownership par section</span>
      {:else}
        <span class="zone-tag offline">✎ Hors-ligne · sauvegardé localement</span>
      {/if}
    </div>
    <p class="zone-desc">
      Chaque participant a sa propre <strong>section colorée</strong>. Tu peux écrire librement dans la tienne, mais pas modifier celle des autres — toute frappe en zone verrouillée est redirigée vers une nouvelle section à toi.
    </p>

    {#if peers.length > 0}
      <div class="peers">
        <span class="peers-lbl">Participants visibles :</span>
        <span class="peer-chip peer-self" style:--peer-color={safeColor(localIdentity.color)}>
          <span class="peer-dot"></span>{safeName(localIdentity.name)} <span class="tag-self">toi</span>
        </span>
        {#each peers as p (p.id)}
          <span class="peer-chip" style:--peer-color={p.color}>
            <span class="peer-dot"></span>{p.name}
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Editor -->
  <div class="editor">
    <div class="editor-toolbar">
      <span class="tb-meta">
        <span class="tb-key">Markdown</span>
        <span class="tb-dot"></span>
        <span>Tu écris en bas de ta section</span>
      </span>
      <button class="tool-btn copy-all" on:click={copyAll}
              title="Copier tout le bloc-notes (sans marqueurs)" aria-label="Copier tout">
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

    <div class="cm-host" bind:this={host}></div>
  </div>

</div>

<style>
  .notes-zone { display: flex; flex-direction: column; gap: 14px; flex: 1; min-height: 0; }

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
  .zone-desc { font-size: 13px; color: var(--navy-50); line-height: 1.55; margin: 0; max-width: 640px; }

  .peers { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .peers-lbl { font-family: var(--font-mono); font-size: 10px; color: var(--navy-50); letter-spacing: 0.06em; text-transform: uppercase; }
  .peer-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 9px 3px 7px; border-radius: var(--r-pill);
    background: var(--navy-06); font-size: 12px; font-weight: 500; color: var(--navy);
  }
  .peer-chip.peer-self { background: color-mix(in srgb, var(--peer-color) 18%, transparent); }
  .tag-self {
    font-family: var(--font-mono); font-size: 9px;
    background: var(--peer-color); color: white;
    padding: 1px 5px; border-radius: 3px; margin-left: 2px;
  }
  .peer-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--peer-color);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--peer-color) 25%, transparent);
  }

  .editor {
    flex: 1; background: var(--surface);
    border: 1px solid var(--navy-10); border-radius: var(--r-md);
    display: flex; flex-direction: column; min-height: 0; overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .editor-toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--navy-08);
    background: var(--surface-cream-strong, var(--navy-04));
    flex-shrink: 0;
  }
  .tb-meta {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: var(--font-mono); font-size: 11px; color: var(--navy-50);
  }
  .tb-key { font-weight: 600; color: var(--navy-70); }
  .tb-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--navy-25); }

  .tool-btn {
    margin-left: auto;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border: none; background: transparent;
    color: var(--navy-55); cursor: pointer; border-radius: 6px;
    font-size: 12px; font-weight: 500;
    transition: background .15s, color .15s;
  }
  .tool-btn:hover { background: var(--chartreuse); color: var(--accent-ink); }

  .cm-host { flex: 1; min-height: 220px; overflow: auto; }
  :global(.cm-host .cm-editor)         { height: 100%; }
  :global(.cm-host .cm-editor.cm-focused) { outline: none; }
  :global(.cm-host .cm-editor.cm-notebook-has-content .cm-placeholder) { display: none !important; }

  /* ── Marker line — chip rendu via ::before, chars PUA cachés ── */
  :global(.cm-marker-line) {
    position: relative;
    font-size: 0 !important;
    line-height: 0 !important;
    color: transparent !important;
    height: 30px !important;
    margin: 14px 0 6px !important;
    padding: 0 16px !important;
    overflow: visible !important;
  }
  :global(.cm-marker-line::before) {
    content: attr(data-author-name) "  ·  " attr(data-author-tag);
    position: absolute;
    top: 0; left: 16px;
    display: inline-flex; align-items: center;
    height: 30px;
    padding: 0 14px;
    border-radius: 7px 7px 7px 0;
    background: color-mix(in srgb, var(--author-color) 14%, transparent);
    border-left: 3px solid var(--author-color);
    font-family: var(--font-head);
    font-size: 12px; font-weight: 600;
    line-height: 1;
    color: var(--navy);
    letter-spacing: -0.005em;
    white-space: nowrap;
    user-select: none;
  }
  :global(.cm-marker-mine::before) {
    background: color-mix(in srgb, var(--author-color) 22%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--author-color) 40%, transparent);
  }

  /* Remote cursors: quiet editor chrome, visible without badge-like pills. */
  :global(.cm-ySelection) { background-color: color-mix(in srgb, currentColor 8%, transparent) !important; }
  :global(.cm-yLineSelection) { background-color: color-mix(in srgb, currentColor 4%, transparent) !important; }
  :global(.cm-ySelectionCaret) {
    position: relative;
    border-left: 2px solid; margin-left: -1px; margin-right: -1px;
    box-sizing: border-box;
  }
  :global(.cm-ySelectionCaretDot) {
    display: none;
  }
  :global(.cm-ySelectionInfo) {
    position: absolute; top: -14px; left: 0;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
    font-size: 9px; font-weight: 500;
    line-height: 1; user-select: none;
    color: var(--navy-80);
    padding: 2px 5px;
    border-radius: 2px;
    background: var(--surface);
    border: 1px solid currentColor;
    z-index: 101; white-space: nowrap;
    opacity: 0.95 !important;
    transition: opacity .14s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    letter-spacing: -0.01em;
  }
</style>
