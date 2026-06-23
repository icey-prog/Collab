#!/usr/bin/env node
/**
 * Compile le backend Node en binaire standalone via `pkg`, puis le copie
 * dans src-tauri/binaries/ avec le bon nom de target-triple Rust.
 *
 * Pré-requis :
 *   npm i -g pkg
 *
 * Usage :
 *   node scripts/build-sidecar.mjs
 *   node scripts/build-sidecar.mjs --target win   # Windows seul
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

// 1. Build TypeScript backend
console.log('▶ TypeScript build…');
execSync('npm run build', { cwd: BACKEND, stdio: 'inherit' });

// 2. Vérifier pkg installé
try { execSync('pkg --version', { stdio: 'pipe' }); }
catch {
  console.error('✗ pkg non trouvé. Installer : npm i -g pkg');
  process.exit(1);
}

mkdirSync(BINS, { recursive: true });

// 3. Boucler les targets
for (const key of selected) {
  const t = TARGETS[key];
  if (!t) { console.error(`✗ Target inconnue : ${key}`); continue; }

  const tmpOut = resolve(BINS, `_tmp-${key}${t.ext}`);
  console.log(`▶ pkg ${t.pkg}…`);
  execSync(
    `pkg ${join(BACKEND, 'dist/server.js')} --targets ${t.pkg} --output "${tmpOut}"`,
    { stdio: 'inherit' },
  );

  // Tauri attend : collab-backend-<triple><ext>
  const finalPath = resolve(BINS, `collab-backend-${t.triple}${t.ext}`);
  copyFileSync(tmpOut, finalPath);
  rmSync(tmpOut);
  console.log(`✓ ${finalPath}`);
}

console.log('\n✓ Sidecar(s) bâti(s).');
