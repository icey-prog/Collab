#!/usr/bin/env node
/**
 * Compile le backend Node en binaire standalone via `pkg`, puis le copie
 * dans src-tauri/binaries/ avec le bon nom de target-triple Rust.
 *
 * Pipeline :
 *   1. esbuild : TypeScript → dist/server.bundle.cjs  (bundle CJS complet, résout les exports
 *                conditionnels de lib0/yjs que pkg ne sait pas gérer seul)
 *   2. pkg     : dist/server.bundle.cjs → exe standalone par platform
 *
 * Pré-requis :
 *   npm i -g pkg
 *   (esbuild est déjà dans devDependencies du backend)
 *
 * Usage :
 *   node scripts/build-sidecar.mjs
 *   node scripts/build-sidecar.mjs --target=win   # Windows seul
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BACKEND = resolve(ROOT, '../backend');
const BINS = resolve(ROOT, 'src-tauri/binaries');

const args = process.argv.slice(2);
const targetArg = args.find(a => a.startsWith('--target'))?.split('=')[1];

// Mapping pkg target → Rust target triple (suffixe attendu par Tauri)
const TARGETS = {
  win:   { pkg: 'node22-win-x64',     triple: 'x86_64-pc-windows-msvc',  ext: '.exe' },
  mac:   { pkg: 'node22-macos-x64',   triple: 'x86_64-apple-darwin',     ext: ''     },
  macA:  { pkg: 'node22-macos-arm64', triple: 'aarch64-apple-darwin',    ext: ''     },
  linux: { pkg: 'node22-linux-x64',   triple: 'x86_64-unknown-linux-gnu', ext: ''    },
};

function currentTargetKey() {
  const p = platform();
  if (p === 'win32')  return 'win';
  if (p === 'darwin') return arch() === 'arm64' ? 'macA' : 'mac';
  return 'linux';
}

const selected = targetArg
  ? [targetArg]
  : process.env.CI
  ? Object.keys(TARGETS)
  : [currentTargetKey()];

console.log(`▶ Targets : ${selected.join(', ')}`);

// 1. Bundle TypeScript via esbuild → dist/server.bundle.cjs
//
// IMPORTANT — Pourquoi esbuild et pas tsc seul ?
//   lib0 (dépendance de yjs) utilise les "conditional exports" ESM/CJS dans son package.json.
//   pkg seul (alimenté par le tsc output ESM) tente de résoudre ces exports au RUNTIME via le
//   système de fichiers du snapshot → cherche "C:\snapshot\...\lib0\dist\array.cjs" → MODULE_NOT_FOUND.
//   esbuild --bundle résout statiquement TOUS les modules au BUILD TIME et produit un seul fichier
//   CJS auto-suffisant : aucun lookup dynamique au runtime → aucun MODULE_NOT_FOUND.
console.log('▶ esbuild bundle (CJS, résolution statique des modules)…');
const bundleOut = join(BACKEND, 'dist', 'server.bundle.cjs');
execSync(
  `npx esbuild src/server.ts --bundle --platform=node --format=cjs --target=node22 --outfile="${bundleOut}" --log-level=warning`,
  { cwd: BACKEND, stdio: 'inherit' },
);
console.log(`✓ Bundle : ${bundleOut}`);

// 2. Vérifier pkg installé
try { execSync('pkg --version', { stdio: 'pipe' }); }
catch {
  console.error('✗ pkg non trouvé. Installer : npm i -g pkg');
  process.exit(1);
}

mkdirSync(BINS, { recursive: true });

// 3. Boucler les targets : pkg emballe le bundle CJS (simple fichier, sans exports conditionnels)
for (const key of selected) {
  const t = TARGETS[key];
  if (!t) { console.error(`✗ Target inconnue : ${key}`); continue; }

  const tmpOut = resolve(BINS, `_tmp-${key}${t.ext}`);
  console.log(`▶ pkg ${t.pkg}…`);
  execSync(
    `pkg "${bundleOut}" --targets ${t.pkg} --output "${tmpOut}"`,
    { stdio: 'inherit' },
  );

  // Tauri attend : collab-backend-<triple><ext>
  const finalPath = resolve(BINS, `collab-backend-${t.triple}${t.ext}`);
  copyFileSync(tmpOut, finalPath);
  rmSync(tmpOut);
  console.log(`✓ ${finalPath}`);
}

console.log('\n✓ Sidecar(s) bâti(s).');
