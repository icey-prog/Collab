<script lang="ts">
  import { files, type RoomFile } from '$lib/stores/files';
  import { isAdmin, pushToast } from '$lib/stores/room';
  import { getSocket } from '$lib/socket';
  import { isOnline } from '$lib/stores/network';
  import { apiFetch, apiUrl, downloadFile } from '$lib/api/http';
  import { getFileIconLabel, getFileIconStyle } from '$lib/utils/fileIcon';

  export let roomId: string;

  const MAX_FILE_BYTES = 10 * 1024 * 1024;   // reflète le cap serveur MAX_FILE_BYTES
  const MAX_BATCH_BYTES = 50 * 1024 * 1024;  // reflète le cap serveur MAX_ROOM_BYTES

  const ERROR_MESSAGES: Record<string, string> = {
    ROOM_QUOTA_FULL:  'Quota de la room atteint (50 Mo cumulés)',
    ROOM_FILES_LIMIT: 'Trop de fichiers dans cette room (20 max)',
    TOO_LARGE:        'Fichier trop lourd (10 Mo max)',
    NOT_FOUND:        'Room introuvable',
    NO_FILE:          'Aucun fichier reçu',
  };

  let dragOver = false;
  let inputEl: HTMLInputElement;
  let folderInputEl: HTMLInputElement;
  let downloadingKey: string | null = null;

  // Entrées locales affichées immédiatement à la sélection, avant même que
  // le serveur ait répondu — sinon rien ne bouge à l'écran pendant tout
  // le round-trip réseau (upload silencieux, semble figé).
  interface PendingUpload { id: string; name: string; size: number; error?: string }
  let pending: PendingUpload[] = [];

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

  async function upload(file: File, pendingId: string) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await apiFetch(`/room/${roomId}/upload`, {
        method: 'POST', body: fd, credentials: 'include'
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = ERROR_MESSAGES[body?.error] ?? `Upload refusé (${res.status})`;
        pending = pending.map(p => p.id === pendingId ? { ...p, error: msg } : p);
        pushToast(`${file.name} — ${msg}`, 'info', 4500);
        setTimeout(() => { pending = pending.filter(p => p.id !== pendingId); }, 4000);
        return;
      }
      // server broadcast 'files:updated' via socket remplace l'entrée pending
      pending = pending.filter(p => p.id !== pendingId);
    } catch {
      const msg = 'Erreur réseau pendant l\'upload';
      pending = pending.map(p => p.id === pendingId ? { ...p, error: msg } : p);
      pushToast(`${file.name} — ${msg}`, 'info', 4500);
      setTimeout(() => { pending = pending.filter(p => p.id !== pendingId); }, 4000);
    }
  }

  function uploadBatch(fileList: File[]) {
    if (!$isOnline) {
      pushToast('Upload impossible hors ligne — reconnectez-vous puis réessayez', 'info', 5000);
      return;
    }
    if (fileList.length === 0) return;

    // Vérif proactive du lot AVANT tout envoi — évite un échec partiel
    // silencieux au milieu d'un dossier (certains fichiers passent, d'autres
    // non, sans qu'on comprenne pourquoi). Reflète le cap serveur
    // MAX_ROOM_BYTES (50 Mo cumulés/room), vérifié ici en amont.
    if (fileList.length > 1) {
      const totalBytes = fileList.reduce((s, f) => s + f.size, 0);
      if (totalBytes > MAX_BATCH_BYTES) {
        pushToast(`Lot trop volumineux (${fmtSize(totalBytes)} > 50 Mo) — rien n'a été envoyé`, 'info', 6000);
        return;
      }
    }

    for (const file of fileList) {
      if (file.size > MAX_FILE_BYTES) {
        pushToast(`${file.name} — Fichier trop lourd (10 Mo max)`, 'info', 4000);
        continue;
      }
      const id = crypto.randomUUID();
      pending = [...pending, { id, name: file.name, size: file.size }];
      upload(file, id);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault(); dragOver = false;
    if (!e.dataTransfer?.files) return;
    uploadBatch(Array.from(e.dataTransfer.files));
  }
  function onPick(e: Event) {
    const t = e.target as HTMLInputElement;
    if (!t.files) return;
    uploadBatch(Array.from(t.files));
    t.value = '';
  }
  // webkitdirectory n'est pas dans les types HTML standard (attribut
  // non-standard mais largement supporté) — posé via action plutôt que
  // prop pour éviter l'erreur de typage.
  function webkitdir(node: HTMLInputElement) {
    node.setAttribute('webkitdirectory', '');
  }

  function onDelete(f: RoomFile) {
    if (!$isAdmin) return;
    getSocket().emit('file:delete', { fileKey: f.key });
  }
  async function onDownload(f: RoomFile) {
    downloadingKey = f.key;
    try {
      await downloadFile(apiUrl(f.url), f.name);
    } catch {
      pushToast(`Téléchargement de ${f.name} échoué`, 'info', 4000);
    } finally {
      downloadingKey = null;
    }
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
      <span class="zone-tag">10 Mo/fichier · 50 Mo/room · 24h</span>
    </div>
    <p class="zone-desc">Déposez des fichiers (ou un dossier entier) pour les partager avec tous les participants. Ils expirent automatiquement après 24h.</p>
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
    <div class="dz-sub mono">10 Mo/fichier · 50 Mo/dossier</div>
    <button
      class="btn btn-ghost folder-btn"
      on:click|stopPropagation={() => folderInputEl.click()}
    >
      Importer un dossier
    </button>
    <input bind:this={inputEl} type="file" multiple hidden on:change={onPick} />
    <input
      bind:this={folderInputEl} type="file" multiple hidden on:change={onPick}
      use:webkitdir
    />
  </div>

  {#if pending.length > 0 || $files.length > 0}
    <div class="file-list">
      {#each pending as p (p.id)}
        <div class="file-card pending" class:has-error={!!p.error}>
          <div class="file-ico"><span class="spinner-mini"></span></div>
          <div class="file-meta">
            <div class="file-name">{p.name}</div>
            <div class="file-sub">{fmtSize(p.size)} · {p.error ?? 'Envoi en cours…'}</div>
          </div>
        </div>
      {/each}
      {#each $files as f (f.key)}
        <div class="file-card">
          <div class="file-ico" style="background:{getFileIconStyle(f.name).bg}; color:{getFileIconStyle(f.name).fg};">
            {getFileIconLabel(f.name)}
          </div>
          <div class="file-meta">
            <div class="file-name">{f.name}</div>
            <div class="file-sub">{fmtSize(f.size)} · {fmtExpiry(f.expiresAt)}</div>
          </div>
          <div class="file-actions">
            <button
              class="icon-btn" disabled={downloadingKey === f.key}
              on:click={() => onDownload(f)} title="Télécharger" aria-label="Télécharger {f.name}"
            >
              {#if downloadingKey === f.key}
                <span class="spinner-mini"></span>
              {:else}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2v8M5 7.5L8 10.5l3-3M3 13h10"
                        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {/if}
            </button>
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
  .folder-btn { margin-top: 6px; font-size: 12.5px; padding: 8px 16px; min-height: 0; }

  .file-list { display: flex; flex-direction: column; gap: 10px; }
  .file-card {
    display: flex; align-items: center; gap: 16px; padding: 16px 18px;
    background: var(--surface); border-radius: var(--r-md);
    box-shadow: 0 2px 12px rgba(0,0,0,0.05);
  }
  .file-card.pending { opacity: 0.75; }
  .file-card.has-error { opacity: 1; box-shadow: 0 0 0 1px rgba(244,168,168,0.5); }
  .file-ico {
    /* background/color posés inline par fichier — voir lib/utils/fileIcon.ts */
    width: 40px; height: 40px; border-radius: var(--r-sm);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-mono); font-size: 11px; font-weight: 500;
    flex-shrink: 0; background: var(--navy-06);
  }
  .spinner-mini {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid var(--navy-12); border-top-color: var(--navy-50);
    animation: spin .7s linear infinite; display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
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
  .icon-btn:disabled { cursor: default; opacity: 0.7; }
  .icon-btn.danger:hover { background: rgba(244,168,168,0.25); color: #B05656; }
</style>
