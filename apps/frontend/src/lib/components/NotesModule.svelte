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
          '.cm-cursor':           { borderLeftColor: 'var(--cm-cursor-color, var(--navy))', borderLeftWidth: '2px' },
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

    <div class="cm-host" bind:this={host}
         style="--cm-cursor-color: {safeColor(localIdentity.color)};"></div>
  </div>

</div>

<style>
  .notes-zone { display: flex; flex-direction: column; gap: 14px; flex: 1; min-height: 0; }

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

  /* ── Marker line — invisible, juste les chars PUA cachés.
     Pas de chip ("pseudo · toi/verrouillé") : seul le curseur Y.js inline
     identifie qui écrit où. ── */
  :global(.cm-marker-line) {
    font-size: 0 !important;
    line-height: 0 !important;
    color: transparent !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
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
  /* Le caret parent (.cm-ySelectionCaret) pose background-color/border-color
     inline = couleur de l'auteur. On laisse le badge hériter ce fond (au lieu
     de le neutraliser) pour que le pseudo soit identifiable d'un coup d'œil.
     !important nécessaire : le baseTheme de y-codemirror.next a la même
     spécificité et est injecté après notre style. */
  :global(.cm-ySelectionInfo) {
    position: absolute; top: -15px; left: 0;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
    font-size: 10px !important; font-weight: 600;
    line-height: 1 !important; user-select: none;
    color: white !important;
    padding: 2px 6px !important;
    border-radius: 3px;
    background: inherit !important;
    border: none !important;
    z-index: 101; white-space: nowrap;
    opacity: 1 !important;
    transition: opacity .14s ease;
    box-shadow: 0 1px 4px rgba(0,0,0,0.18);
    letter-spacing: -0.01em;
  }
</style>
