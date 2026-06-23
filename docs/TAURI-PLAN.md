# TAURI DESKTOP — Plan d'implémentation (Lot G, v2)

> **Statut** : ✅ Build MVP livré (juin 2026) · 🟡 bugs distribution Windows trackés §14
> **Objectif** : transformer Collab en app native Windows/Mac/Linux qui démarre son propre backend (sidecar), expose son IP LAN, et facilite l'usage sans dépendance externe.
> **Coût total estimé** : 12h (1.5j) phase 1 — sidecar + commandes essentielles. +6h phase 2 — live block edit (variante B notes). +3h Option C port dynamique §14.
>
> **État actuel** : Option A (port hardcoded 47931) appliquée pour démo testeurs. Option C (port dynamique + readiness + lifecycle) à coder pour release publique.

---

## 1. Pourquoi Tauri (vs Electron, PWA seule)

| Critère                | PWA browser | Electron | Tauri |
|------------------------|-------------|----------|-------|
| Taille livrable        | 0           | ~120 Mo  | ~45 Mo |
| RAM idle               | partagée    | ~200 Mo  | ~30 Mo |
| Démarrage backend auto | ✗           | ✓        | ✓ |
| Accès réseau natif     | ✗           | ✓        | ✓ |
| Sécurité (sandbox)     | bonne       | moyenne  | excellente |
| Auto-update            | ✗           | ✓ (lourd)| ✓ (léger) |
| Sidecar binary         | impossible  | possible | natif |

→ Tauri = bon compromis perfs / sécurité / taille pour une app desktop légère.

---

## 2. Architecture cible

```
┌────────────────────────────────────────────────────┐
│  Collab Desktop (Tauri)                             │
│                                                     │
│  ┌──────────────────────────────────┐               │
│  │  WebView (SvelteKit static)      │               │
│  │  - Même UI qu'en browser         │               │
│  │  - isTauri() === true            │               │
│  └──────────┬───────────────────────┘               │
│             │ invoke('start_backend')               │
│             │ invoke('get_local_ip')                │
│             ▼                                       │
│  ┌──────────────────────────────────┐               │
│  │  Rust core (src-tauri/)          │               │
│  │  - Spawn sidecar process         │               │
│  │  - Network helpers               │               │
│  │  - Tray icon + lifecycle         │               │
│  └──────────┬───────────────────────┘               │
│             │ spawn child                            │
│             ▼                                       │
│  ┌──────────────────────────────────┐               │
│  │  Node.js sidecar (collab-back)   │               │
│  │  Fastify + Socket.io :3001       │               │
│  └──────────────────────────────────┘               │
└────────────────────────────────────────────────────┘
                    ▲          ▲          ▲
                    │          │          │
              ┌─────┴───┐  ┌───┴────┐  ┌──┴──────┐
              │ Phone   │  │ Laptop │  │ Tablet  │
              │ PWA scan│  │ browser│  │ browser │
              └─────────┘  └────────┘  └─────────┘
              (sur le même LAN ou hotspot Windows)
```

---

## 3. Structure projet à créer

```
apps/desktop/
├── package.json                 # déps : @tauri-apps/cli, @tauri-apps/api
├── src-tauri/
│   ├── Cargo.toml               # crate Rust
│   ├── tauri.conf.json          # config bundle, sidecar, icônes, MSI
│   ├── icons/                   # générées via `tauri icon path/to/512.png`
│   │   ├── 32x32.png
│   │   ├── 128x128.png
│   │   ├── icon.ico             # Windows
│   │   └── icon.icns            # Mac
│   ├── binaries/
│   │   ├── collab-backend-x86_64-pc-windows-msvc.exe
│   │   ├── collab-backend-x86_64-apple-darwin
│   │   ├── collab-backend-aarch64-apple-darwin
│   │   └── collab-backend-x86_64-unknown-linux-gnu
│   └── src/
│       ├── main.rs              # entry, init Tauri builder
│       ├── commands.rs          # toutes les #[tauri::command]
│       ├── sidecar.rs           # spawn/kill Node backend
│       ├── network.rs           # IP LAN + détection hotspot
│       ├── settings.rs          # ouvrir panneaux Settings OS
│       └── tray.rs              # tray icon + menu
```

---

## 4. Bundle du sidecar Node.js

