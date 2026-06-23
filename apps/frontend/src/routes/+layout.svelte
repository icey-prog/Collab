<script lang="ts">
  import '../app.css';
  import { mode, palette } from '$lib/stores/theme';
  import { onMount } from 'svelte';
  import { onBackendFailed, openLogFile, isTauri, startBackend, isBackendRunning } from '$lib/tauri';

  // SvelteKit 2 may inject data/params/form on the layout — declare as const to absorb without warning
  export const data: unknown = undefined;
  export const params: Record<string, string> | undefined = undefined;
  export const form: unknown = undefined;
  void data; void params; void form;

  let backendError: string | null = null;
  let backendBooting = false;

  onMount(async () => {
    onBackendFailed((err) => {
      backendError = err;
    });

    // B11 fix : démarre le sidecar dès le chargement initial, pas juste sur /host.
    // Sans ça, l'utilisateur qui atterrit sur "/" ne voit jamais le sidecar
    // démarrer → fetch /api/* → ERR_CONNECTION_REFUSED.
    if (isTauri()) {
      const running = await isBackendRunning();
      if (!running) {
        backendBooting = true;
        const ok = await startBackend();
        backendBooting = false;
        if (ok === null) {
          backendError = 'Le moteur local n\'a pas démarré (invoke start_backend a retourné null).\n\nCauses fréquentes :\n• Antivirus (Avast CyberCapture, McAfee) bloque collab-backend.exe\n• Port 47931 occupé par un zombie d\'une session précédente\n• Manque de droits écriture sur le dossier de l\'app\n\nVérifiez %LOCALAPPDATA%\\Collab\\collab-backend.log pour détails.';
        }
      }
    }
  });

  $: if (typeof document !== 'undefined') {
    document.body.classList.toggle('theme-dark', $mode === 'dark');
    document.body.classList.remove('theme-b', 'theme-c', 'theme-d');
    if ($palette !== 'a') document.body.classList.add(`theme-${$palette}`);
  }
</script>

<!-- A11y skip link (Lot I) — visible only when focused, jumps past chrome to content -->
<a class="skip-link" href="#main-content">Aller au contenu</a>

{#if backendBooting}
  <div class="boot-overlay">
    <div class="boot-content">
      <div class="boot-spinner"></div>
      <p>Démarrage du moteur local…</p>
      <p class="boot-sub">Cela peut prendre quelques secondes au premier lancement.</p>
    </div>
  </div>
{/if}

{#if backendError}
  <div class="backend-error-overlay">
    <div class="backend-error-modal">
      <h2>Erreur Système</h2>
      <p>Le moteur local n'a pas pu démarrer.</p>
      <pre>{backendError}</pre>
      <p class="help-text">
        Si vous voyez une erreur "Accès refusé" ou "os error 5", il est très probable que Windows Defender (ou votre antivirus) bloque le fichier.
        Veuillez ajouter une exception pour le dossier d'installation de l'application.
      </p>
      <div class="actions">
        <button class="primary-btn" on:click={() => openLogFile()}>Ouvrir les logs</button>
        <button class="secondary-btn" on:click={() => backendError = null}>Fermer</button>
      </div>
    </div>
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

  .boot-overlay {
    position: fixed; inset: 0;
    background: var(--paper);
    z-index: 9998;
    display: flex; align-items: center; justify-content: center;
  }
  .boot-content { text-align: center; max-width: 360px; }
  .boot-spinner {
    width: 44px; height: 44px;
    border: 3px solid var(--navy-10);
    border-top-color: var(--navy);
    border-radius: 50%;
    margin: 0 auto 18px;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .boot-content p { color: var(--navy-70); font-size: 15px; margin: 0 0 8px; }
  .boot-content .boot-sub { color: var(--navy-45); font-size: 12px; }

  :global(body.theme-dark) .backend-error-modal {
    background: var(--bg-1, #1e1e1e);
    color: var(--text-1, #eee);
  }
  :global(body.theme-dark) .backend-error-modal pre {
    background: #000; color: #ccc;
  }
  .backend-error-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.8);
    z-index: 10000;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .backend-error-modal {
    background: var(--bg-1, #fff);
    color: var(--text-1, #000);
    padding: 24px; border-radius: 12px;
    max-width: 600px; width: 100%;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }
  .backend-error-modal h2 { margin-top: 0; color: #d32f2f; }
  .backend-error-modal pre {
    background: #f1f1f1; padding: 12px; border-radius: 6px;
    overflow-x: auto; font-size: 13px; color: #333;
    white-space: pre-wrap; word-wrap: break-word;
  }
  .backend-error-modal .help-text { font-size: 14px; opacity: 0.8; margin-bottom: 20px; }
  .backend-error-modal .actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
  .backend-error-modal button {
    border: none; padding: 10px 16px; border-radius: 6px;
    cursor: pointer; font-weight: 600;
    transition: background-color 0.2s ease, transform 0.1s ease;
  }
  .backend-error-modal button:active {
    transform: scale(0.98);
  }
  .backend-error-modal button.primary-btn {
    background: #d32f2f; color: white;
  }
  .backend-error-modal button.primary-btn:hover {
    background: #b71c1c;
  }
  .backend-error-modal button.secondary-btn {
    background: var(--accent, #364C84); color: white;
  }
  .backend-error-modal button.secondary-btn:hover {
    background: #2a3c6b;
  }
</style>
