<script lang="ts">
  import ChromeTR from '$lib/components/ChromeTR.svelte';
</script>

<svelte:head>
  <title>Mentions légales — Collab</title>
  <meta name="description" content="Mentions légales du service Collab édité par EXXOLAB Digital Agency, Ouagadougou, Burkina Faso." />
</svelte:head>

<div class="page noise">
  <ChromeTR />
  <a href="/" class="spec-home"><span class="acc"></span> Collab</a>

  <main id="main-content">
    <header class="hero">
      <span class="eyebrow">Mentions légales · Burkina Faso</span>
      <h1>Qui édite <span class="hl">Collab</span>.</h1>
      <p class="lead">
        Page imposée par la loi n°010-2004/AN du 20 avril 2004 portant protection
        des données à caractère personnel, et la loi n°045-2009/AN sur la
        réglementation des services et de la transaction électroniques au Burkina Faso.
      </p>
    </header>

    <section>
      <h2><span class="num">01</span> Éditeur</h2>
      <dl class="kv">
        <dt>Raison sociale</dt><dd>EXXOLAB Digital Agency</dd>
        <dt>Forme juridique</dt><dd>SARL</dd>
        <dt>Siège social</dt><dd>Ouagadougou, Burkina Faso</dd>
        <dt>Directeur de la publication</dt><dd>Jim Maïga · <a href="mailto:maigajim@gmail.com">maigajim@gmail.com</a></dd>
        <dt>Contact</dt><dd><a href="mailto:contact@exxolab.bf">contact@exxolab.bf</a></dd>
      </dl>
    </section>

    <section>
      <h2><span class="num">02</span> Hébergement</h2>
      <dl class="kv">
        <dt>Frontend (assets statiques)</dt><dd>Vercel Inc. · 440 N Barranca Ave, Covina, CA 91723, USA</dd>
        <dt>Backend (API + temps réel)</dt><dd>Serveur dédié EU · Frankfurt (Contabo GmbH)</dd>
        <dt>Stockage fichiers</dt><dd>Cloudflare R2 · EU region</dd>
      </dl>
    </section>

    <section>
      <h2><span class="num">03</span> Propriété intellectuelle</h2>
      <p class="prose">
        Le code source de Collab est publié sous licence MIT et disponible publiquement
        sur GitHub. Les marques, logos et chartes graphiques associés à
        <strong>EXXOLAB</strong> et <strong>Collab</strong> restent la propriété
        exclusive de leur éditeur. La reproduction du contenu éditorial (textes
        de la page d'accueil, /about) sans autorisation est interdite.
      </p>
    </section>

    <section>
      <h2><span class="num">04</span> Responsabilité</h2>
      <p class="prose">
        Collab est fourni « tel quel », sans garantie de disponibilité continue.
        Les rooms sont par nature <strong>éphémères (TTL 4h)</strong> : l'éditeur
        ne saurait être tenu responsable de la perte de contenu non sauvegardé
        avant expiration. Le service n'est pas adapté à la conservation de
        données critiques ou réglementées.
      </p>
    </section>

    <section>
      <h2><span class="num">05</span> Modération &amp; signalement</h2>
      <p class="prose">
        Pour signaler un contenu illicite (incitation à la haine, contrefaçon,
        atteinte à la vie privée), écrivez à
        <a href="mailto:abuse@exxolab.bf">abuse@exxolab.bf</a> en précisant le
        code room concerné. Les rooms étant éphémères, agissez dans les 4h.
      </p>
    </section>

    <section>
      <h2><span class="num">06</span> Juridiction</h2>
      <p class="prose">
        Le présent service est régi par le droit du Burkina Faso. Tout litige
        sera porté devant les tribunaux compétents de Ouagadougou.
      </p>
    </section>

    <div class="nav-bottom">
      <a href="/privacy" class="nav-link">→ Politique de confidentialité</a>
      <a href="/" class="nav-link">→ Retour accueil</a>
    </div>
  </main>

  <footer class="foot mono">EXXOLAB · Ouagadougou · 2026 — <a href="/">Accueil</a></footer>
</div>

<style>
  .page { min-height: 100vh; background: var(--paper); position: relative; }
  main { max-width: 720px; margin: 0 auto; padding: 100px 24px 60px; }

  .hero { margin-bottom: 48px; }
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

  section { padding: 28px 0 8px; border-top: 1px solid var(--navy-08); }
  h2 {
    font-family: var(--font-head); font-weight: 700;
    font-size: 22px; color: var(--navy); margin: 0 0 18px;
    display: flex; align-items: baseline; gap: 14px;
  }
  .num { font-family: var(--font-mono); font-size: 12px; color: var(--navy-40); font-weight: 500; }
  .prose { font-size: 14.5px; color: var(--navy-70); line-height: 1.65; margin: 0; }
  .prose strong { color: var(--navy); font-weight: 600; }
  a { color: var(--navy); text-underline-offset: 3px; }
  a:hover { color: var(--accent-ink); }

  .kv {
    display: grid; grid-template-columns: max-content 1fr; gap: 10px 24px;
    margin: 0;
  }
  .kv dt {
    font-family: var(--font-mono); font-size: 12px;
    color: var(--navy-50); letter-spacing: 0.04em;
    text-transform: uppercase; padding-top: 2px;
  }
  .kv dd { font-size: 14px; color: var(--navy-80, var(--navy)); margin: 0; }
  @media (max-width: 600px) {
    .kv { grid-template-columns: 1fr; gap: 4px 0; }
    .kv dd { margin-bottom: 12px; }
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
