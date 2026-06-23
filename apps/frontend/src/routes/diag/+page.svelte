<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    isTauri, diagSnapshot, readLog, openLogFile,
    startBackend, stopBackend, isBackendRunning, getBackendPort, getBackendUrl,
    getLocalIp,
  } from '$lib/tauri';

  /**
   * Page diagnostic Tauri — visible logs en live pour debugger sans rebuild.
   * Affiche :
   *   - environnement (isTauri, ua)
   *   - snapshot Rust (diag_snapshot : port libre, backend running, tasklist)
   *   - tail log fichier sidecar
   *   - boutons invoke avec timing + résultat
   *   - HTTP probe vers /
   */

  type LogEntry = { ts: string; level: 'info' | 'ok' | 'warn' | 'err'; msg: string };
  let entries: LogEntry[] = [];
  let snapshot: Record<string, unknown> | null = null;
  let logTail = '';
  let backendUrl = '';
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function log(level: LogEntry['level'], msg: string) {
    const ts = new Date().toISOString().slice(11, 23);
    entries = [...entries, { ts, level, msg }].slice(-100);
  }

  async function refreshSnapshot() {
    if (!isTauri()) return;
    const s = await diagSnapshot();
    if (s) snapshot = s;
    const l = await readLog();
    if (l) logTail = l;
  }

  async function timedInvoke(name: string, fn: () => Promise<unknown>) {
    const t0 = performance.now();
    log('info', `→ invoke ${name}…`);
    try {
      const res = await fn();
      const dt = (performance.now() - t0).toFixed(0);
      log('ok', `← ${name} (${dt}ms) = ${JSON.stringify(res)}`);
      await refreshSnapshot();
      return res;
    } catch (e) {
      log('err', `✗ ${name} : ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  async function probeBackendHttp() {
    const url = backendUrl || (await getBackendUrl());
    if (!url) { log('warn', 'pas d\'URL backend (non-Tauri)'); return; }
    log('info', `→ HTTP GET ${url}/`);
    const t0 = performance.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    try {
      const res = await fetch(`${url}/`, { signal: ctl.signal });
      clearTimeout(timer);
      const body = await res.text();
      const dt = (performance.now() - t0).toFixed(0);
      log(res.ok ? 'ok' : 'err', `← HTTP ${res.status} (${dt}ms) : ${body.slice(0, 200)}`);
    } catch (e) {
      clearTimeout(timer);
      log('err', `✗ HTTP : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function probeCreateRoom() {
    const url = backendUrl || (await getBackendUrl());
    if (!url) { log('warn', 'pas d\'URL backend'); return; }
    log('info', `→ HTTP POST ${url}/room/create`);
    const t0 = performance.now();
    try {
      const res = await fetch(`${url}/room/create`, { method: 'POST', credentials: 'include' });
      const body = await res.text();
      const dt = (performance.now() - t0).toFixed(0);
      log(res.ok ? 'ok' : 'err', `← POST ${res.status} (${dt}ms) : ${body.slice(0, 200)}`);
    } catch (e) {
      log('err', `✗ POST : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  onMount(async () => {
    log('info', `tauri=${isTauri()} ua=${navigator.userAgent.slice(0, 80)}`);
    if (isTauri()) {
      backendUrl = await getBackendUrl();
      log('info', `backendUrl = ${backendUrl}`);
    }
    await refreshSnapshot();
    intervalId = setInterval(refreshSnapshot, 2000);
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });
</script>

<svelte:head><title>Collab — Diagnostic</title></svelte:head>

<div class="diag">
  <header>
    <h1>🔧 Diagnostic Collab</h1>
    <p class="sub">État runtime live + actions manuelles. Page non-publique.</p>
  </header>

  <!-- Snapshot Rust -->
  <section class="card">
    <h2>État Rust (refresh 2s)</h2>
    {#if !isTauri()}
      <p class="muted">⚠ Pas dans Tauri (browser web). Les invokes Rust sont indispo.</p>
    {:else if !snapshot}
      <p class="muted">Chargement…</p>
    {:else}
      <table>
        {#each Object.entries(snapshot) as [k, v]}
          <tr><td><code>{k}</code></td><td><code>{JSON.stringify(v)}</code></td></tr>
        {/each}
      </table>
    {/if}
    <div class="row">
      <code class="url">backendUrl: {backendUrl || '(vide)'}</code>
    </div>
  </section>

  <!-- Actions manuelles -->
  <section class="card">
    <h2>Actions invokes</h2>
    <div class="actions">
      <button on:click={() => timedInvoke('start_backend', () => startBackend())}>start_backend</button>
      <button on:click={() => timedInvoke('stop_backend', () => stopBackend())}>stop_backend</button>
      <button on:click={() => timedInvoke('is_backend_running', () => isBackendRunning())}>is_backend_running</button>
      <button on:click={() => timedInvoke('get_backend_port', () => getBackendPort())}>get_backend_port</button>
      <button on:click={() => timedInvoke('get_local_ip', () => getLocalIp())}>get_local_ip</button>
      <button on:click={probeBackendHttp}>HTTP GET /</button>
      <button on:click={probeCreateRoom}>HTTP POST /room/create</button>
      <button on:click={() => openLogFile()}>Ouvrir log fichier</button>
    </div>
  </section>

  <!-- Console live -->
  <section class="card">
    <h2>Console live ({entries.length})</h2>
    <pre class="console">{#each entries as e}<span class="lvl-{e.level}">[{e.ts}] {e.msg}</span>
{/each}</pre>
  </section>

  <!-- Tail log Rust -->
  <section class="card">
    <h2>Tail collab-backend.log (Rust file)</h2>
    <pre class="log-tail">{logTail || '(vide ou pas dispo)'}</pre>
  </section>
</div>

<style>
  .diag {
    max-width: 980px; margin: 0 auto; padding: 24px;
    font-family: var(--font-body);
  }
  header { margin-bottom: 18px; }
  h1 { margin: 0 0 4px; font-size: 22px; font-family: var(--font-head); }
  .sub { color: var(--navy-55); font-size: 13px; margin: 0; }
  .card {
    background: var(--surface); border: 1px solid var(--navy-10);
    border-radius: 10px; padding: 16px;
    margin-bottom: 14px;
  }
  h2 { margin: 0 0 12px; font-size: 14px; font-family: var(--font-head); color: var(--navy); letter-spacing: -0.01em; }
  .muted { color: var(--navy-50); font-size: 13px; margin: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; font-family: var(--font-mono); }
  td { padding: 4px 6px; border-bottom: 1px solid var(--navy-08); vertical-align: top; }
  td:first-child { width: 38%; color: var(--navy-60); }
  td:last-child { color: var(--navy); word-break: break-all; }
  .row { margin-top: 10px; }
  .url { font-family: var(--font-mono); font-size: 12px; color: var(--navy-70); }

  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .actions button {
    padding: 8px 14px; font-size: 12px; font-weight: 600;
    border-radius: 6px; border: 1px solid var(--navy-15);
    background: var(--navy-04); color: var(--navy); cursor: pointer;
    transition: background .12s;
  }
  .actions button:hover { background: var(--chartreuse); color: var(--accent-ink); border-color: transparent; }

  .console, .log-tail {
    background: #0e1428; color: #d6e1ff;
    padding: 12px; border-radius: 6px;
    font-family: var(--font-mono); font-size: 11px; line-height: 1.6;
    overflow-x: auto; max-height: 320px; overflow-y: auto;
    margin: 0; white-space: pre-wrap; word-break: break-word;
  }
  .log-tail { color: #a8b8d8; font-size: 10px; }
  .lvl-info { color: #8cb4ff; display: block; }
  .lvl-ok   { color: #7eea9d; display: block; }
  .lvl-warn { color: #f7c843; display: block; }
  .lvl-err  { color: #ff7a8a; display: block; }
</style>
