<script lang="ts">
  import ChromeTR from '$lib/components/ChromeTR.svelte';
</script>

<svelte:head>
  <title>À propos — Collab MVP par EXXOLAB</title>
  <meta name="description" content="Collaboration éphémère sans compte. Pourquoi Collab MVP existe et qui l'a construit." />
</svelte:head>

<div class="page noise">
  <ChromeTR />
  <a href="/" class="spec-home"><span class="acc"></span> Collab</a>

  <main>
    <header class="hero">
      <span class="eyebrow">À propos — EXXOLAB · Ouagadougou</span>
      <h1>
        Né d'une <span class="hl">frustration</span>.<br>
        Construit pour durer 4h.
      </h1>
      <p class="lead">
        <strong>Collab</strong> n'est pas sorti d'un brainstorm marketing. C'est l'outil
        que je cherchais — et qui n'existait pas.
      </p>
    </header>

    <section>
      <h2><span class="num">01</span> L'histoire</h2>
      <div class="story">
        <p>
          Je travaille sur deux machines, deux distributions Linux différentes. Chaque fois
          que je voulais juste passer un fichier ou une note de l'une à l'autre, il fallait
          me connecter à un compte. Drive, WhatsApp Web, email… toujours un login, une
          session ouverte, une trace de plus quelque part.
        </p>
        <p>
          Puis à l'université, le même problème en pire : partager rapidement un document
          entre amis, dans un amphi où la connexion passe mal. On finissait par se passer
          des clés USB comme en 2005.
        </p>
        <p>
          Alors j'ai construit l'outil que je cherchais : une room qui se crée en deux
          secondes, un code à six caractères, un QR à scanner — et tout le monde partage
          notes, fichiers et questions en temps réel. <strong>Sans compte. Sans
          installation. Sans trace : tout s'efface après 4 heures.</strong>
        </p>
        <p class="story-end">C'est tout. C'est peu. Et c'est exactement ce qu'il fallait.</p>
      </div>
    </section>

    <section>
      <h2><span class="num">02</span> Pourquoi éphémère</h2>
      <div class="grid">
        <div class="card-p">
          <div class="card-k">Friction zéro</div>
          <p>Pas de signup. Pas d'invitation par email. Code 6 caractères, point.</p>
        </div>
        <div class="card-p">
          <div class="card-k">Privacy by default</div>
          <p>Aucune donnée conservée. TTL Redis = source de vérité. Pas de backup.</p>
        </div>
        <div class="card-p">
          <div class="card-k">Calme cognitif</div>
          <p>Une room = un sujet, un temps limité. Pas d'historique à digérer.</p>
        </div>
        <div class="card-p">
          <div class="card-k">Performance Burkina</div>
          <p>Bundle ~60KB. Utilisable sur connexion mobile instable.</p>
        </div>
      </div>
    </section>

    <section>
      <h2><span class="num">03</span> Cas d'usage</h2>
      <ul class="use-list">
        <li><b>Réunions ad hoc</b> — bloc-notes partagé sans créer de doc Notion qu'on ne rouvrira jamais</li>
        <li><b>Workshops</b> — Q&A avec votes en temps réel, sans inscription Slido</li>
        <li><b>Support technique</b> — partage de fichier ponctuel sans WeTransfer ni email</li>
        <li><b>Sessions formation</b> — drop zone collective autodétruite à la fin du cours</li>
        <li><b>Brainstorm distant</b> — CRDT collaboratif Y.js, pas de conflit de merge</li>
      </ul>
    </section>

    <section>
      <h2><span class="num">04</span> Stack</h2>
      <div class="stack-grid">
        <div><span class="lbl">Frontend</span><span class="val">SvelteKit</span></div>
        <div><span class="lbl">Backend</span><span class="val">Fastify · Socket.io</span></div>
        <div><span class="lbl">CRDT</span><span class="val">Y.js</span></div>
        <div><span class="lbl">State</span><span class="val">In-memory (TTL 4h)</span></div>
        <div><span class="lbl">Desktop</span><span class="val">Tauri (Win/Linux/mac)</span></div>
        <div><span class="lbl">Deploy</span><span class="val">Docker · Coolify · Vercel</span></div>
      </div>
    </section>

    <section>
      <h2><span class="num">05</span> EXXOLAB</h2>
      <p class="prose">
        Atelier digital basé à Ouagadougou, Burkina Faso. Collab est notre outil interne de
        sessions courtes, ouvert en open-source pour les équipes qui partagent notre allergie
        aux outils trop persistants.
      </p>
    </section>

    <div class="cta-band">
      <h3>Essayer maintenant</h3>
      <p>Aucun compte. Code en 2 secondes.</p>
      <a class="btn btn-cta" href="/">
        Créer une room
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h9M9 4.5L12.5 8 9 11.5" stroke="currentColor"
                stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
  </main>

  <footer class="foot mono">
    EXXOLAB · Ouagadougou · 2026 —
    <a href="/">Accueil</a> ·
    <a href="/legal">Mentions légales</a> ·
    <a href="/privacy">Confidentialité</a>
  </footer>