**Problème** : embarquer Node.js + node_modules = +60 Mo. Solution : compiler le backend en binaire standalone.

**Options évaluées** :

| Outil   | Taille | Vitesse | Maturité Windows |
|---------|--------|---------|------------------|
| `pkg`   | ~38 Mo | bonne   | excellente (long historique) |
| `nexe`  | ~42 Mo | bonne   | moyenne |
| `node-sea` (Node 21+ Single Executable Apps) | ~35 Mo | bonne | en stabilisation |
| `bun build --compile` | ~70 Mo | excellent | bonne |

**Choix** : `pkg` pour MVP (le plus stable cross-platform), migration `node-sea` quand officiel stable.

**Pipeline de build** :
```bash
cd apps/backend
npm run build                                   # tsc → dist/
pkg dist/server.js --targets node20-win-x64,node20-macos-x64,node20-linux-x64
mv collab-backend-win.exe ../desktop/src-tauri/binaries/collab-backend-x86_64-pc-windows-msvc.exe
# (idem mac, linux avec noms triples Rust)
```

**Tauri config** (`tauri.conf.json`) :
```json
{
  "tauri": {
    "bundle": {
      "externalBin": ["binaries/collab-backend"]
    }
  }
}
```
→ Tauri détecte automatiquement le triple courant à l'exécution.

---

## 5. Commandes Rust à implémenter

### 5.1 `start_backend()` — `src-tauri/src/sidecar.rs`

```rust
use tauri::api::process::{Command, CommandEvent};
use std::sync::Mutex;

pub struct SidecarState(pub Mutex<Option<tauri::api::process::CommandChild>>);

#[tauri::command]
pub async fn start_backend(state: tauri::State<'_, SidecarState>) -> Result<bool, String> {
    let mut guard = state.0.lock().unwrap();
    if guard.is_some() { return Ok(true); } // déjà tournant

    let (mut rx, child) = Command::new_sidecar("collab-backend")
        .map_err(|e| e.to_string())?
        .spawn()
        .map_err(|e| e.to_string())?;

    // Listen logs pour debug
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stdout(line) = event {
                println!("[backend] {}", line);
            }
        }
    });

    *guard = Some(child);
    Ok(true)
}
```

### 5.2 `stop_backend()` — clean shutdown

```rust
#[tauri::command]
pub fn stop_backend(state: tauri::State<'_, SidecarState>) -> bool {
    if let Some(child) = state.0.lock().unwrap().take() {
        let _ = child.kill();
        return true;
    }
    false
}
```

### 5.3 `get_local_ip()` — `src-tauri/src/network.rs`

```rust
// Cargo.toml : local-ip-address = "0.6"
use local_ip_address::local_ip;

#[tauri::command]
pub fn get_local_ip() -> Option<String> {
    local_ip().ok().map(|ip| ip.to_string())
}
```

### 5.4 `check_hotspot_active()` — Windows uniquement

```rust
use std::process::Command as StdCommand;

#[tauri::command]
pub fn check_hotspot_active() -> bool {
    #[cfg(target_os = "windows")]
    {
        let out = StdCommand::new("netsh")
            .args(["wlan", "show", "hostednetwork"])
            .output();
        if let Ok(out) = out {
            let stdout = String::from_utf8_lossy(&out.stdout);
            return stdout.contains("Status                 : Started");
        }
    }
    false
}
```

### 5.5 `open_hotspot_settings()` — ouvre panneau Settings

```rust
#[tauri::command]
pub fn open_hotspot_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let cmd = StdCommand::new("cmd")
        .args(["/c", "start", "ms-settings:network-mobilehotspot"])
        .spawn();

    #[cfg(target_os = "macos")]
    let cmd = StdCommand::new("open")
        .args(["x-apple.systempreferences:com.apple.preferences.sharing"])
        .spawn();

    #[cfg(target_os = "linux")]
    let cmd = StdCommand::new("gnome-control-center")
        .args(["wifi"])
        .spawn();

    cmd.map(|_| ()).map_err(|e| e.to_string())
}
```

### 5.6 `get_app_version()` — pour affichage UI

```rust
#[tauri::command]
pub fn get_app_version() -> &'static str { env!("CARGO_PKG_VERSION") }
```

### 5.7 Setup `main.rs`

