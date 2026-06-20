<script lang="ts">
  /**
   * Pourquoi : sur Windows, ouvrir un point d'accès mobile (hotspot) permet à
   * d'autres appareils de rejoindre la room SANS internet ni Wi-Fi externe.
   * On ne peut pas l'activer programmatiquement sans UAC — donc on guide l'user
   * vers le panneau Settings via le scheme ms-settings: (zéro permission).
   *
   * Cross-platform : sur Mac/Linux le bouton affiche les instructions adaptées.
   */
  import { onMount } from 'svelte';

  let isWindows = false;
  let isMac     = false;
  let dismissed = false;

  onMount(() => {
    if (typeof navigator === 'undefined') return;
    const ua = navigator.userAgent;
    isWindows = /Windows/i.test(ua);
    isMac     = /Macintosh|Mac OS/i.test(ua);
    try { dismissed = sessionStorage.getItem('collab.hotspot-dismissed') === '1'; } catch {}
  });

  function openSettings() {
    if (isWindows) {
      // ms-settings: scheme — zero permission, ouvre direct le panneau
      window.location.href = 'ms-settings:network-mobilehotspot';
    } else if (isMac) {
      // Mac : System Settings → Sharing → Internet Sharing
      window.location.href = 'x-apple.systempreferences:com.apple.preferences.sharing';
    }
  }

  function dismiss() {
    dismissed = true;
    try { sessionStorage.setItem('collab.hotspot-dismissed', '1'); } catch {}
  }
</script>

{#if !dismissed}
  <div class="hotspot-hint" role="note">
    <div class="hh-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
        <path d="M12 17.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M7.8 13.3a6 6 0 0 1 8.4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M4.5 10.5a10 10 0 0 1 15 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </div>
    <div class="hh-body">
      <p class="hh-title">Pas de Wi-Fi ?</p>
      <p class="hh-text">
        {#if isWindows}
          Active le <strong>point d'accès mobile Windows</strong> — les autres appareils s'y connectent et scannent le QR.
        {:else if isMac}
          Active le <strong>partage Internet macOS</strong> via Réglages → Partage.
        {:else}
          Active un <strong>point d'accès mobile</strong> sur ton téléphone, puis connectes-y les autres appareils.
        {/if}
      </p>
    </div>
    <div class="hh-actions">
      {#if isWindows || isMac}
        <button class="hh-btn primary" on:click={openSettings}>
          Activer
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M6 3h7v7M13 3 4 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      {/if}
      <button class="hh-btn ghost" on:click={dismiss} aria-label="Masquer">✕</button>
    </div>
  </div>
{/if}

<style>
  .hotspot-hint {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px;
    background: var(--surface-cream-strong, #FFF8E0);
    border: 1px solid var(--chartreuse);
    border-radius: var(--r-md);
    margin-top: 16px;
    max-width: 380px;
    animation: slideUp .4s cubic-bezier(.2,.8,.3,1) both;
  }
  @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

  .hh-icon {
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--chartreuse); color: var(--accent-ink);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .hh-body { flex: 1; min-width: 0; }
  .hh-title { font-size: 13px; font-weight: 600; color: var(--navy); margin: 0 0 2px; }
  .hh-text  { font-size: 12px; color: var(--navy-60); margin: 0; line-height: 1.45; }

  .hh-actions { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }
  .hh-btn {
    border: none; cursor: pointer; padding: 6px 10px;
    border-radius: 6px; font-size: 12px; font-weight: 600;
    display: inline-flex; align-items: center; gap: 4px;
    min-height: 32px;
  }
  .hh-btn.primary { background: var(--navy); color: var(--paper); }
  .hh-btn.primary:hover { background: var(--accent-ink, #1B2445); }
  .hh-btn.ghost { background: transparent; color: var(--navy-40); padding: 4px 8px; min-height: 28px; }
  .hh-btn.ghost:hover { color: var(--navy); background: var(--navy-06); }
</style>
