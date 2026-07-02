<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { isTauri, getBackendUrl, getAppVersion } from '$lib/tauri';
  import { isOnline, networkMode } from '$lib/stores/network';

  type LogEntry = { ts: string; level: 'info' | 'ok' | 'warn' | 'err'; msg: string };
  let entries: LogEntry[] = [];
  let backendUrl = '';
  let appVersion = '';
  let pingMs: number | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function log(level: LogEntry['level'], msg: string) {
    const ts = new Date().toISOString().slice(11, 23);
    entries = [...entries, { ts, level, msg }].slice(-100);
  }

  async function ping() {
    const t0 = performance.now();
    try {
      const base = backendUrl || '/api';
      const r = await fetch(`${base}/`);
      pingMs = Math.round(performance.now() - t0);
      log(r.ok ? 'ok' : 'warn', `GET ${base}/ → ${r.status} (${pingMs}ms)`);
    } catch (e) {
      pingMs = null;
      log('err', `Ping échoué : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  onMount(async () => {
    log('info', `isTauri = ${isTauri()}`);
    log('info', `navigator.onLine = ${navigator.onLine}`);
    log('info', `VITE_API_URL = ${import.meta.env.VITE_API_URL ?? '(non défini — proxy dev)'}`);
    log('info', `VITE_PUBLIC_URL = ${import.meta.env.VITE_PUBLIC_URL ?? '(non défini)'}`);

    backendUrl = await getBackendUrl();
    log('info', `getBackendUrl() = "${backendUrl || '(proxy dev)'}"`);

    if (isTauri()) {
      const v = await getAppVersion();
      appVersion = v ?? '?';
      log('info', `app version = ${appVersion}`);
    }

    await ping();
    intervalId = setInterval(ping, 10000);
  });

  onDestroy(() => { if (intervalId) clearInterval(intervalId); });
</script>

<svelte:head><title>Diagnostic — Collab</title></svelte:head>

<div class="diag">
  <h1>Diagnostic</h1>

  <section class="card">
    <h2>Connexion</h2>
    <dl>
      <dt>En ligne</dt>     <dd class:ok={$isOnline} class:err={!$isOnline}>{$isOnline ? 'Oui' : 'Non'}</dd>
      <dt>Mode réseau</dt>  <dd>{$networkMode}</dd>
      <dt>Backend URL</dt>  <dd><code>{backendUrl || '/api (proxy dev)'}</code></dd>
      <dt>Latence ping</dt> <dd>{pingMs !== null ? `${pingMs} ms` : 'N/A'}</dd>
      {#if appVersion}<dt>App version</dt><dd>{appVersion}</dd>{/if}
    </dl>
    <button class="btn btn-ghost" on:click={ping}>Ping maintenant</button>
  </section>

  <section class="card log-card">
    <h2>Logs</h2>
    <div class="log">
      {#each entries as e (e.ts + e.msg)}
        <div class="line {e.level}">
          <span class="ts">{e.ts}</span>
          <span class="msg">{e.msg}</span>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .diag { max-width: 720px; margin: 0 auto; padding: 32px 16px; display: flex; flex-direction: column; gap: 20px; }
  h1 { font-size: 22px; font-weight: 600; color: var(--navy); margin: 0 0 4px; }
  h2 { font-size: 14px; font-weight: 600; color: var(--navy-60); text-transform: uppercase; letter-spacing: .08em; margin: 0 0 12px; }

  .card { background: var(--surface); border-radius: var(--r-lg); padding: 20px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; font-size: 13px; margin-bottom: 12px; }
  dt { color: var(--navy-50); }
  dd { color: var(--navy); font-family: var(--font-mono); margin: 0; }
  dd.ok { color: #2e7d32; }
  dd.err { color: #B05656; }

  .log-card .log {
    background: var(--navy-04); border-radius: var(--r-sm);
    padding: 12px; font-family: var(--font-mono); font-size: 11px;
    max-height: 360px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px;
  }
  .line { display: flex; gap: 10px; }
  .ts  { color: var(--navy-40); flex-shrink: 0; }
  .line.ok   .msg { color: #2e7d32; }
  .line.warn .msg { color: #e65100; }
  .line.err  .msg { color: #B05656; }
  .line.info .msg { color: var(--navy-70); }
</style>
