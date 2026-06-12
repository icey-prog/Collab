<script lang="ts">
  import { files, type RoomFile } from '$lib/stores/files';
  import { isAdmin, pushToast } from '$lib/stores/room';
  import { getSocket } from '$lib/socket';

  export let roomId: string;

  let dragOver = false;
  let inputEl: HTMLInputElement;

  function ext(name: string) {
    const m = /\.([^.]+)$/.exec(name);
    return (m ? m[1] : 'FILE').slice(0, 4).toUpperCase();
  }
  function fmtSize(b: number) {
    if (b < 1024) return `${b} o`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
    return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
  }
  function fmtExpiry(at: number) {
    const left = at - Date.now();
    if (left <= 0) return 'expiré';
    const h = Math.floor(left / 3.6e6);
    return h > 0 ? `Expire dans ${h}h` : 'Expire <1h';
  }

  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      pushToast('Fichier trop lourd (10 Mo max)', 'info', 4000);
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`/api/room/${roomId}/upload`, {
        method: 'POST', body: fd, credentials: 'include'
      });
      if (!res.ok) {
        pushToast(`Upload refusé (${res.status})`, 'info', 4000);
        return;
      }
      pushToast(`${file.name} uploadé`, 'success');
      // server will broadcast 'files:updated' via socket
    } catch {
      pushToast('Erreur réseau pendant l\'upload', 'info', 4000);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault(); dragOver = false;
    if (!e.dataTransfer?.files) return;
    for (const f of Array.from(e.dataTransfer.files)) upload(f);
  }
  function onPick(e: Event) {
    const t = e.target as HTMLInputElement;
    if (!t.files) return;
    for (const f of Array.from(t.files)) upload(f);
    t.value = '';
  }
  function onDelete(f: RoomFile) {
    if (!$isAdmin) return;
    getSocket().emit('file:delete', { fileKey: f.key });
  }
</script>

