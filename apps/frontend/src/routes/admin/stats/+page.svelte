<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import ChromeTR from '$lib/components/ChromeTR.svelte';
  import { apiFetch } from '$lib/api/http';

  interface AdminStats {
    rooms_active:       number;
    rooms_full:         number;
    participants_total: number;
    files_count:        number;
    files_size_bytes:   number;
    qa_questions_count: number;
    uptime_sec:         number;
    redis_memory_mb:    number;
    socket_connections: number;
  }
  interface RoomItem {
    id: string;
    createdAt: number;
    expiresInSec: number;
    participants: number;
    full: boolean;
    questions: number;
    files: number;
    hasAdmin: boolean;
    docTextLength: number;
  }

  type FetchState = 'loading' | 'ok' | 'unauthorized' | 'error';

  let stats: AdminStats | null = null;
  let roomList: RoomItem[] = [];
  let state: FetchState = 'loading';
  let lastFetch = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let copiedRoom: string | null = null;

  async function fetchStats() {
    try {
      const [statsRes, roomsRes] = await Promise.all([
        apiFetch('/admin/stats', { credentials: 'include' }),
        apiFetch('/admin/rooms', { credentials: 'include' }),
      ]);
      if (statsRes.status === 401 || statsRes.status === 403) { state = 'unauthorized'; return; }
      if (!statsRes.ok || !roomsRes.ok) { state = 'error'; return; }
      stats    = (await statsRes.json()) as AdminStats;
      roomList = ((await roomsRes.json()) as { rooms: RoomItem[] }).rooms;
      lastFetch = Date.now();
      state = 'ok';
    } catch {
      state = 'error';
    }
  }

  async function copyRoomCode(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      copiedRoom = id;
      setTimeout(() => { if (copiedRoom === id) copiedRoom = null; }, 1500);
    } catch { /* clipboard denied */ }
  }

  async function closeRoom(id: string) {
    if (!confirm(`Clore définitivement la room ${id} ?`)) return;
    try {
      const res = await apiFetch(`/room/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) { roomList = roomList.filter(r => r.id !== id); fetchStats(); }
      else alert('Échec : pas admin ou room introuvable');
    } catch { alert('Erreur réseau'); }
  }

  function fmtExpires(s: number): string {
    if (s <= 0) return 'expiré';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
  }
  function fmtAgo(ts: number): string {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}min`;
    return `${Math.floor(s / 3600)}h`;
  }

  function fmtBytes(b: number): string {
    if (!b) return '0 o';
    if (b < 1024) return `${b} o`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} Go`;
  }
  function fmtUptime(s: number): string {
    if (!s) return '—';
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}j ${h}h`;
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
  }
  function fmtAge(ts: number): string {
    if (!ts) return '—';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 5)  return 'à l\'instant';
    if (s < 60) return `il y a ${s}s`;
    return `il y a ${Math.floor(s / 60)}min`;
  }

  onMount(() => {
    fetchStats();
    timer = setInterval(fetchStats, 10_000);  // refresh 10s
  });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

<svelte:head><title>Admin · Stats — Collab</title></svelte:head>

