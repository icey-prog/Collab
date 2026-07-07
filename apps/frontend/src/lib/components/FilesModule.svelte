<script lang="ts">
  import { files, type RoomFile } from '$lib/stores/files';
  import { isAdmin, pushToast } from '$lib/stores/room';
  import { getSocket } from '$lib/socket';
  import { isOnline } from '$lib/stores/network';
  import { apiUrl, downloadFile } from '$lib/api/http';
  import { getFileIconLabel, getFileIconStyle } from '$lib/utils/fileIcon';
  import { zipFiles, type FileWithPath } from '$lib/utils/zipFolder';

  export let roomId: string;

  const MAX_FILE_BYTES = 500 * 1024 * 1024;    // reflète le cap serveur MAX_FILE_BYTES
  const MAX_BATCH_BYTES = 1024 * 1024 * 1024;  // reflète le cap serveur MAX_ROOM_BYTES

  const ERROR_MESSAGES: Record<string, string> = {
    ROOM_QUOTA_FULL:  'Quota de la room atteint (1 Go cumulés)',
    ROOM_FILES_LIMIT: 'Trop de fichiers dans cette room (20 max)',
    TOO_LARGE:        'Fichier trop lourd (500 Mo max)',
    NOT_FOUND:        'Room introuvable',
    NO_FILE:          'Aucun fichier reçu',
  };

  let dragOver = false;
  let inputEl: HTMLInputElement;
  let folderInputEl: HTMLInputElement;
  let downloadingKey: string | null = null;

  // Entrées locales affichées immédiatement à la sélection, avant même que
  // le serveur ait répondu — avec une progression réelle (%) : sans ça,
  // gros fichier ou dossier = plusieurs secondes/minutes de "Envoi en
  // cours…" figé, l'utilisateur ne sait pas si ça avance ou si c'est bloqué.
  interface PendingUpload {
    id: string; name: string; size: number; progress: number;
    phase: 'zipping' | 'uploading'; error?: string;
  }
  let pending: PendingUpload[] = [];

  function updatePending(id: string, patch: Partial<PendingUpload>) {
    pending = pending.map(p => (p.id === id ? { ...p, ...patch } : p));
  }
  function dropPendingAfterDelay(id: string, ms = 4000) {
    setTimeout(() => { pending = pending.filter(p => p.id !== id); }, ms);
  }

  function fmtSize(b: number) {
    if (b < 1024) return `${b} o`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} Go`;
  }
  function fmtExpiry(at: number) {
    const left = at - Date.now();
    if (left <= 0) return 'expiré';
    const h = Math.floor(left / 3.6e6);
    return h > 0 ? `Expire dans ${h}h` : 'Expire <1h';
  }

  // XHR (pas fetch) : c'est le seul moyen fiable inter-navigateurs d'obtenir
  // une progression d'upload en temps réel via xhr.upload.onprogress —
  // fetch() ne l'expose pas.
  function upload(file: File, pendingId: string): Promise<void> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl(`/room/${roomId}/upload`));
      xhr.withCredentials = true;

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        updatePending(pendingId, { progress: Math.round((e.loaded / e.total) * 100) });
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // server broadcast 'files:updated' via socket remplace l'entrée pending
          pending = pending.filter(p => p.id !== pendingId);
        } else {
          let serverError: string | undefined;
          try { serverError = JSON.parse(xhr.responseText)?.error; } catch { /* réponse non-JSON */ }
          const msg = ERROR_MESSAGES[serverError ?? ''] ?? `Upload refusé (${xhr.status})`;
          updatePending(pendingId, { error: msg });
          pushToast(`${file.name} — ${msg}`, 'info', 4500);
          dropPendingAfterDelay(pendingId);
        }
        resolve();
      };
      xhr.onerror = () => {
        const msg = 'Erreur réseau pendant l\'upload';
        updatePending(pendingId, { error: msg });
        pushToast(`${file.name} — ${msg}`, 'info', 4500);
        dropPendingAfterDelay(pendingId);
        resolve();
      };

      const fd = new FormData();
      fd.append('file', file);
      xhr.send(fd);
    });
  }

  interface UploadItem { file: File; pendingId?: string }

  function uploadBatch(items: UploadItem[]) {
    if (!$isOnline) {
      pushToast('Upload impossible hors ligne — reconnectez-vous puis réessayez', 'info', 5000);
      return;
    }
    if (items.length === 0) return;

    // Vérif proactive du lot AVANT tout envoi — évite un échec partiel
    // silencieux au milieu d'un dossier (certains fichiers passent, d'autres
    // non, sans qu'on comprenne pourquoi). Reflète le cap serveur
    // MAX_ROOM_BYTES (1 Go cumulés/room), vérifié ici en amont.
    if (items.length > 1) {
      const totalBytes = items.reduce((s, i) => s + i.file.size, 0);
      if (totalBytes > MAX_BATCH_BYTES) {
        pushToast(`Lot trop volumineux (${fmtSize(totalBytes)} > 1 Go) — rien n'a été envoyé`, 'info', 6000);
        return;
      }
    }

    for (const { file, pendingId } of items) {
      if (file.size > MAX_FILE_BYTES) {
        pushToast(`${file.name} — Fichier trop lourd (500 Mo max)`, 'info', 4000);
        if (pendingId) pending = pending.filter(p => p.id !== pendingId);
        continue;
      }
      if (pendingId) {
        // Réutilise l'entrée déjà créée pendant la compression du dossier —
        // évite une 2e carte qui apparaîtrait juste après la 1ère.
        updatePending(pendingId, { phase: 'uploading', progress: 0, size: file.size });
        upload(file, pendingId);
      } else {
        const id = crypto.randomUUID();
        pending = [...pending, { id, name: file.name, size: file.size, progress: 0, phase: 'uploading' }];
        upload(file, id);
      }
    }
  }

  // Lit récursivement un dossier glissé, en conservant le chemin relatif de
  // chaque fichier (entry.fullPath). dataTransfer.files traite un dossier
  // déposé comme un faux "fichier" de 0 octet — l'API FileSystemEntry donne
  // accès au vrai contenu.
  async function readEntry(entry: FileSystemEntry): Promise<FileWithPath[]> {
    if (entry.isFile) {
      return new Promise((resolve) => {
        (entry as FileSystemFileEntry).file(
          (file) => resolve([{ file, path: entry.fullPath.replace(/^\//, '') }]),
          () => resolve([]),
        );
      });
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const allEntries: FileSystemEntry[] = [];
      // readEntries() ne renvoie pas tout en un seul appel pour les gros
      // dossiers — il faut boucler jusqu'à obtenir un lot vide.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve) => {
          reader.readEntries(resolve, () => resolve([]));
        });
        if (batch.length === 0) break;
        allEntries.push(...batch);
      }
      const nested = await Promise.all(allEntries.map(readEntry));
      return nested.flat();
    }
    return [];
  }

  /* Un dossier = UNE archive .zip = UN upload. Deux problèmes réglés d'un
   * coup : les fichiers n'arrivent plus "en vrac" dissociés de leur dossier,
   * et un dossier de N fichiers ne part plus en N requêtes parallèles — ce
   * qui percutait le rate-limit serveur (10 uploads/min) dès 11 fichiers :
   * rafale de 429, toasts en cascade, cartes bloquées (le "bug" observé
   * sur le dossier de 300 Mo, invisible pour les autres participants).
   *
   * Carte "Compression…" affichée dès le départ avec progression réelle
   * (octets traités / total) — la compression d'un gros dossier peut
   * prendre plusieurs secondes, et cette étape précède même l'upload :
   * sans retour visuel ici, c'est le premier "moment de blanc" perçu.
   * La même carte (même id) bascule ensuite en phase "uploading" au lieu
   * d'en créer une seconde. */
  async function zipFolderWithProgress(
    entries: FileWithPath[], folderName: string,
  ): Promise<UploadItem | null> {
    const totalBytes = entries.reduce((s, e) => s + e.file.size, 0);
    const id = crypto.randomUUID();
    const zipName = `${folderName}.zip`;
    pending = [...pending, { id, name: zipName, size: totalBytes, progress: 0, phase: 'zipping' }];

    try {
      const file = await zipFiles(entries, zipName, (done, total) => {
        updatePending(id, { progress: total > 0 ? Math.round((done / total) * 100) : 0 });
      });
      return { file, pendingId: id };
    } catch {
      updatePending(id, { error: `Impossible de préparer ${folderName}` });
      dropPendingAfterDelay(id);
      return null;
    }
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault(); dragOver = false;

    const items = e.dataTransfer?.items;
    if (items && items.length > 0) {
      const entries = Array.from(items)
        .map((it) => it.webkitGetAsEntry())
        .filter((en): en is FileSystemEntry => en !== null);
      if (entries.length > 0) {
        const toUpload: UploadItem[] = [];
        for (const entry of entries) {
          if (entry.isDirectory) {
            const collected = await readEntry(entry);
            if (collected.length === 0) continue;
            const zip = await zipFolderWithProgress(collected, entry.name);
            if (zip) toUpload.push(zip);
          } else {
            const collected = await readEntry(entry);
            toUpload.push(...collected.map((c) => ({ file: c.file })));
          }
        }
        uploadBatch(toUpload);
        return;
      }
    }

    if (!e.dataTransfer?.files) return;
    uploadBatch(Array.from(e.dataTransfer.files).map((file) => ({ file })));
  }

  function onPick(e: Event) {
    const t = e.target as HTMLInputElement;
    if (!t.files) return;
    uploadBatch(Array.from(t.files).map((file) => ({ file })));
    t.value = '';
  }

  /* Sélection via "Importer un dossier" (webkitdirectory) : le navigateur
   * aplatit tout en une liste de File avec webkitRelativePath — on regroupe
   * par dossier racine et chaque groupe devient une archive. */
  async function onPickFolder(e: Event) {
    const t = e.target as HTMLInputElement;
    if (!t.files || t.files.length === 0) return;
    const all = Array.from(t.files);
    t.value = '';

    const groups = new Map<string, FileWithPath[]>();
    for (const file of all) {
      const rel = file.webkitRelativePath || file.name;
      const top = rel.split('/')[0];
      const group = groups.get(top) ?? [];
      group.push({ file, path: rel });
      groups.set(top, group);
    }

    const zips: UploadItem[] = [];
    for (const [folderName, entries] of groups) {
      const zip = await zipFolderWithProgress(entries, folderName);
      if (zip) zips.push(zip);
    }
    uploadBatch(zips);
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
      <span class="zone-tag">500 Mo/fichier · 1 Go/room · 24h</span>
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
    <div class="dz-sub mono">500 Mo/fichier · 1 Go/dossier</div>
    <button
      class="btn btn-ghost folder-btn"
      on:click|stopPropagation={() => folderInputEl.click()}
    >
      Importer un dossier
    </button>
    <!-- stopPropagation ici : sans ça, le .click() programmatique déclenché
         par le bouton "Importer un dossier" (ou un futur clic direct sur ces
         inputs) émet son propre événement clic qui remonte au .dropzone
         parent et rouvre EN PLUS le sélecteur de fichiers classique — deux
         zones d'upload s'ouvrent simultanément. Le stopPropagation du bouton
         ne protège que SON click à lui, pas celui, distinct, de l'input. -->
    <input bind:this={inputEl} type="file" multiple hidden on:change={onPick} on:click|stopPropagation />
    <input
      bind:this={folderInputEl} type="file" multiple hidden on:change={onPickFolder}
      on:click|stopPropagation
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
            <div class="file-sub">
              {fmtSize(p.size)} ·
              {#if p.error}
                {p.error}
              {:else if p.phase === 'zipping'}
                Compression du dossier… {p.progress}%
              {:else}
                Envoi en cours… {p.progress}%
              {/if}
            </div>
            {#if !p.error}
              <div class="progress-track">
                <div class="progress-fill" style="width: {p.progress}%"></div>
              </div>
            {/if}
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
  .progress-track {
    height: 4px; border-radius: 2px; background: var(--navy-08);
    margin-top: 8px; overflow: hidden;
  }
  .progress-fill {
    height: 100%; background: var(--chartreuse);
    transition: width .2s ease;
  }
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