<div class="files-zone">

  <!-- Zone header -->
  <div class="zone-header">
    <div class="zone-title-row">
      <span class="zone-ico">
        <svg viewBox="0 0 18 18" fill="none">
          <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3l1.5 1.8H14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 14 14.8H4a1.5 1.5 0 0 1-1.5-1.5z"
                stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
      </span>
      <h2 class="zone-title">Fichiers partagés</h2>
      {#if $files.length > 0}
        <span class="zone-count">{$files.length}</span>
      {/if}
      <span class="zone-tag">10 Mo max · 24h</span>
    </div>
    <p class="zone-desc">Déposez des fichiers pour les partager avec tous les participants. Ils expirent automatiquement après 24h.</p>
  </div>

  <!-- Dropzone -->
  <div
    class="dropzone"
    class:over={dragOver}
    on:dragover|preventDefault={() => (dragOver = true)}
    on:dragleave={() => (dragOver = false)}
    on:drop={onDrop}
    on:click={() => inputEl.click()}
    on:keydown={(e) => e.key === 'Enter' && inputEl.click()}
    role="button" tabindex="0"
    aria-label="Zone de dépôt de fichiers — cliquer ou glisser"
  >
    <span class="dz-ico">
      <img src="/animations/file_share.gif" alt="" class="dz-gif" loading="lazy" />
    </span>
    <div class="dz-title">Glissez vos fichiers ici</div>
    <div class="dz-sub mono">10 Mo max · Expiration 24h</div>
    <input bind:this={inputEl} type="file" multiple hidden on:change={onPick} />
  </div>

  {#if $files.length > 0}
    <div class="file-list">
      {#each $files as f (f.key)}
        <div class="file-card">
          <div class="file-ico">{ext(f.name)}</div>
          <div class="file-meta">
            <div class="file-name">{f.name}</div>
            <div class="file-sub">{fmtSize(f.size)} · {fmtExpiry(f.expiresAt)}</div>
          </div>
          <div class="file-actions">
            <a class="icon-btn" href={f.url} target="_blank" rel="noopener noreferrer" title="Télécharger" aria-label="Télécharger {f.name}">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v8M5 7.5L8 10.5l3-3M3 13h10"
                      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
            {#if $isAdmin}
              <button class="icon-btn danger" on:click={() => onDelete(f)} title="Supprimer" aria-label="Supprimer {f.name}">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"
                        stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

</div>

<style>
  .files-zone { display: flex; flex-direction: column; gap: 16px; min-height: 0; }

  /* ── Zone header ── */
  .zone-header { display: flex; flex-direction: column; gap: 8px; }
  .zone-title-row { display: flex; align-items: center; gap: 10px; }
  .zone-ico {
    width: 22px; height: 22px; display: inline-flex;
    color: var(--navy-60); flex-shrink: 0;
  }
  .zone-ico svg { width: 100%; height: 100%; }
  .zone-title {
    font-family: var(--font-head); font-weight: 700;
    font-size: 17px; color: var(--navy); margin: 0;
    letter-spacing: -0.01em;
  }
  .zone-count {
    font-family: var(--font-mono); font-size: 11px; font-weight: 600;
    background: var(--navy); color: var(--paper);
    padding: 2px 8px; border-radius: var(--r-pill);
  }
  .zone-tag {
    font-family: var(--font-mono); font-size: 10px;
    color: var(--navy-50); background: var(--navy-06);
    padding: 3px 8px; border-radius: var(--r-pill);
    letter-spacing: 0.06em; margin-left: auto; white-space: nowrap;
  }
  .zone-desc {
    font-size: 13px; color: var(--navy-50); line-height: 1.5; margin: 0;
  }

  /* ── Dropzone ── */
  .dropzone {
    border: 2px dashed var(--navy-25); border-radius: var(--r-lg);
    padding: 48px 40px; text-align: center; background: var(--navy-04);
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    cursor: pointer; transition: background .18s ease, border-color .18s ease;
  }
  .dropzone:hover, .dropzone.over { background: var(--navy-06); border-style: solid; border-color: var(--navy-40); }
  .dropzone:focus-visible { outline: 2px solid var(--chartreuse); outline-offset: 2px; }
  .dz-ico {
    color: var(--navy-40); margin-bottom: 4px;
    width: 110px; height: 110px;
    display: flex; align-items: center; justify-content: center;
  }
  .dz-gif {
    width: 110px; height: auto;
    object-fit: contain;
    mix-blend-mode: multiply;
  }
  :global(body.theme-dark) .dz-gif { mix-blend-mode: normal; }
  .dz-title { font-family: var(--font-head); font-weight: 600; font-size: 17px; color: var(--navy); }
  .dz-sub { font-size: 13px; color: var(--navy-50); }

  .file-list { display: flex; flex-direction: column; gap: 10px; }
  .file-card {
    display: flex; align-items: center; gap: 16px; padding: 16px 18px;
    background: var(--surface); border-radius: var(--r-md);
    box-shadow: 0 2px 12px rgba(0,0,0,0.05);
  }
  .file-ico {
    width: 40px; height: 40px; border-radius: var(--r-sm);
    background: rgba(149,177,238,0.18); color: #3F5B9E;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-mono); font-size: 11px; font-weight: 500;
    flex-shrink: 0;
  }
  .file-meta { flex: 1; min-width: 0; }
  .file-name { font-size: 14px; font-weight: 600; color: var(--navy); }
  .file-sub { font-family: var(--font-mono); font-size: 11.5px; color: var(--navy-50); margin-top: 3px; }
  .file-actions { display: flex; gap: 6px; }
  .icon-btn {
    width: 36px; height: 36px; border-radius: var(--r-sm);
    border: none; background: var(--navy-06); color: var(--navy-60);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    text-decoration: none;
    transition: background .15s, color .15s;
  }
  .icon-btn:hover { background: var(--navy-12); color: var(--navy); }
  .icon-btn.danger:hover { background: rgba(244,168,168,0.25); color: #B05656; }
</style>