```rust
mod commands; mod sidecar; mod network; mod settings; mod tray;
use sidecar::SidecarState;
use std::sync::Mutex;

fn main() {
    tauri::Builder::default()
        .manage(SidecarState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            sidecar::start_backend,
            sidecar::stop_backend,
            network::get_local_ip,
            network::check_hotspot_active,
            settings::open_hotspot_settings,
            commands::get_app_version,
        ])
        .system_tray(tray::build_tray())
        .on_system_tray_event(tray::handle_tray_event)
        .on_window_event(|e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e.event() {
                e.window().hide().unwrap(); api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("erreur Tauri");
}
```

---

## 6. Tray icon (Windows/Mac)

Menu : "Ouvrir Collab" · "État backend : ●" · "Arrêter le backend" · "Quitter".
→ Permet à l'app de tourner cachée pendant la session.

```rust
// src-tauri/src/tray.rs
use tauri::{CustomMenuItem, SystemTray, SystemTrayMenu, SystemTrayMenuItem, SystemTrayEvent};

pub fn build_tray() -> SystemTray {
    let open = CustomMenuItem::new("open", "Ouvrir Collab");
    let stop = CustomMenuItem::new("stop", "Arrêter le backend");
    let quit = CustomMenuItem::new("quit", "Quitter");
    let menu = SystemTrayMenu::new()
        .add_item(open)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(stop)
        .add_item(quit);
    SystemTray::new().with_menu(menu)
}
```

---

## 7. Côté front (Svelte) — modifs minimales

Le fichier `apps/frontend/src/lib/tauri.ts` existe déjà avec les stubs. À l'activation Tauri :

```ts
// Aucun changement de signature — les stubs deviennent réels via window.__TAURI__.invoke()
export const startBackend           = () => invokeSafe<boolean>('start_backend');
export const stopBackend            = () => invokeSafe<boolean>('stop_backend');
export const getLocalIp             = () => invokeSafe<string>('get_local_ip');
export const checkHotspotActive     = () => invokeSafe<boolean>('check_hotspot_active');
export const openHotspotSettings    = () => invokeSafe<void>('open_hotspot_settings');
```

`HotspotHint.svelte` déjà créé en Lot MVP — détecte `isTauri()` et appelle `openHotspotSettings()` au lieu de `window.location.href = 'ms-settings:...'` (qui marche aussi dans WebView Tauri mais moins propre).

---

## 8. Pipeline CI / build

```yaml
# .github/workflows/release-desktop.yml (esquisse)
on:
  push:
    tags: ['v*.*.*-desktop']
jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-22.04]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: npm --prefix apps/backend run build
      - run: npx pkg apps/backend/dist/server.js --targets node20-${{ matrix.os }}-x64 --output apps/desktop/src-tauri/binaries/collab-backend
      - run: npm --prefix apps/frontend run build
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: apps/desktop
          tagName: ${{ github.ref_name }}
          releaseName: 'Collab Desktop ${{ github.ref_name }}'
```

Artefacts produits : `collab-setup-1.0.0.msi` (Windows), `Collab.dmg` (Mac), `collab_1.0.0_amd64.deb` (Linux).

---

## 9. Code signing & UAC

| Plateforme | Besoin | Coût |
|---|---|---|
| Windows | Certificat code signing | ~50€/an (Sectigo OV) — sinon SmartScreen flag "éditeur inconnu" |
| Mac | Apple Developer ID | 99$/an + notarization |
| Linux | Aucun | 0 |

→ MVP : pas de signing, l'utilisateur clique "Exécuter quand même".

---

## 10. Auto-update (phase 2.1)

Tauri Updater intégré, signature Ed25519 :

```json
"updater": {
  "active": true,
  "endpoints": ["https://collab.exxolab.bf/updates/{{target}}-{{arch}}/{{current_version}}"],
  "dialog": true,
  "pubkey": "..."
}
```

Hébergement : Vercel statique ou Fly volume.

---

## 11. Variante B — Live block edit (post-Tauri)

> Reportée après Tauri car nécessite refacto significatif du modèle Y.

### Modèle Y enrichi
Au lieu de `Y.Array<ChatBlock>` avec `text: string`, chaque block possède son propre `Y.Text` :