<div class="page noise">
  <ChromeTR />
  <a href="/" class="spec-home"><span class="acc"></span> Collab</a>

  <main id="main-content">
    <header class="hero">
      <div class="topline">
        <span class="eyebrow">Admin · Métriques temps réel</span>
        <span class="refresh-tag">
          <span class="dot" class:on={state === 'ok'}></span>
          {state === 'ok' ? `Actualisé ${fmtAge(lastFetch)}` : state === 'loading' ? 'Chargement…' : state === 'unauthorized' ? 'Accès refusé' : 'Erreur réseau'}
        </span>
      </div>
      <h1>État du <span class="hl">backend</span>.</h1>
    </header>

    {#if state === 'unauthorized'}
      <div class="panel warn">
        <h3>Accès admin requis</h3>
        <p>Cette page n'est accessible qu'avec un cookie admin valide. Connectez-vous depuis l'interface admin.</p>
      </div>
    {:else if state === 'error' && !stats}
      <div class="panel err">
        <h3>Impossible de charger les stats</h3>
        <p>Le backend ne répond pas. Vérifiez que <code>/api/admin/stats</code> est en ligne.</p>
        <button class="btn btn-ghost" on:click={fetchStats}>Réessayer</button>
      </div>
    {:else}
      <!-- KPI cards -->
      <div class="kpi-grid">
        <div class="kpi">
          <div class="kpi-lbl">Rooms actives</div>
          <div class="kpi-val">{stats?.rooms_active ?? '—'}</div>
          {#if stats}<div class="kpi-sub">{stats.rooms_full} pleines</div>{/if}
        </div>
        <div class="kpi">
          <div class="kpi-lbl">Participants connectés</div>
          <div class="kpi-val">{stats?.participants_total ?? '—'}</div>
          {#if stats}<div class="kpi-sub">{stats.socket_connections} sockets</div>{/if}
        </div>
        <div class="kpi">
          <div class="kpi-lbl">Fichiers stockés</div>
          <div class="kpi-val">{stats?.files_count ?? '—'}</div>
          {#if stats}<div class="kpi-sub">{fmtBytes(stats.files_size_bytes)}</div>{/if}
        </div>
        <div class="kpi">
          <div class="kpi-lbl">Questions Q&amp;A</div>
          <div class="kpi-val">{stats?.qa_questions_count ?? '—'}</div>
          {#if stats}<div class="kpi-sub">toutes rooms</div>{/if}
        </div>
      </div>


        <!-- ───────────── Active rooms table ──────────── -->
      <section class="rooms-section">
        <h2><span class="num">·</span> Rooms actives <span class="count">{roomList.length}</span></h2>

        {#if roomList.length === 0}
          <div class="empty">Aucune room active. Crée-en une depuis l'<a href="/">accueil</a>.</div>
        {:else}
          <div class="rooms-table">
            <div class="rh">
              <div>Code</div>
              <div>Créée</div>
              <div>Expire</div>
              <div class="num-col">Part.</div>
              <div class="num-col">Q&amp;A</div>
              <div class="num-col">Fich.</div>
              <div class="num-col">Notes</div>
              <div>Rôle</div>
              <div class="act-col">Actions</div>
            </div>
            {#each roomList as r (r.id)}
              <div class="rrow" class:full={r.full}>
                <div class="code-cell">
                  <button class="code-chip" on:click={() => copyRoomCode(r.id)} title="Cliquer pour copier">
                    {r.id}
                    {#if copiedRoom === r.id}
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                        <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    {/if}
                  </button>
                </div>
                <div class="mono">il y a {fmtAgo(r.createdAt)}</div>
                <div class="mono">{fmtExpires(r.expiresInSec)}</div>
                <div class="num-col">{r.participants}/4</div>
                <div class="num-col">{r.questions}</div>
                <div class="num-col">{r.files}</div>
                <div class="num-col mono small">{r.docTextLength}c</div>
                <div>
                  {#if r.hasAdmin}
                    <span class="badge admin">ADMIN</span>
                  {:else}
                    <span class="badge guest">–</span>
                  {/if}
                </div>
                <div class="act-col">
                  <a class="act-btn" href="/room/{r.id}" target="_blank" rel="noopener" title="Ouvrir la room">↗</a>
                  {#if r.hasAdmin}
                    <button class="act-btn danger" on:click={() => closeRoom(r.id)} title="Clore la room">×</button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <!-- System health -->
      <section class="health">
        <h2><span class="num">·</span> Santé système</h2>
        <dl class="kv">
          <dt>Uptime</dt>
          <dd>{stats ? fmtUptime(stats.uptime_sec) : '—'}</dd>
          <dt>Mémoire Redis</dt>
          <dd>{stats ? `${stats.redis_memory_mb.toFixed(1)} Mo` : '—'}</dd>
          <dt>Refresh auto</dt>
          <dd>toutes les 10s</dd>
        </dl>
      </section>
    {/if}

    <div class="nav-bottom">
      <a href="/" class="nav-link">→ Retour accueil</a>
      <a href="/about" class="nav-link">→ À propos</a>
    </div>
  </main>

  <footer class="foot mono">EXXOLAB · Admin Dashboard · 2026</footer>
</div>

<style>
  .page { min-height: 100vh; background: var(--paper); position: relative; }
  main { max-width: 880px; margin: 0 auto; padding: 100px 24px 60px; }

  .hero { margin-bottom: 36px; }
  .topline {
    display: flex; justify-content: space-between; align-items: center;
    gap: 12px; flex-wrap: wrap;
  }
  .hero h1 {
    font-family: var(--font-head); font-weight: 700;
    font-size: clamp(36px, 6vw, 48px); line-height: 1.05;
    letter-spacing: -0.02em; color: var(--navy); margin: 18px 0 0;
  }
  .hero .hl {
    color: var(--accent-ink); background: var(--chartreuse);
    border-radius: 6px; padding: 0 8px; display: inline-block;
  }

  .refresh-tag {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: var(--font-mono); font-size: 11px;
    color: var(--navy-55); background: var(--surface);
    padding: 6px 12px; border-radius: var(--r-pill);
    border: 1px solid var(--navy-08);
  }
  .refresh-tag .dot {
    width: 7px; height: 7px; border-radius: 50%; background: var(--navy-30);
    transition: background .2s;
  }
  .refresh-tag .dot.on {
    background: #2E7D4F;
    box-shadow: 0 0 0 2px rgba(46,125,79,0.18);
    animation: pulse 1.8s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(46,125,79,0.5); }
    70%      { box-shadow: 0 0 0 6px rgba(46,125,79,0); }
  }

  /* KPI grid */
  .kpi-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
    margin-bottom: 36px;
  }
  @media (max-width: 800px) { .kpi-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 480px) { .kpi-grid { grid-template-columns: 1fr; } }
  .kpi {
    background: var(--surface); border-radius: var(--r-md);
    padding: 22px 22px 20px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.04);
    display: flex; flex-direction: column; gap: 6px;
  }
  .kpi-lbl {
    font-family: var(--font-mono); font-size: 10.5px;
    color: var(--navy-50); letter-spacing: 0.08em; text-transform: uppercase;
  }
  .kpi-val {
    font-family: var(--font-head); font-weight: 700; font-size: 36px;
    color: var(--navy); line-height: 1;
  }
  .kpi-sub {
    font-family: var(--font-mono); font-size: 11.5px;
    color: var(--navy-40); margin-top: 2px;
  }

  /* Active rooms section */
  .rooms-section { padding: 24px 0 8px; border-top: 1px solid var(--navy-08); margin-bottom: 8px; }
  .count {
    font-family: var(--font-mono); font-size: 12px; font-weight: 600;
    background: var(--navy); color: var(--paper);
    padding: 2px 8px; border-radius: var(--r-pill); margin-left: 8px;
  }
  .empty {
    padding: 20px; background: var(--navy-04); border-radius: var(--r-md);
    color: var(--navy-50); font-size: 14px; text-align: center;
  }
  .empty a { color: var(--navy); }

  .rooms-table {
    display: flex; flex-direction: column;
    background: var(--surface); border-radius: var(--r-md);
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0,0,0,0.04);
  }
  .rh, .rrow {
    display: grid;
    grid-template-columns: 110px 100px 90px 70px 60px 60px 70px 70px 90px;
    gap: 12px; padding: 10px 14px; align-items: center;
    font-size: 13px;
  }
  .rh {
    background: var(--surface-cream-strong);
    font-family: var(--font-mono); font-size: 10.5px; font-weight: 600;
    color: var(--navy-50); letter-spacing: 0.06em; text-transform: uppercase;
  }
  .rrow { border-top: 1px solid var(--navy-06); }
  .rrow:hover { background: var(--navy-04); }
  .rrow.full { background: rgba(244,232,168,0.20); }
  .num-col { text-align: right; font-family: var(--font-mono); font-size: 12.5px; color: var(--navy-70); }
  .small { font-size: 11px; color: var(--navy-50); }
  .mono { font-family: var(--font-mono); font-size: 12px; color: var(--navy-60); }

  .code-cell { display: flex; }
  .code-chip {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--font-mono); font-size: 13.5px; font-weight: 600;
    background: var(--chartreuse); color: var(--accent-ink);
    border: none; cursor: pointer;
    padding: 5px 10px; border-radius: var(--r-pill);
    letter-spacing: 0.06em;
    transition: transform .12s ease;
  }
  .code-chip:hover { transform: translateY(-1px); }

  .badge {
    font-family: var(--font-mono); font-size: 10px; font-weight: 700;
    padding: 2px 8px; border-radius: var(--r-pill);
    letter-spacing: 0.04em;
  }
  .badge.admin { background: var(--navy); color: var(--paper); }
  .badge.guest { background: var(--navy-08); color: var(--navy-40); }

  .act-col { display: flex; gap: 4px; justify-content: flex-end; }
  .act-btn {
    width: 28px; height: 28px; border-radius: 6px;
    border: none; background: var(--navy-06); color: var(--navy-60);
    cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
    text-decoration: none; font-size: 14px;
    transition: background .15s, color .15s;
  }
  .act-btn:hover { background: var(--navy-12); color: var(--navy); }
  .act-btn.danger { background: transparent; color: var(--navy-40); font-size: 18px; }
  .act-btn.danger:hover { background: rgba(244,168,168,0.25); color: #B05656; }

  @media (max-width: 900px) {
    .rh, .rrow { grid-template-columns: 90px 1fr 70px 80px; }
    .rh > div:nth-child(n+5), .rrow > div:nth-child(n+5) { display: none; }
    .rrow > .act-col { display: flex; }
    .rh > div:nth-child(9), .rrow > .act-col { display: flex; grid-column: 4; }
  }

  /* Health section */
  .health { padding: 24px 0 8px; border-top: 1px solid var(--navy-08); }
  h2 {
    font-family: var(--font-head); font-weight: 700;
    font-size: 22px; color: var(--navy); margin: 0 0 18px;
    display: flex; align-items: baseline; gap: 14px;
  }
  .num { font-family: var(--font-mono); font-size: 13px; color: var(--navy-40); }
  .kv {
    display: grid; grid-template-columns: max-content 1fr; gap: 8px 28px;
    margin: 0;
  }
  .kv dt {
    font-family: var(--font-mono); font-size: 11.5px;
    color: var(--navy-50); letter-spacing: 0.04em;
    text-transform: uppercase; padding-top: 2px;
  }
  .kv dd { font-family: var(--font-mono); font-size: 14px; color: var(--navy); margin: 0; }

  /* Panels */
  .panel {
    background: var(--surface); border-radius: var(--r-lg);
    padding: 28px; margin-bottom: 28px;
    border: 1px solid var(--navy-10);
  }
  .panel.warn { border-color: var(--warning); background: rgba(244,232,168,0.16); }
  .panel.err  { border-color: var(--error);   background: rgba(244,168,168,0.10); }
  .panel h3 {
    font-family: var(--font-head); font-weight: 700; font-size: 18px;
    margin: 0 0 8px; color: var(--navy);
  }
  .panel p { font-size: 14px; color: var(--navy-70); margin: 0 0 16px; line-height: 1.5; }
  .panel code { font-family: var(--font-mono); font-size: 12.5px;
                background: var(--navy-06); padding: 1px 6px; border-radius: 4px; }

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
</style>
