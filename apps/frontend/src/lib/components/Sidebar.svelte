<script lang="ts">
  import {
    activeModule, sbCollapsed, participants, isAdmin,
    expiresLabel, type Module
  } from '$lib/stores/room';
  import { questions } from '$lib/stores/qa';
  import { files }     from '$lib/stores/files';
  import PaletteSwitch from './PaletteSwitch.svelte';
  import NetworkBadge from './NetworkBadge.svelte';
  import HeroCard from './HeroCard.svelte';
  import { mode, toggleMode } from '$lib/stores/theme';

  export const roomId: string = '';   // injecté par parent mais pas consommé dans cette vue
  export let onClose: () => void;
  void roomId;

  let copied = false;
  const setMod = (m: Module) => activeModule.set(m);
  const toggle = () => sbCollapsed.update((v) => !v);
</script>

<aside class="sidebar" class:collapsed={$sbCollapsed}>

  <!-- ── Rail (icon-only) ───────────────── -->
  <div class="rail">
    <a href="/" class="rlogo" title="Accueil">C</a>

    <!-- Remonté ici (juste après le logo) — enterré en bas de la pile
         d'icônes sans étiquette, il passait inaperçu ("trop caché"). -->
    <button class="ri theme-ctl theme-ctl-top" on:click={toggleMode} title="Clair / sombre">
      {#if $mode === 'dark'}
        <svg viewBox="0 0 18 18" fill="none">
          <path d="M14.5 10.8A6.3 6.3 0 0 1 7.2 3.5 6.3 6.3 0 1 0 14.5 10.8z"
                stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      {:else}
        <svg viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="3.6" stroke="currentColor" stroke-width="1.5"/>
          <path d="M9 1.6v1.9M9 14.5v1.9M1.6 9h1.9M14.5 9h1.9M3.7 3.7l1.3 1.3M13 13l1.3 1.3M14.3 3.7l-1.3 1.3M5 13l-1.3 1.3"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      {/if}
    </button>

    <div class="rsep"></div>

    <button class="ri rail-toggle" on:click={toggle} title="Afficher / masquer">
      <svg viewBox="0 0 18 18" fill="none">
        <path d="M11 5L7 9l4 4" stroke="currentColor" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <button class="ri" class:on={$activeModule==='notes'} on:click={()=>setMod('notes')} title="Bloc-notes">
      <svg viewBox="0 0 18 18" fill="none">
        <path d="M4 2.5h7L14.5 6v9.5H4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="M10.5 2.5V6h4M6.5 9.5h5M6.5 12h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </button>
    <button class="ri" class:on={$activeModule==='files'} on:click={()=>setMod('files')} title="Fichiers">
      <svg viewBox="0 0 18 18" fill="none">
        <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3l1.5 1.8H14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 14 14.8H4a1.5 1.5 0 0 1-1.5-1.5z"
              stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>
    </button>
    <button class="ri" class:on={$activeModule==='qa'} on:click={()=>setMod('qa')} title="Q&A">
      <svg viewBox="0 0 18 18" fill="none">
        <path d="M9 2.5l2 4 4.5.5-3.2 3 0.9 4.5L9 12.4 4.8 14.5l.9-4.5L2.5 7l4.5-.5z"
              stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      </svg>
    </button>

    <div class="rsep"></div>

    <PaletteSwitch variant="rail" />

    <div class="rspacer"></div>

    <div class="ravatar" title={$isAdmin ? 'Vous · Admin' : 'Vous'}>V</div>
  </div>

  <!-- ── Expanded panel ─────────────────── -->
  <div class="panel">
    <div class="panel-head">
      <span class="sb-brand">Collab<span class="acc"></span></span>
      <button class="collapse" on:click={toggle} title="Réduire le panneau">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.4"/>
          <path d="M6 3v10" stroke="currentColor" stroke-width="1.4"/>
        </svg>
      </button>
    </div>

    <!-- Hero card animée — signature visuelle Collab -->
    <HeroCard />

    <nav class="sb-nav">
      <div class="nav-group">
        <div class="nav-label">Workspace</div>
        <button class="nav-item" class:active={$activeModule==='notes'} on:click={()=>setMod('notes')}>
          <span class="ico">
            <svg viewBox="0 0 18 18" fill="none">
              <path d="M4 2.5h7L14.5 6v9.5H4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
              <path d="M10.5 2.5V6h4M6.5 9.5h5M6.5 12h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="txt">Bloc-notes</span>
        </button>
        <button class="nav-item" class:active={$activeModule==='files'} on:click={()=>setMod('files')}>
          <span class="ico">
            <svg viewBox="0 0 18 18" fill="none">
              <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3l1.5 1.8H14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 14 14.8H4a1.5 1.5 0 0 1-1.5-1.5z"
                    stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="txt">Fichiers partagés</span>
          {#if $files.length > 0}<span class="badge">{$files.length}</span>{/if}
        </button>
        <button class="nav-item" class:active={$activeModule==='qa'} on:click={()=>setMod('qa')}>
          <span class="ico">
            <svg viewBox="0 0 18 18" fill="none">
              <path d="M9 2.5l2 4 4.5.5-3.2 3 0.9 4.5L9 12.4 4.8 14.5l.9-4.5L2.5 7l4.5-.5z"
                    stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="txt">Q&A</span>
          {#if $questions.length > 0}<span class="badge">{$questions.length}</span>{/if}
        </button>
      </div>

      <div class="nav-group">
        <div class="nav-label" style="display:flex; justify-content:space-between; align-items:center;">
          Room
          <NetworkBadge />
        </div>
        <div class="nav-item static">
          <span class="ico">
            <svg viewBox="0 0 18 18" fill="none">
              <circle cx="6.5" cy="6" r="2.4" stroke="currentColor" stroke-width="1.4"/>
              <path d="M2.5 14.5c0-2.2 1.8-3.8 4-3.8s4 1.6 4 3.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M12 4.2a2.2 2.2 0 0 1 0 4.2M13 10.9c1.7.3 2.9 1.7 2.9 3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="txt">Participants</span>
          <span class="meta">{$participants} / 4</span>
        </div>
        <div class="nav-item static">
          <span class="ico">
            <svg viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9.5" r="6.2" stroke="currentColor" stroke-width="1.4"/>
              <path d="M9 6v3.6l2.4 1.6M6.6 1.8h4.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="txt">Expire dans</span>
          <span class="meta">{$expiresLabel}</span>
        </div>
      </div>
    </nav>

    <div class="sb-foot">
      {#if $isAdmin}
        <button class="btn-ghost-danger" on:click={onClose}>Clore la room</button>
        <div class="sb-sep"></div>
      {/if}
      <div class="profile-row">
        <span class="pav">V</span>
        <div class="pmeta">
          <div class="pname">
            Vous
            {#if $isAdmin}<span class="role-chip">ADMIN</span>{/if}
          </div>
          <div class="prole">{$isAdmin ? 'Peut clore · modérer' : 'Participant'}</div>
        </div>
      </div>
    </div>
  </div>
</aside>

<style>
  /* — sidebar — */
  .sidebar {
    width: 320px; flex-shrink: 0; height: 100%;
    display: flex; position: relative; z-index: 3;
    border-right: 1px solid var(--navy-10);
    transition: width .3s cubic-bezier(.4,0,.2,1);
  }
  .sidebar.collapsed { width: 64px; }
  .sidebar.collapsed .panel { width: 0; opacity: 0; pointer-events: none; }

  /* Mobile : remplacée par MobileNav (tab bar bas + sheet) — à 375px, rail+panel
     fixes (320px) ne laissaient que 55px pour le bloc-notes. */
  @media (max-width: 767px) {
    .sidebar { display: none; }
  }
  .rail-toggle :global(svg) { transition: transform .3s cubic-bezier(.4,0,.2,1); }
  .sidebar.collapsed .rail-toggle :global(svg) { transform: rotate(180deg); }

  /* — rail unifié avec panel (pas de border entre) — */
  .rail {
    width: 64px; flex-shrink: 0; height: 100%;
    background: var(--paper);
    border-right: 1px solid var(--navy-08);
    display: flex; flex-direction: column; align-items: center;
    padding: 18px 0 16px; gap: 4px;
  }
  .rlogo {
    width: 38px; height: 38px; border-radius: 11px; background: var(--brand);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-head); font-weight: 700; font-size: 18px; color: var(--paper);
    margin-bottom: 8px; position: relative; text-decoration: none;
  }
  .rlogo::after {
    content: ""; position: absolute; right: 6px; bottom: 6px;
    width: 5px; height: 5px; border-radius: 50%; background: var(--chartreuse);
  }
  .ri {
    width: 42px; height: 42px; border-radius: var(--r-pill);
    display: flex; align-items: center; justify-content: center;
    color: var(--navy-50); cursor: pointer; border: none; background: transparent;
    transition: background .18s ease, color .18s ease;
  }
  .ri svg { width: 19px; height: 19px; }
  .ri:hover { background: var(--navy-04); color: var(--navy); }
  .ri.on {
    background: var(--navy);
    color: var(--paper);
  }
  :global(body.theme-dark) .ri.on {
    background: var(--surface-cream-strong);
    color: var(--navy);
  }
  /* Distingue le bouton thème du reste des icônes (sinon il s'y noie) —
     léger fond + couleur pleine au lieu du gris passe-partout de .ri. */
  .theme-ctl-top {
    background: var(--chartreuse); color: var(--accent-ink);
  }
  .theme-ctl-top:hover { background: var(--chartreuse); opacity: 0.85; }

  .rsep { width: 24px; height: 1px; background: var(--navy-10); margin: 8px 0; }
  .rspacer { flex: 1; }
  .ravatar {
    width: 36px; height: 36px; border-radius: 50%; background: #95B1EE;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-head); font-weight: 700; font-size: 14px;
    color: var(--navy); cursor: pointer;
  }

  /* — panel unifié avec rail (même bg) — */
  .panel {
    width: 256px; flex-shrink: 0; height: 100%;
    background: var(--surface);
    display: flex; flex-direction: column; overflow: hidden;
    transition: width .3s cubic-bezier(.4,0,.2,1), opacity .22s ease;
  }
  .panel-head {
    padding: 16px 16px 12px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--navy-08);
    margin-bottom: 8px;
  }
  .sb-brand {
    font-family: var(--font-head); font-weight: 700; font-size: 19px;
    color: var(--navy); display: inline-flex; align-items: baseline; gap: 2px;
  }
  .sb-brand .acc {
    width: 6px; height: 6px; border-radius: 50%; background: var(--chartreuse);
  }
  .collapse {
    width: 28px; height: 28px; border-radius: 7px;
    border: none; background: transparent; color: var(--navy-40); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .collapse:hover { background: var(--navy-06); color: var(--navy); }

  /* nav (Premium pill pattern) */
  .sb-nav {
    padding: 20px 16px; flex: 1; overflow-y: auto;
    scrollbar-width: none; /* Firefox */
  }
  .sb-nav::-webkit-scrollbar { display: none; } /* Chrome/Safari */

  .nav-group + .nav-group { margin-top: 28px; }
  .nav-label {
    font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--navy-40); font-weight: 600; padding: 0 16px 12px;
  }
  .nav-item {
    display: flex; align-items: center; gap: 14px;
    padding: 10px 16px; border-radius: var(--r-pill);
    color: var(--navy-60); font-size: 14.5px; font-weight: 500;
    cursor: pointer; min-height: 44px;
    transition: background .18s ease, color .18s ease;
    margin-bottom: 4px;
    border: none; background: transparent; width: 100%; text-align: left;
  }
  .nav-item:hover { background: var(--navy-04); color: var(--navy); }
  .nav-item.static { cursor: default; }
  .nav-item.static:hover { background: transparent; color: var(--navy-60); }
  .nav-item .ico { width: 20px; height: 20px; flex-shrink: 0; color: var(--navy-50); display: inline-flex; }
  .nav-item .txt { flex: 1; }
  .nav-item .meta { font-family: var(--font-mono); font-size: 12px; color: var(--navy-40); }
  .nav-item .badge {
    background: var(--navy-08); color: var(--navy-70);
    font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: var(--r-pill);
  }
  
  .nav-item.active {
    background: var(--navy);
    color: var(--paper); font-weight: 600;
  }
  .nav-item.active .ico { color: var(--paper); }
  .nav-item.active .badge { background: var(--chartreuse); color: var(--accent-ink); }

  :global(body.theme-dark) .nav-item.active {
    background: var(--surface-cream-strong); color: var(--navy);
  }
  :global(body.theme-dark) .nav-item.active .ico { color: var(--navy); }

  /* footer */
  .sb-foot { padding: 10px 14px 14px; }
  .sb-sep { height: 1px; background: var(--navy-08); margin: 4px 4px 12px; }
  .profile-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: var(--r-md); cursor: pointer;
    transition: background .15s;
  }
  .profile-row:hover { background: var(--navy-04); }
  .pav {
    width: 34px; height: 34px; border-radius: 50%; background: #95B1EE;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-head); font-weight: 700; font-size: 14px;
    color: var(--navy); flex-shrink: 0;
  }
  .pmeta { flex: 1; min-width: 0; }
  .pname {
    font-size: 13.5px; font-weight: 600; color: var(--navy);
    display: flex; align-items: center; gap: 7px;
  }
  .prole { font-size: 11px; color: var(--navy-60); margin-top: 1px; }
  .role-chip {
    font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
    padding: 1px 7px; border-radius: var(--r-pill);
    background: var(--chartreuse); color: var(--accent-ink);
  }
</style>
