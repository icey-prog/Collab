# Collab Desktop (Tauri)

App native Windows / macOS / Linux qui embarque le backend Collab en sidecar.
Pas besoin que l'utilisateur installe Node, ni qu'un serveur tourne ailleurs —
tout est local au binaire installé.

## Structure

```
apps/desktop/
├── package.json                    # scripts npm (tauri dev/build, build-sidecar)
├── scripts/
│   └── build-sidecar.mjs           # compile backend Node → binaire pkg
└── src-tauri/
    ├── tauri.conf.json             # config bundle + sidecar + tray
    ├── Cargo.toml                  # déps Rust (tauri, local-ip-address)
    ├── build.rs
    ├── icons/                      # générées via `npm run icons`
    ├── binaries/                   # sidecar Node compilé (gitignored)
    └── src/
        ├── main.rs                 # entry Tauri
        ├── sidecar.rs              # start/stop backend Node
        ├── network.rs              # get_local_ip + check_hotspot_active
        ├── settings.rs             # open_hotspot_settings + version
        └── tray.rs                 # icône tray + menu
```

## Pré-requis (1 seule fois)

```bash
# Rust + cargo (via rustup.rs)
# Windows: https://rustup.rs/ → exécuter rustup-init.exe
# macOS/Linux: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# pkg (bundle Node en exe)
npm i -g pkg

# Tauri CLI
cargo install tauri-cli  # OU: npm i -g @tauri-apps/cli (déjà en devDep ici)

# Plateforme Windows : WebView2 (Edge moderne — déjà installé sur Win 10/11 récent)
# Plateforme Linux : libwebkit2gtk-4.0-dev + autres (cf doc Tauri)
```

## Workflow

### 1. Générer les icônes

```bash
cd apps/desktop
npm run icons
# Lit landing_preview.png à la racine du repo, produit tous les formats nécessaires
```

### 2. Build le sidecar Node

```bash
npm run build:sidecar           # plateforme courante seulement
# OU
node scripts/build-sidecar.mjs --target=win    # forcer Windows
```

Cela produit `src-tauri/binaries/collab-backend-<target-triple>[.exe]`
que Tauri embarque dans le bundle.

### 3. Dev (recharge à chaud le front)

```bash
npm run dev
# → lance simultanément SvelteKit dev (port 5173) + fenêtre Tauri pointant dessus
```

### 4. Build release

```bash
npm run build:all
# = build:sidecar + build
# Produit :
#   - Windows : src-tauri/target/release/bundle/nsis/Collab_1.0.0_x64-setup.exe
#               src-tauri/target/release/bundle/msi/Collab_1.0.0_x64_en-US.msi
#   - macOS   : src-tauri/target/release/bundle/dmg/Collab_1.0.0_x64.dmg
#   - Linux   : src-tauri/target/release/bundle/deb/collab_1.0.0_amd64.deb
#               src-tauri/target/release/bundle/appimage/collab_1.0.0_amd64.AppImage
```

### 5. Distribution

Mettre le `.exe` Windows dans `apps/frontend/static/downloads/Collab-Setup-x64.exe`,
ouvrir `apps/frontend/src/routes/download/+page.svelte` et passer
`WIN_EXE_AVAILABLE = true`. Re-deploy Vercel.

## Architecture runtime

```
Collab.exe (Tauri)
├─ WebView (SvelteKit static — même UI que web)
├─ Rust core
│   ├─ Tray icon + menu
│   ├─ Lifecycle (close → hide, quit → kill sidecar)
│   └─ Commands invoke()-able depuis le front :
│       - start_backend / stop_backend / is_backend_running
│       - get_local_ip / check_hotspot_active
│       - open_hotspot_settings / get_app_version
└─ Sidecar : collab-backend-*.exe (Fastify + Socket.io sur :3001)
```

Le front détecte Tauri via `isTauri()` (cf `apps/frontend/src/lib/tauri.ts`)
et appelle les commands pour démarrer le backend local, afficher l'IP LAN
pour le QR code, etc.

## Code signing

Pas activé en MVP. Conséquence : Windows SmartScreen affichera "Éditeur inconnu"
au premier lancement, l'utilisateur clique "Exécuter quand même".

Pour signer en prod : obtenir un certif OV (~50 €/an Sectigo), config dans
`tauri.conf.json` → `bundle.windows.certificateThumbprint`.

## Limites connues

- Sidecar Node consomme ~30 Mo RAM idle + ~50 Mo par room active
- Pas de support iOS/Android sans rebuild (Tauri Mobile en beta)
- Pas d'auto-update activé pour MVP (config dans `tauri.conf.json`)

## Ressources

- Plan détaillé : [docs/TAURI-PLAN.md](../../docs/TAURI-PLAN.md)
- Stratégie déploiement : [docs/DEPLOY-QUICK.md](../../docs/DEPLOY-QUICK.md)
- Stub front : [apps/frontend/src/lib/tauri.ts](../frontend/src/lib/tauri.ts)
