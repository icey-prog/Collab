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

export async function zipFiles(entries: FileWithPath[], zipName: string): Promise<File> {
  const chunks: Uint8Array[] = [];
  let resolveDone!: () => void;
  let rejectDone!: (e: Error) => void;
  const done = new Promise<void>((res, rej) => { resolveDone = res; rejectDone = rej; });

  const zip = new Zip((err, chunk, final) => {
    if (err) { rejectDone(err); return; }
    if (chunk) chunks.push(chunk);
    if (final) resolveDone();
  });

  for (const { file, path } of entries) {
    const zipEntry = new ZipPassThrough(path);
    zip.add(zipEntry);
    const reader = file.stream().getReader();
    for (;;) {
      const { done: eof, value } = await reader.read();
      if (eof) { zipEntry.push(new Uint8Array(0), true); break; }
      zipEntry.push(value);
    }
  }
  zip.end();
  await done;
  return new File(chunks as BlobPart[], zipName, { type: 'application/zip' });
}
