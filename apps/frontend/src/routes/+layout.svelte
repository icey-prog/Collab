<script lang="ts">
  import '../app.css';
  import { mode, palette } from '$lib/stores/theme';
  import { isOnline } from '$lib/stores/network';

  // SvelteKit 2 may inject data/params/form on the layout
  export const data: unknown = undefined;
  export const params: Record<string, string> | undefined = undefined;
  export const form: unknown = undefined;
  void data; void params; void form;

  $: if (typeof document !== 'undefined') {
    document.body.classList.toggle('theme-dark', $mode === 'dark');
    document.body.classList.remove('theme-b', 'theme-c', 'theme-d');
    if ($palette !== 'a') document.body.classList.add(`theme-${$palette}`);
  }
</script>

<a class="skip-link" href="#main-content">Aller au contenu</a>

{#if !$isOnline}
  <div class="offline-banner" role="alert" aria-live="polite">
    <span class="offline-dot" aria-hidden="true"></span>
    Hors ligne — les rooms nécessitent une connexion internet
  </div>
{/if}

<slot />

<style>
  .skip-link {
    position: fixed;
    top: -100px; left: 12px; z-index: 9999;
    background: var(--chartreuse, #E7F1A8);
    color: var(--accent-ink, #364C84);
    padding: 12px 18px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    text-decoration: none;
    transition: top .2s ease;
  }
  .skip-link:focus { top: 12px; outline: 2px solid var(--navy, #364C84); outline-offset: 2px; }

  .offline-banner {
    position: fixed; top: 0; left: 0; right: 0;
    background: #B05656; color: #fff;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 8px 16px;
    font-size: 13px; font-weight: 500;
    z-index: 9999;
    animation: slideDown .25s ease;
  }
  @keyframes slideDown { from { transform: translateY(-100%); } to { transform: none; } }

  .offline-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: rgba(255,255,255,0.55);
    flex-shrink: 0;
  }
</style>