```ts
type LiveBlock = {
  id:          string;
  authorId:    number;       // clientID Y.Doc — invariant : un block, un auteur
  authorName:  string;
  authorColor: string;
  textKey:     string;       // référence à Y.Text via doc.getText(textKey)
  createdAt:   number;
  state:       'active' | 'frozen'; // active = en train de taper, frozen = figé
};

doc.getMap<LiveBlock>('notes-blocks-meta');  // index ordonné des blocks
doc.getText(textKey)                          // texte vivant par block
```

### Règles
- Quand un user crée un block, il le marque `active`. Tant que `active`, seul lui peut écrire dedans (vérif côté UI).
- Awareness publie `currentBlockId` → autres voient quel block est en édition (animation pulse autour).
- Inactivité 30s → bascule `frozen`, le user récupère un nouveau bloc à la prochaine frappe.
- Curseur autres users visibles UNIQUEMENT dans leur propre block actif (vs partout dans variante A pure chat).

### CodeMirror par block
Chaque bloc actif monte un mini CodeMirror avec `yCollab(yTextDuBloc, awareness)`. Surcharge mémoire estimée : ~2 Mo / block actif (acceptable, max 4 actifs simultanés).

### Pourquoi cette variante n'est pas pour MVP
- 3-4× plus de complexité state machine
- Edge cases (deux users écrivent dans même bloc par race) à gérer
- Migration douce depuis variante A possible (les blocks `Y.Array` deviennent `frozen` legacy)

### Coût estimé
~6h additionnelles après variante A stabilisée.

---

## 12. Limites connues

- Tauri WebView utilise WebView2 (Win) / WKWebView (Mac) — pas Chromium custom. Donc pas de support direct de toutes les API Chrome (ex : `BarcodeDetector` indisponible sur Mac WKWebView).
- Sidecar Node nécessite ~30 Mo de RAM au démarrage + ~50 Mo par room active (Y.Doc + uploads en mémoire).
- Pas de support iOS/Android Tauri sans rebuild (Tauri Mobile en beta — pas pour MVP).

---

## 13. Checklist d'activation

- [ ] `cargo install tauri-cli`
- [ ] `npx pkg --version` (sinon `npm i -g pkg`)
- [ ] `apps/desktop/` créé avec structure ci-dessus
- [ ] `tauri.conf.json` rempli (app id, version, bundle)
- [ ] Icônes générées via `tauri icon ../../landing_preview.png`
- [ ] 6 commandes Rust codées et testées
- [ ] Sidecar Node compilé pour la plateforme courante
- [ ] `npm --prefix apps/desktop run tauri:dev` lance la fenêtre
- [ ] Backend démarre via tray "État backend : ●"
- [ ] QR code affiche IP LAN correcte
- [ ] Bouton "Activer hotspot" ouvre Settings Windows
- [ ] Build release `npm --prefix apps/desktop run tauri:build` produit `.msi`
- [ ] Test d'install sur machine vierge (sans Node, sans Rust)
- [ ] CI release multi-OS configurée

---

*Document de référence — à mettre à jour quand on passe à l'implémentation.*
*Dernière mise à jour : juin 2026.*

---

## 14. Audit `/find-bugs` distribution Windows (juin 2026)

Audit appliqué après build MVP. Issues classées par sévérité avec plan correctif.

### 14.1 Critiques

#### C1 · Port 3001 hardcoded partout — collision → app cassée

**Fichiers** :
- `apps/backend/src/server.ts:41` `PORT ?? 3001`
- `apps/desktop/src-tauri/src/sidecar.rs` spawn sans `--PORT` arg
- `apps/desktop/src-tauri/tauri.conf.json` CSP `http://localhost:3001 ws://localhost:3001`
- `apps/frontend/src/lib/transport.ts` + `socket.ts` assument même-origin OR ENV var build-time

**Évidence** : si Skype / IIS / autre dev tourne sur 3001 → sidecar crash silencieux, app blanche.

**Fix appliqué (Option A)** : port hardcoded **47931** (IANA dynamic range, peu de collisions).
- `server.ts` : default `PORT ?? COLLAB_PORT ?? 3001`
- `sidecar.rs` : `pub const COLLAB_PORT: u16 = 47931;`, spawn avec `.env("COLLAB_PORT", ...)`
- `tauri.conf.json` CSP : `http://localhost:47931 ws://localhost:47931 + 127.0.0.1`
- `tauri.ts` : nouveau `getBackendUrl()` retourne `http://127.0.0.1:47931` en Tauri
- `socket.ts` : refactor en `initSocket()` async + `getSocket()` singleton sync
- `transport.ts` : async, branch `isTauri()` → backend URL absolu
- `api/http.ts` : nouveau wrapper `apiFetch()` qui préfixe selon environnement
- `api/room.ts` : utilise `apiFetch`
- `utils/lan.ts` : utilise `getBackendUrl()` côté Tauri