</div>

<style>
  .page { min-height: 100vh; background: var(--paper); position: relative; }
  main {
    max-width: 760px; margin: 0 auto;
    padding: 100px 24px 80px;
  }

  .hero { margin-bottom: 56px; isolation: isolate; }
  .hero h1 {
    font-family: var(--font-head); font-weight: 700;
    font-size: clamp(40px, 7vw, 60px); line-height: 1.0;
    letter-spacing: -0.02em; color: var(--navy); margin: 26px 0 0;
  }
  .hero .hl {
    position: relative; color: var(--accent-ink);
    z-index: 1;
  }
  .hero .hl::before {
    content: ""; position: absolute; left: -6px; right: -6px;
    top: 8%; bottom: 8%; background: var(--chartreuse);
    border-radius: 6px; z-index: -1; transform: rotate(-0.6deg);
  }
  .lead {
    font-size: 17px; color: var(--navy-70);
    margin: 26px 0 0; line-height: 1.65; max-width: 580px;
  }
  .lead strong { color: var(--navy); font-weight: 600; }

  section { padding: 32px 0 8px; border-top: 1px solid var(--navy-08); }
  h2 {
    font-family: var(--font-head); font-weight: 700;
    font-size: 24px; color: var(--navy); margin: 0 0 24px;
    display: flex; align-items: baseline; gap: 14px;
  }
  .num {
    font-family: var(--font-mono); font-size: 13px;
    color: var(--navy-40); font-weight: 500;
  }
  .prose { font-size: 15px; color: var(--navy-70); line-height: 1.65; max-width: 580px; }

  /* story */
  .story { max-width: 620px; }
  .story p {
    font-size: 15.5px; color: var(--navy-70); line-height: 1.7; margin: 0 0 18px;
  }
  .story strong { color: var(--navy); font-weight: 600; }
  .story-end {
    font-family: var(--font-head); font-weight: 600; font-size: 17px;
    color: var(--navy) !important; margin-top: 4px;
  }

  /* feature grid */
  .grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
  .card-p {
    background: var(--surface); border-radius: var(--r-md);
    padding: 20px 22px; box-shadow: 0 2px 12px rgba(0,0,0,0.04);
  }
  .card-k {
    font-family: var(--font-head); font-weight: 700; font-size: 15px;
    color: var(--navy); margin-bottom: 6px;
  }
  .card-p p { font-size: 13.5px; color: var(--navy-60); margin: 0; line-height: 1.55; }

  /* use list */
  .use-list { list-style: none; padding: 0; margin: 0;
              display: flex; flex-direction: column; gap: 10px; }
  .use-list li {
    font-size: 14.5px; color: var(--navy-70);
    padding: 11px 14px; border-radius: var(--r-sm);
    background: var(--navy-04); line-height: 1.5;
  }
  .use-list b { color: var(--navy); font-weight: 600; }

  /* stack */
  .stack-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  }
  @media (max-width: 600px) { .stack-grid { grid-template-columns: 1fr; } }
  .stack-grid > div {
    display: flex; align-items: baseline; justify-content: space-between;
    padding: 12px 16px; background: var(--surface); border-radius: var(--r-sm);
  }
  .stack-grid .lbl { font-size: 12px; color: var(--navy-50);
                     text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500; }
  .stack-grid .val { font-family: var(--font-mono); font-size: 13px; color: var(--navy); }

  /* CTA band */
  .cta-band {
    margin-top: 48px; padding: 40px 32px;
    background: var(--surface-cream-strong);
    border-radius: var(--r-lg); text-align: center;
  }
  .cta-band h3 {
    font-family: var(--font-head); font-weight: 700; font-size: 26px;
    color: var(--navy); margin: 0;
  }
  .cta-band p { font-size: 14px; color: var(--navy-55); margin: 8px 0 22px; }
  .cta-band .btn { min-height: 48px; }

  /* footer */
  .foot {
    padding: 32px 24px; text-align: center;
    font-size: 11px; color: var(--navy-40);
    border-top: 1px solid var(--navy-08);
  }
  .foot a { color: var(--navy-60); text-decoration: none; margin-left: 4px; }
  .foot a:hover { color: var(--navy); }
</style>
