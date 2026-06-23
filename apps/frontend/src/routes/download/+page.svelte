<script lang="ts">
  import { onMount } from 'svelte';

  type OS = 'windows' | 'mac' | 'linux' | 'android' | 'ios' | 'unknown';

  let os: OS = 'unknown';
  let canInstallPWA = false;
  let installed = false;
  let installPrompt: BeforeInstallPromptEvent | null = null;
  let copied = false;

  // BeforeInstallPromptEvent typing (Chrome/Edge desktop + Android)
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }

  function detectOS(): OS {
    if (typeof navigator === 'undefined') return 'unknown';
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    if (/win/i.test(navigator.platform)) return 'windows';
    if (/mac/i.test(navigator.platform)) return 'mac';
    if (/linux/i.test(navigator.platform)) return 'linux';
    return 'unknown';
  }

  function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }

  async function triggerInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      installed = true;
    }
    installPrompt = null;
    canInstallPWA = false;
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {}
  }

  onMount(() => {
    os = detectOS();
    installed = isStandalone();

    const onPrompt = (e: Event) => {
      e.preventDefault();
      installPrompt = e as BeforeInstallPromptEvent;
      canInstallPWA = true;
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  });

  // Portable ZIP buildé via Tauri (apps/desktop). Inclut Collab.exe + sidecar Node.
  const WIN_EXE_URL = '/downloads/Collab-Portable-x64.zip';
  const WIN_EXE_AVAILABLE = true;
  const WIN_EXE_SIZE_MB = 77;
  const WIN_EXE_LABEL = 'Télécharger pour Windows (portable .zip, 77 Mo)';
</script>

<svelte:head>
  <title>Installer Collab</title>
  <meta name="description" content="Installer Collab sur ton appareil — PWA mobile ou application Windows." />
</svelte:head>

<div class="page">
  <header class="hero">
    <a class="back" href="/" aria-label="Retour à l'accueil">← Accueil</a>
    <h1>Installer Collab</h1>
    <p class="lead">
      Installe l'app sur ton appareil pour un accès rapide, hors-ligne partiel,
      et le mode plein écran.
    </p>
  </header>

  {#if installed}
    <div class="card ok">
      <div class="ok-ico">✓</div>
      <h2>Déjà installé</h2>
      <p>Tu utilises actuellement Collab en mode standalone. Tout est bon.</p>
      <a href="/" class="btn btn-primary">Ouvrir l'app</a>
    </div>
  {:else}
    <!-- Plateforme détectée — option principale -->
    <section class="card primary-card">
      <div class="os-badge">
        {#if os === 'windows'}🪟 Windows{/if}
        {#if os === 'mac'}🍎 macOS{/if}
        {#if os === 'linux'}🐧 Linux{/if}
        {#if os === 'android'}🤖 Android{/if}
        {#if os === 'ios'}📱 iOS{/if}
        {#if os === 'unknown'}🌐 Web{/if}
      </div>

      {#if os === 'windows'}
        <h2>Application Windows</h2>
        <p>Version portable. Dézippe l'archive, double-clique sur <code>Collab.exe</code> et c'est parti — pas d'installation.</p>
        {#if WIN_EXE_AVAILABLE}
          <a href={WIN_EXE_URL} class="btn btn-primary" download>
            {WIN_EXE_LABEL}
          </a>
          <p class="note">Binaire non signé (MVP) — au premier lancement Windows SmartScreen affichera "Éditeur inconnu", clique <em>Informations complémentaires → Exécuter quand même</em>.</p>
        {:else}
          <p class="soon">⚠ Build en cours — disponible bientôt.</p>
          <p class="alt">En attendant, installe la version web :</p>
        {/if}
      {/if}

      {#if os === 'mac' || os === 'linux'}
        <h2>Installer la version web</h2>
        <p>L'app fonctionne aussi très bien depuis Chrome / Edge / Brave en mode standalone.</p>
      {/if}

      {#if os === 'android'}
        <h2>Installer sur Android</h2>
        <p>Chrome / Brave : menu ⋮ → <strong>Installer l'application</strong>. L'icône apparaît sur ton écran d'accueil.</p>
      {/if}

      {#if os === 'ios'}
        <h2>Installer sur iPhone / iPad</h2>
        <p>Safari : appuie sur <strong>Partager</strong> ↗ puis <strong>Sur l'écran d'accueil</strong>. L'icône Collab s'ajoute.</p>
      {/if}

      <!-- Bouton PWA si dispo -->
      {#if canInstallPWA}
        <button class="btn btn-primary" on:click={triggerInstall}>
          Installer maintenant
        </button>
      {:else if os === 'android' || os === 'mac' || os === 'linux' || (os === 'windows' && !WIN_EXE_AVAILABLE)}
        <a href="/" class="btn btn-ghost">Ouvrir l'app dans le navigateur</a>
        <p class="hint">→ Puis utilise le menu du navigateur pour "Installer Collab".</p>
      {/if}
    </section>

    <!-- Alternative : partager le lien à un autre appareil -->
    <section class="card share-card">
      <h3>Tester depuis un autre appareil ?</h3>
      <p>Copie le lien et ouvre-le sur ton téléphone ou tablette.</p>
      <div class="url-row">
        <code>{typeof window !== 'undefined' ? window.location.origin : ''}</code>
        <button class="btn btn-ghost btn-sm" on:click={copyShareLink}>
          {copied ? '✓ Copié' : 'Copier'}
        </button>
      </div>
    </section>
  {/if}

  <footer class="meta">
    <p>
      Pas envie d'installer ? <a href="/">Va directement sur l'app.</a> Aucune
      donnée n'est conservée plus de 4 h (rooms) ou 24 h (fichiers).
    </p>
  </footer>
</div>

<style>
  .page {
    max-width: 640px; margin: 0 auto; padding: 48px 24px 96px;
    font-family: var(--font-body);
  }
  .hero { text-align: center; margin-bottom: 36px; }
  .back {
    display: inline-block; color: var(--navy-55);
    text-decoration: none; font-size: 13px; margin-bottom: 20px;
  }
  .back:hover { color: var(--navy); }
  h1 {
    font-family: var(--font-head); font-size: 38px; font-weight: 700;
    margin: 0 0 12px; letter-spacing: -0.02em; color: var(--navy);
  }
  .lead {
    color: var(--navy-65); font-size: 15px; line-height: 1.55;
    margin: 0 auto; max-width: 460px;
  }

  .card {
    background: var(--surface); border: 1px solid var(--navy-10);
    border-radius: 14px; padding: 28px;
    margin-bottom: 18px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .primary-card { padding: 32px 28px; }
  .os-badge {
    display: inline-block;
    font-family: var(--font-mono); font-size: 11px;
    color: var(--navy-55); background: var(--navy-06);
    padding: 4px 10px; border-radius: 6px;
    margin-bottom: 16px;
    letter-spacing: 0.04em; text-transform: uppercase;
  }
  h2 {
    font-family: var(--font-head); font-size: 22px; font-weight: 600;
    margin: 0 0 8px; color: var(--navy); letter-spacing: -0.01em;
  }
  h3 {
    font-family: var(--font-head); font-size: 16px; font-weight: 600;
    margin: 0 0 6px; color: var(--navy);
  }
  .card p { color: var(--navy-65); font-size: 14px; line-height: 1.55; margin: 0 0 16px; }

  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 22px; border-radius: 10px;
    font-family: var(--font-body); font-size: 14px; font-weight: 600;
    text-decoration: none; cursor: pointer; border: none;
    transition: transform .12s, box-shadow .15s, background .15s;
    min-height: 44px;
  }
  .btn:active { transform: translateY(1px); }
  .btn-primary { background: var(--chartreuse); color: var(--accent-ink); }
  .btn-primary:hover { box-shadow: 0 4px 14px color-mix(in srgb, var(--chartreuse) 50%, transparent); }
  .btn-ghost {
    background: var(--navy-06); color: var(--navy);
  }
  .btn-ghost:hover { background: var(--navy-10); }
  .btn-sm { padding: 6px 12px; font-size: 12px; min-height: 32px; }

  .note { font-size: 12px; color: var(--navy-50); margin-top: 10px; }
  .soon { font-size: 13px; color: var(--navy-70); padding: 10px 12px; background: var(--navy-04); border-radius: 8px; }
  .alt { font-size: 13px; color: var(--navy-65); margin-top: 14px !important; }
  .hint { font-size: 12px; color: var(--navy-50); margin-top: 10px; }

  .ok { text-align: center; }
  .ok-ico {
    width: 56px; height: 56px; margin: 0 auto 16px;
    background: var(--chartreuse); color: var(--accent-ink);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 28px; font-weight: 700;
  }

  .share-card { background: var(--navy-04); border-style: dashed; }
  .url-row {
    display: flex; align-items: center; gap: 10px;
    background: var(--surface); border: 1px solid var(--navy-10);
    border-radius: 8px; padding: 8px 10px;
  }
  .url-row code {
    flex: 1; font-family: var(--font-mono); font-size: 12px; color: var(--navy);
    word-break: break-all;
  }

  .meta {
    text-align: center; margin-top: 28px;
    font-size: 12px; color: var(--navy-50);
  }
  .meta a { color: var(--navy-70); }

  @media (max-width: 480px) {
    .page { padding: 32px 16px 80px; }
    h1 { font-size: 30px; }
    .card { padding: 22px 18px; }
  }
</style>