**Fix complet (Option C, post-MVP)** :
1. `network.rs` : `pick_free_port() -> u16 { TcpListener::bind("127.0.0.1:0") → local_addr().port() }`
2. `sidecar.rs` : stocker port dans `Mutex<u16>`, spawn avec `.env("PORT", port.to_string())`
3. `sidecar.rs` : spawn avec `.env("DATA_DIR", app_data_dir.join("uploads"))` [fix M2 bonus]
4. `network.rs` : `#[tauri::command] fn get_backend_port(state) -> u16` retourne port dynamique
5. `main.rs` : emit `"backend_ready"` event quand sidecar log `Server listening`
6. `main.rs` : log erreurs au lieu de `let _ = ...`
7. Front `tauri.ts` : `waitBackendReady()` = `listen('backend_ready')`
8. Front `+page.svelte` room : `await waitBackendReady()` avant `wire()`, loader "Démarrage du moteur local…"
9. `tauri.conf.json` CSP : `http://localhost:* ws://localhost:*` (portée localhost only, acceptable)
10. `sidecar.rs` race fix H1 : Mutex lock pendant tout spawn (pas seulement check)
11. `sidecar.rs` lifecycle M1 : Job Object Windows / `kill_on_drop(true)`

**Effort** : 2-3 h. Rebuild Tauri ~5 min.

---

#### C2 · `main.rs:34` erreurs sidecar avalées — user voit fenêtre vide

```rust
let _ = sidecar::start_backend(handle.clone(), state).await;
```

**Évidence** : `let _ =` drop le `Result<bool, String>`. Si sidecar fail (port occupé, binaire corrompu) → aucune notif, aucun log visible user, juste WebView vide.

**Fix** :
```rust
match sidecar::start_backend(handle.clone(), state).await {
  Ok(_)  => log::info!("[sidecar] started"),
  Err(e) => {
    log::error!("[sidecar] {}", e);
    let _ = handle.emit_all("backend_failed", &e);
  }
}
```
Front écoute `backend_failed` et affiche message d'erreur.

**Effort** : 30 min.

---

#### C3 · Frontend casse en WebView Tauri — fetch `/api/*` 404

**Fichiers** :
- `apps/frontend/src/lib/utils/lan.ts:27` : `fetch('/api/local-ip')` → `tauri.localhost/api/...` n'existe pas
- `apps/frontend/src/lib/socket.ts` (avant fix) : `initTransport()` retournait `''` (same-origin) → Socket.io tape `tauri.localhost/socket.io` → fail

**Évidence** : aucun branchement `isTauri()` dans transport/lan/api.

**Fix appliqué** : voir C1 ci-dessus (wrapper `apiFetch`, `getBackendUrl()`, `initSocket()` async).

---

### 14.2 High

#### H1 · `sidecar.rs:18` race `start_backend` pas idempotent

```rust
if guard.is_some() { return Ok(true); }   // ← check
// ... long spawn ...
*guard = Some(child);                      // ← set
```

**TOCTOU** : deux invokes parallèles depuis front → spawn 2 sidecars → 2e `bind` échoue, état corrompu.

**Fix** : tenir le `Mutex` lock pendant tout le spawn :
```rust
let mut guard = state.0.lock().map_err(...)?;
if guard.is_some() { return Ok(true); }
let (rx, child) = Command::new_sidecar(...).spawn()?;
*guard = Some(child);
drop(guard);
```

**Effort** : 15 min.

---

#### H2 · `main.rs:39` auto-start sans wait readiness

Front peut fetch avant que sidecar ait fini de `bind()`. Pas de retry, juste `console.warn`.

**Fix** : sidecar émet `backend_ready` event quand le log contient `Server listening`. Front bloque les premiers calls jusque-là.

**Effort** : 1 h (Rust event + front listen).

---

#### H3 · `server.ts` CORS regex Vercel preview trop permissive

