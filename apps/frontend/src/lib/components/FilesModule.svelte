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
      const res = await fetch(`/room/${roomId}/upload`, {
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

<div class="files">
  <div
    class="dropzone"
    class:over={dragOver}
    on:dragover|preventDefault={() => (dragOver = true)}
    on:dragleave={() => (dragOver = false)}
    on:drop={onDrop}
    on:click={() => inputEl.click()}
    role="button" tabindex="0"
  >
    <span class="dz-ico">
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
        <path d="M9 22a5 5 0 0 1-.6-9.96A7 7 0 0 1 22 12.2 4.5 4.5 0 0 1 25 22"
              stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M17 26V14.5M13 18l4-3.5 4 3.5"
              stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
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
            <a class="icon-btn" href={f.url} target="_blank" rel="noopener" title="Télécharger">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v8M5 7.5L8 10.5l3-3M3 13h10"
                      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
            {#if $isAdmin}
              <button class="icon-btn danger" on:click={() => onDelete(f)} title="Supprimer">
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
  .files { display: flex; flex-direction: column; min-height: 0; }
  .dropzone {
    border: 2px dashed var(--navy-25); border-radius: var(--r-lg);
    padding: 56px 40px; text-align: center; background: var(--navy-04);
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    cursor: pointer; transition: background .18s ease, border-color .18s ease;
  }
  .dropzone:hover, .dropzone.over { background: var(--navy-06); border-style: solid; border-color: var(--navy-40); }
  .dz-ico { color: var(--navy-40); margin-bottom: 4px; }
  .dz-title { font-family: var(--font-head); font-weight: 600; font-size: 17px; color: var(--navy); }
  .dz-sub { font-size: 13px; color: var(--navy-50); }

  .file-list { margin-top: 22px; display: flex; flex-direction: column; gap: 10px; }
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
  }
  .icon-btn:hover { background: var(--navy-12); color: var(--navy); }
  .icon-btn.danger:hover { background: rgba(244,168,168,0.25); color: #B05656; }
</style>
