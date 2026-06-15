<script lang="ts">
  import ChromeTR from '$lib/components/ChromeTR.svelte';
</script>

<svelte:head>
  <title>Confidentialité — Collab</title>
  <meta name="description" content="Politique de confidentialité Collab : aucune donnée persistée plus de 4h, anonymat par défaut, pas de tracker." />
</svelte:head>

<div class="page noise">
  <ChromeTR />
  <a href="/" class="spec-home"><span class="acc"></span> Collab</a>

  <main id="main-content">
    <header class="hero">
      <span class="eyebrow">Confidentialité · Courte et vraie</span>
      <h1>
        On garde <span class="hl">presque rien</span>.<br>
        Et pas longtemps.
      </h1>
      <p class="lead">
        Cette page n'est pas un copier-coller juridique. C'est une description
        honnête de ce que Collab fait avec vos données. Tout est implémenté
        dans le code, vérifiable.
      </p>
    </header>

    <!-- TL;DR -->
    <div class="tldr">
      <div class="tldr-row">
        <span class="tldr-key">TTL</span>
        <span class="tldr-val">4h max sur tout</span>
      </div>
      <div class="tldr-row">
        <span class="tldr-key">Compte</span>
        <span class="tldr-val">Aucun. Jamais.</span>
      </div>
      <div class="tldr-row">
        <span class="tldr-key">Tracker</span>
        <span class="tldr-val">Zéro</span>
      </div>
      <div class="tldr-row">
        <span class="tldr-key">Cookie</span>
        <span class="tldr-val">1 seul, fonctionnel</span>
      </div>
    </div>

    <section>
      <h2><span class="num">01</span> Ce qu'on garde, et combien de temps</h2>
      <table class="tbl">
        <thead>
          <tr><th>Donnée</th><th>Stockée où</th><th>Durée</th></tr>
        </thead>
        <tbody>
          <tr><td>Texte du bloc-notes</td><td>Redis (RAM serveur)</td><td>4h max</td></tr>
          <tr><td>Questions Q&amp;A</td><td>Redis</td><td>4h max</td></tr>
          <tr><td>Fichiers uploadés</td><td>Cloudflare R2</td><td>24h max</td></tr>
          <tr><td>Cookie admin (créateur)</td><td>Votre navigateur</td><td>4h, httpOnly, SameSite=Lax</td></tr>
          <tr><td>Identité anonyme (animal+couleur)</td><td>Votre navigateur (sessionStorage)</td><td>Onglet fermé</td></tr>
          <tr><td>Brouillon hors-ligne</td><td>IndexedDB local</td><td>4h max (TTL client)</td></tr>
        </tbody>
      </table>
      <p class="hint">Après TTL : Redis purge automatiquement (commande EXPIRE). Aucune sauvegarde, aucun backup, aucune archive.</p>
    </section>

    <section>
      <h2><span class="num">02</span> Ce qu'on NE collecte PAS</h2>
      <ul class="never">
        <li>Email, nom, téléphone — aucun compte n'est créé</li>
        <li>Adresse IP — non loguée côté application</li>
        <li>Empreinte navigateur (fingerprint)</li>
        <li>Cookies tiers (Google, Facebook, etc.)</li>
        <li>Analytics (pas de Google Analytics, Plausible, Matomo, ni rien d'autre)</li>
        <li>Géolocalisation</li>
      </ul>
    </section>

    <section>
      <h2><span class="num">03</span> Cookie unique</h2>
      <p class="prose">
        Un seul cookie technique est posé : <code>collab_admin</code>.
        Il permet au créateur d'une room de la clore. Aucune publicité, aucun pistage.
        Pas de bandeau RGPD — pas de cookie de tracking, donc pas de consentement requis
        (article 5 §3 directive ePrivacy : cookies « strictement nécessaires » exemptés).
      </p>
    </section>

    <section>
      <h2><span class="num">04</span> Vos droits</h2>
      <p class="prose">
        Cadre légal applicable : <strong>loi n°010-2004/AN</strong> du 20 avril 2004
        sur la protection des données à caractère personnel (Burkina Faso) et
        <strong>RGPD</strong> (UE) si vous résidez dans l'UE.
      </p>
      <p class="prose">
        En pratique, <strong>nous n'avons rien sur vous</strong>. Aucun compte,
        aucun identifiant persistant. Les rooms expirées sont irrécupérables même
        pour l'éditeur. Une demande d'accès / suppression aboutirait à « rien
        trouvé », ce qui est l'objectif du design.
      </p>
      <p class="prose">
        Pour toute question : <a href="mailto:privacy@exxolab.bf">privacy@exxolab.bf</a>.
      </p>
    </section>

    <section>
      <h2><span class="num">05</span> Modifications</h2>
      <p class="prose">
        Cette politique peut évoluer. Toute modification sera versionnée dans le
        repository public et annoncée 30 jours à l'avance via cette page si elle
        impacte vos droits.
      </p>
      <p class="prose mono"><small>Version 1.0 · 2026-06-13</small></p>
    </section>

    <div class="nav-bottom">
      <a href="/legal" class="nav-link">→ Mentions légales</a>
      <a href="/" class="nav-link">→ Retour accueil</a>
    </div>
  </main>

  <footer class="foot mono">EXXOLAB · Ouagadougou · 2026 — <a href="/">Accueil</a></footer>
</div>

<style>
  .page { min-height: 100vh; background: var(--paper); position: relative; }
  main { max-width: 720px; margin: 0 auto; padding: 100px 24px 60px; }

  .hero { margin-bottom: 36px; }
  .hero h1 {
    font-family: var(--font-head); font-weight: 700;
    font-size: clamp(36px, 6vw, 52px); line-height: 1.05;
    letter-spacing: -0.02em; color: var(--navy); margin: 22px 0 0;
  }
  .hero .hl {
    color: var(--accent-ink); background: var(--chartreuse);
    border-radius: 6px; padding: 0 8px; display: inline-block;
  }
  .lead { font-size: 15px; color: var(--navy-70); margin: 22px 0 0; line-height: 1.6; max-width: 580px; }

  .tldr {
    margin: 28px 0 12px;
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
    background: var(--surface-cream-strong); padding: 14px;
    border-radius: var(--r-md);
  }
  @media (max-width: 600px) { .tldr { grid-template-columns: 1fr 1fr; } }
  .tldr-row {
    display: flex; flex-direction: column; gap: 2px;
    padding: 6px 10px;
  }
  .tldr-key { font-family: var(--font-mono); font-size: 10px;
              color: var(--navy-50); letter-spacing: 0.08em; text-transform: uppercase; }
  .tldr-val { font-size: 13.5px; font-weight: 600; color: var(--navy); }

  section { padding: 28px 0 8px; border-top: 1px solid var(--navy-08); }
  h2 {
    font-family: var(--font-head); font-weight: 700;
    font-size: 22px; color: var(--navy); margin: 0 0 18px;
    display: flex; align-items: baseline; gap: 14px;
  }
  .num { font-family: var(--font-mono); font-size: 12px; color: var(--navy-40); font-weight: 500; }
  .prose { font-size: 14.5px; color: var(--navy-70); line-height: 1.65; margin: 0 0 12px; }
  .prose strong { color: var(--navy); font-weight: 600; }
  .prose code { font-family: var(--font-mono); font-size: 12.5px; background: var(--navy-06);
                padding: 1px 6px; border-radius: 4px; color: var(--navy); }
  a { color: var(--navy); text-underline-offset: 3px; }
  a:hover { color: var(--accent-ink); }

  .hint { font-family: var(--font-mono); font-size: 11.5px; color: var(--navy-50); margin: 12px 0 0; }

  /* Table */
  .tbl {
    width: 100%; border-collapse: collapse; font-size: 13px;
  }
  .tbl th {
    text-align: left; padding: 8px 12px;
    font-family: var(--font-mono); font-size: 10.5px; font-weight: 600;
    color: var(--navy-50); letter-spacing: 0.06em; text-transform: uppercase;
    border-bottom: 1px solid var(--navy-12);
  }
  .tbl td {
    padding: 10px 12px; color: var(--navy-70);
    border-bottom: 1px solid var(--navy-06);
  }
  .tbl td:first-child { font-weight: 500; color: var(--navy); }

  /* Never list */
  .never { list-style: none; padding: 0; margin: 0;
           display: flex; flex-direction: column; gap: 6px; }
  .never li {
    font-size: 13.5px; color: var(--navy-70);
    padding: 8px 12px 8px 30px;
    background: var(--navy-04); border-radius: var(--r-sm);
    position: relative;
  }
  .never li::before {
    content: '✗'; position: absolute; left: 10px;
    color: var(--navy-40); font-weight: 700;
  }

  .nav-bottom {
    margin-top: 48px; padding-top: 24px;
    border-top: 1px solid var(--navy-08);
    display: flex; gap: 28px; flex-wrap: wrap;
  }
  .nav-link {
    font-family: var(--font-mono); font-size: 13px;
    color: var(--navy-60); text-decoration: none;
  }
  .nav-link:hover { color: var(--navy); }

  .foot {
    padding: 32px 24px; text-align: center;
    font-size: 11px; color: var(--navy-40);
    border-top: 1px solid var(--navy-08);
  }
  .foot a { color: var(--navy-60); text-decoration: none; margin-left: 4px; }
  .foot a:hover { color: var(--navy); }
</style>