```ts
/^https:\/\/collab-talk(-[\w-]+)?\.vercel\.app$/
```

Matche n'importe quel `collab-talk-anything.vercel.app`. Si tu renommes le projet Vercel sans purger, un autre user Vercel peut créer `collab-talk-evil` et passer la check.

**Fix** : whitelist exacte :
```ts
const VERCEL_ALLOW = new Set([
  'https://collab-talk.vercel.app',
  // preview URLs spécifiques ajoutées manuellement si besoin
]);
if (VERCEL_ALLOW.has(origin)) return cb(null, true);
```

**Effort** : 5 min.

---

#### H4 · `tray.rs` `stop_backend` pas graceful — `child.kill()` = SIGKILL

Fastify ne ferme pas les connexions proprement. Pour MVP in-memory : pas de perte de données (rooms TTL 4 h, fichiers TTL 24 h, tout en RAM). Pour prod avec Redis : à corriger.

**Fix** : SIGTERM + timeout 3 s, fallback SIGKILL.

**Effort** : 30 min.

---

### 14.3 Medium

#### M1 · Orphan sidecar si force-quit — port locked au prochain launch

Tray "quit" appelle `stop_backend`, mais Task Manager kill / crash Collab.exe → sidecar orphelin (parent dead, child survit). Au prochain launch, port 47931 déjà bind → sidecar échoue.

**Fix** : `child.kill_on_drop(true)` côté tokio OU spawn avec Job Object Windows (groupe de processus parent-enfant).

**Effort** : 30 min Windows / 1 h cross-platform.

---

#### M2 · `process.cwd()` backend incertain en Tauri sidecar — uploads où ?

Tauri spawn sidecar avec `cwd = parent dir de Collab.exe`. Si user installe dans `C:\Program Files\` → permission denied write `data/uploads`.

**Fix** : utiliser `tauri::api::path::app_data_dir()` côté Rust :
```rust
let data_dir = app.path_resolver().app_data_dir().unwrap().join("uploads");
.env("DATA_DIR", data_dir)
```

**Effort** : 15 min.

---

#### M3 · `download/+page.svelte` detect OS faible

```ts
if (/win/i.test(navigator.platform)) return 'windows';
```

`navigator.platform` deprecated, retourne `'Win32'` même sur Windows ARM64. Pas de détection arch → on propose le binaire x64 à un ARM (peut marcher via émulation mais sub-optimal).

**Fix** :
```ts
const ua = await navigator.userAgentData?.getHighEntropyValues(['architecture', 'platform']);
const isArm = ua?.architecture === 'arm';
```

Fallback `navigator.platform` si `userAgentData` indispo (Firefox / Safari).

**Effort** : 30 min.

---

#### M4 · `tauri.conf.json` allowlist sidecar `args: true` — overkill

Front peut passer arbitrary args au sidecar Node si jamais on l'utilise. Aujourd'hui non, mais future bug si refactor.

**Fix** : `"args": false`.

**Effort** : 1 min.

---

### 14.4 Low

| ID | File | Issue | Action |
|---|---|---|---|
| L1 | `server.ts:38` | DATA_DIR write sans check permission | Try-catch + log + fallback `os.tmpdir()` |
| L2 | (toolchain) | Pas de signature code | Acquérir cert Sectigo OV (~50€/an) post-MVP |
| L3 | `tauri.conf.json` | `updater: { active: false }` | Activer en v1.1 avec Ed25519 (cf §10) |
| L4 | `tauri.conf.json` | CSP `'unsafe-inline'` styles | Vendre les styles inline en classes Tailwind après build |

---

### 14.5 Roadmap correctif

| Sprint | Bugs traités | Effort | Statut |
|---|---|---|---|
| **Sprint 0 (MVP demo)** | C1 Option A (port 47931) | 1 h | ✅ Livré |
| **Sprint 1 (v1.0 release)** | C1 Option C + C2 + C3 + H1 + H2 + M2 | ~6 h | ⏳ Backlog |
| **Sprint 2 (v1.1)** | H3 + H4 + M1 + M3 + M4 + L4 | ~3 h | ⏳ Backlog |
| **Sprint 3 (v2.0)** | L1 + L2 + L3 + auto-update + code sign | ~8 h + 50 €/an | ⏳ Backlog |

---

*Audit Dernière mise à jour : juin 2026.*
