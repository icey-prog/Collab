/**
 * Zippe un ensemble de fichiers (avec leurs chemins relatifs) en un seul
 * File .zip, côté client — streaming via fflate.
 *
 * Pourquoi ZipPassThrough (store, sans compression) : la plupart des gros
 * contenus (images, vidéos, PDF) sont déjà compressés — deflater en JS sur
 * le main thread gèlerait l'onglet pendant des secondes sur 300 Mo, pour
 * un gain quasi nul. Le store ne fait que concaténer + CRC32 : rapide et
 * la structure du dossier est intégralement préservée dans l'archive.
 */
import { Zip, ZipPassThrough } from 'fflate';

export interface FileWithPath {
  file: File;
  /** Chemin relatif dans l'archive, ex. "Photos/2024/img.jpg" */
  path: string;
}

/**
 * Zippe en ReadableStream — consommable directement par un fetch() en
 * streaming (body: stream, duplex: 'half'), sans attendre la fin de la
 * compression avant d'envoyer le moindre octet. C'est ce qui permet à la
 * compression et à l'upload réseau de se chevaucher au lieu de s'additionner
 * (avant : zip complet PUIS upload complet = deux fois plus long).
 */
export function zipStream(
  entries: FileWithPath[],
  onProgress?: (processedBytes: number, totalBytes: number) => void,
): ReadableStream<Uint8Array> {
  const totalBytes = entries.reduce((s, e) => s + e.file.size, 0);
  let processedBytes = 0;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return; }
        if (chunk) controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        for (const { file, path } of entries) {
          const zipEntry = new ZipPassThrough(path);
          zip.add(zipEntry);
          const reader = file.stream().getReader();
          for (;;) {
            const { done: eof, value } = await reader.read();
            if (eof) { zipEntry.push(new Uint8Array(0), true); break; }
            zipEntry.push(value);
            processedBytes += value.byteLength;
            onProgress?.(processedBytes, totalBytes);
          }
        }
        zip.end();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

/**
 * Variante qui matérialise le zip en File — fallback pour les navigateurs
 * sans support de fetch() en streaming (Safari notamment, cf. supportsStreamingUpload
 * dans FilesModule.svelte). Zip et upload redeviennent séquentiels ici.
 */
export async function zipFiles(
  entries: FileWithPath[],
  zipName: string,
  onProgress?: (processedBytes: number, totalBytes: number) => void,
): Promise<File> {
  const reader = zipStream(entries, onProgress).getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new File(chunks as BlobPart[], zipName, { type: 'application/zip' });
}
