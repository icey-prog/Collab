<script lang="ts">
  import { activeModule, sbCollapsed, participants, isAdmin, expiresLabel, type Module } from '$lib/stores/room';
  import { questions } from '$lib/stores/qa';
  import { files } from '$lib/stores/files';
  import PaletteSwitch from './PaletteSwitch.svelte';
  import NetworkBadge from './NetworkBadge.svelte';
  import { mode, toggleMode } from '$lib/stores/theme';

  export let onClose: () => void;

  const setMod = (m: Module) => { activeModule.set(m); sheetOpen = false; };

  // Bottom sheet — regroupe le secondaire (palette, thème, room info, admin)
  // pattern iOS/Android : tab bar garde les 3 destinations principales,
  // le reste passe dans un sheet à la demande (pas de 5e/6e onglet cryptique).
  let sheetOpen = false;
  const closeSheet = () => (sheetOpen = false);
</script>

<!-- Bottom tab bar — pilule flottante glass, 3 destinations + Plus,
     cible tactile ≥48px. Reste dans le flux (pas de position:fixed) pour
     éviter le bug de collision déjà rencontré avec le footer landing. -->
<nav class="mobile-tabbar" aria-label="Navigation room">
  <div class="pill">
    <button class="tab-btn" class:active={$activeModule === 'notes'} on:click={() => setMod('notes')}>
      <span class="tab-ico">
        <svg viewBox="0 0 18 18" fill="none">
          <path d="M4 2.5h7L14.5 6v9.5H4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          <path d="M10.5 2.5V6h4M6.5 9.5h5M6.5 12h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="tab-txt">Notes</span>
    </button>

    <button class="tab-btn" class:active={$activeModule === 'files'} on:click={() => setMod('files')}>
      <span class="tab-ico">
        <svg viewBox="0 0 18 18" fill="none">
          <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3l1.5 1.8H14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 14 14.8H4a1.5 1.5 0 0 1-1.5-1.5z"
                stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
        {#if $files.length > 0}<span class="tab-badge">{$files.length}</span>{/if}
      </span>
      <span class="tab-txt">Fichiers</span>
    </button>

    <button class="tab-btn" class:active={$activeModule === 'qa'} on:click={() => setMod('qa')}>
      <span class="tab-ico">
        <svg viewBox="0 0 18 18" fill="none">
          <path d="M9 2.5l2 4 4.5.5-3.2 3 0.9 4.5L9 12.4 4.8 14.5l.9-4.5L2.5 7l4.5-.5z"
                stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        </svg>
        {#if $questions.length > 0}<span class="tab-badge">{$questions.length}</span>{/if}
      </span>
      <span class="tab-txt">Q&amp;A</span>
    </button>

    <button class="tab-btn" on:click={() => (sheetOpen = true)} aria-label="Plus d'options">
      <span class="tab-ico">
        <svg viewBox="0 0 18 18" fill="none">
          <circle cx="4" cy="9" r="1.4" fill="currentColor"/>
          <circle cx="9" cy="9" r="1.4" fill="currentColor"/>
          <circle cx="14" cy="9" r="1.4" fill="currentColor"/>
        </svg>
      </span>
      <span class="tab-txt">Plus</span>
    </button>
  </div>
</nav>

<!-- Bottom sheet — infos room + réglages, hors du flux tab bar -->
{#if sheetOpen}
  <div class="sheet-backdrop" on:click={closeSheet} role="presentation"></div>
  <div class="sheet" role="dialog" aria-label="Options">
    <div class="sheet-handle"></div>

    <div class="sheet-row">
      <span class="sheet-label">Participants</span>
      <span class="sheet-val">{$participants} / 4</span>
    </div>
    <div class="sheet-row">
      <span class="sheet-label">Expire dans</span>
      <span class="sheet-val">{$expiresLabel}</span>
    </div>
    <div class="sheet-row">
      <span class="sheet-label">Réseau</span>
      <NetworkBadge />
    </div>

    <div class="sheet-sep"></div>

    <div class="sheet-row palette-row">
      <PaletteSwitch />
    </div>
    <button class="sheet-item" on:click={toggleMode}>
      {$mode === 'dark' ? 'Passer en clair' : 'Passer en sombre'}
    </button>

    {#if $isAdmin}
      <div class="sheet-sep"></div>
      <button class="sheet-item danger" on:click={() => { closeSheet(); onClose(); }}>
        Clore la room
      </button>
    {/if}
  </div>
{/if}

<style>
  /* Fixed + flottante : pour qu'un vrai effet glass soit visible, la pilule
     doit survoler du contenu qui défile en-dessous (sinon backdrop-filter
     n'a rien à flouter). Le contenu (.module) réserve l'espace correspondant
     via padding-bottom — pas de collision (cf. bug footer landing précédent). */
  .mobile-tabbar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 300;
    display: flex; justify-content: center;
    padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
    pointer-events: none;
  }
  .mobile-tabbar .pill { pointer-events: auto; }
  /* Desktop : Sidebar reprend la navigation, la tab bar disparaît. */
  @media (min-width: 768px) {
    .mobile-tabbar { display: none; }
  }

  .pill {
    display: flex; align-items: stretch;
    width: 100%; max-width: 420px; height: 60px;
    border-radius: 30px;
    background: color-mix(in srgb, var(--surface) 68%, transparent);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid var(--navy-10);
    box-shadow: 0 8px 28px rgba(27,36,69,0.14), 0 1px 2px rgba(27,36,69,0.06);
  }

  .tab-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px; min-height: 48px;
    border: none; background: transparent; color: var(--navy-45);
    cursor: pointer;
  }
  .tab-btn:first-child { border-radius: 30px 0 0 30px; }
  .tab-btn:last-child  { border-radius: 0 30px 30px 0; }
  .tab-btn.active { color: var(--navy); }
  .tab-ico { width: 20px; height: 20px; position: relative; }
  .tab-ico svg { width: 100%; height: 100%; }
  .tab-txt { font-size: 10.5px; font-weight: 600; letter-spacing: 0.01em; line-height: 1; }
  .tab-badge {
    position: absolute; top: -4px; right: -8px;
    background: var(--chartreuse); color: var(--accent-ink);
    font-size: 9px; font-weight: 700; min-width: 14px; height: 14px;
    border-radius: 7px; display: flex; align-items: center; justify-content: center;
    padding: 0 3px; line-height: 1;
  }

  .sheet-backdrop {
    position: fixed; inset: 0; background: rgba(27,36,69,0.35);
    z-index: 400; animation: fadeIn .18s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 401;
    background: var(--surface);
    border-radius: 18px 18px 0 0;
    padding: 10px 20px calc(20px + env(safe-area-inset-bottom));
    box-shadow: 0 -8px 32px rgba(27,36,69,0.18);
    animation: slideUp .22s cubic-bezier(.2,.8,.3,1);
  }
  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

  .sheet-handle {
    width: 36px; height: 4px; border-radius: 2px;
    background: var(--navy-15); margin: 0 auto 16px;
  }
  .sheet-row {
    display: flex; align-items: center; justify-content: space-between;
    min-height: 40px; font-size: 14px;
  }
  .sheet-label { color: var(--navy-55); }
  .palette-row { justify-content: flex-start; }
  .sheet-val { font-family: var(--font-mono); font-size: 13px; color: var(--navy); }
  .sheet-sep { height: 1px; background: var(--navy-08); margin: 10px 0; }
  .sheet-item {
    width: 100%; text-align: left; min-height: 44px;
    border: none; background: transparent; color: var(--navy);
    font-size: 14px; font-weight: 500; cursor: pointer;
  }
  .sheet-item.danger { color: #B05656; }

  @media (min-width: 768px) {
    .sheet-backdrop, .sheet { display: none; }
  }
</style>
