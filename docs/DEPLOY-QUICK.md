# Déploiement rapide — Collab MVP

> **Objectif** : passer du local à des URLs publiques en **15-20 min** max, et permettre aux testeurs de télécharger l'app.

URLs finales :
- Frontend : `https://collab-talk.vercel.app`
- Backend  : `https://collab-talk.fly.dev`

---

## Pré-requis (à faire une seule fois)

```powershell
# Windows PowerShell
iwr https://fly.io/install.ps1 -useb | iex   # flyctl
npm i -g vercel                               # vercel CLI

# Comptes (gratuit, login GitHub)
fly auth login
vercel login
```

---

## Déploiement

### Option A — One-shot (Git Bash recommandé)

```bash
./scripts/deploy.sh
```

### Option B — Pas à pas

#### 1. Backend Fly.io

```bash
cd apps/backend
fly launch --name collab-talk --region cdg --no-deploy --copy-config --yes
fly deploy
curl https://collab-talk.fly.dev/   # → {"ok":true,...}
```

#### 2. Frontend Vercel

```bash
cd apps/frontend
npm run build              # sanity check
vercel --prod --yes
# Vercel demande "link to existing project? [N]" → N
# Project name : collab-talk
# Override settings : N
```

#### 3. Reboucler le CORS

Une fois le frontend déployé, récupère son URL Vercel (`https://collab-talk.vercel.app`) et set-la côté Fly :

```bash
fly secrets set FRONT_ORIGIN=https://collab-talk.vercel.app -a collab-talk
```

Cela déclenche un redeploy auto du backend. ~30 secondes.

---

## Distribution — Permettre aux testeurs de télécharger

### Mobile (Android / iOS)

L'app **EST déjà une PWA installable**. Il suffit que les testeurs ouvrent :

```
https://collab-talk.vercel.app/download
```

La page détecte leur OS et donne les instructions :
- **Android Chrome** : menu ⋮ → "Installer l'application"
- **iOS Safari** : Partager ↗ → "Sur l'écran d'accueil"

Aucun store, aucun build, aucune signature requis. Marche instantanément.

### Windows (.exe) — Approche rapide via PWABuilder

[PWABuilder](https://www.pwabuilder.com/) (Microsoft, gratuit, sans login obligatoire) génère un installeur Windows directement depuis ta PWA en prod, **sans Rust ni build local**.

1. Va sur https://www.pwabuilder.com/
2. Colle l'URL : `https://collab-talk.vercel.app`
3. Clique "Start" — il analyse ta manifest + service worker
4. Onglet "Package for stores" → **Windows** → **Generate Package**
5. Choisis "MSIX" (test mode, pas besoin de signature certificat)
6. Download le `.msix`
7. Upload-le dans `apps/frontend/static/downloads/Collab-Setup-x64.msix`
8. Dans `apps/frontend/src/routes/download/+page.svelte`, passe `WIN_EXE_AVAILABLE = true`
9. Redeploy : `cd apps/frontend && vercel --prod --yes`

**Coût** : 0 €. **Temps** : 5-10 min. **Pré-requis** : 0.

### Windows (.exe) — Option avancée via Tauri

L'app desktop Tauri est **scaffoldée et prête à builder** dans `apps/desktop/`. Elle embarque le backend en sidecar (pas besoin de connexion Internet sur LAN). Avantage vs PWABuilder : vraie app native (~45 Mo), backend local intégré, tray icon, future signature/auto-update.

```powershell
# Pré-requis (1 seule fois)
# 1. Rust : https://rustup.rs/ → rustup-init.exe
# 2. pkg  : npm i -g pkg
# 3. WebView2 (déjà sur Win 10/11)

cd apps/desktop
npm install                    # installe @tauri-apps/cli
npm run icons                  # génère icônes depuis landing_preview.png
npm run build:all              # = build sidecar Node + build Tauri
# Produit : src-tauri/target/release/bundle/nsis/Collab_1.0.0_x64-setup.exe
```

Doc complète : [apps/desktop/README.md](../apps/desktop/README.md) et [TAURI-PLAN.md](TAURI-PLAN.md).

**Recommandation** : commence par PWABuilder (5 min, 0 dépendance) pour la phase test, passe à Tauri quand tu veux la signature + auto-update.

---

## Vérification post-déploiement

```bash
# 1. Backend up ?
curl https://collab-talk.fly.dev/
# → {"ok":true,"service":"collab-backend","rooms":0}

# 2. Frontend up ?
curl -I https://collab-talk.vercel.app/
# → HTTP/2 200

# 3. Création de room via front fonctionne ?
# Ouvre https://collab-talk.vercel.app/ → clique "Créer une room"
# Tu dois être redirigé vers /room/XXXXXX

# 4. WebSocket Y.js fonctionne ?
# Sur la page room, tape du texte dans le bloc-notes.
# Ouvre la même URL dans un 2e onglet/appareil.
# Le texte doit apparaître en temps réel.
```

---

## Mises à jour

```bash
# Code changé → redeploy
./scripts/deploy.sh
```

Vercel auto-deploy aussi sur chaque `git push` si tu connectes le repo GitHub
dans le dashboard Vercel.

---

## En cas de problème

| Symptôme | Cause | Fix |
|---|---|---|
| `CORS error` dans console front | `FRONT_ORIGIN` pas set | `fly secrets set FRONT_ORIGIN=https://collab-talk.vercel.app -a collab-talk` |
| `Socket disconnect` continu | URL backend incorrect | Vérifie `VITE_API_URL` dans Vercel → Settings → Environment Variables. Doit être `https://collab-talk.fly.dev` |
| `fetch /api/* 404` en prod | Rewrite Vercel pas appliqué | Vérifie que `apps/frontend/vercel.json` existe et que Root Directory Vercel = `apps/frontend` |
| Cold start ~30s | Free tier Fly dort | Set `min_machines_running = 1` dans `fly.toml` (~3€/mois) |
| Mobile Safari pas d'install PWA | iOS Safari n'a pas d'install promo auto | Les testeurs cliquent **Partager → Sur l'écran d'accueil** manuellement. Indiqué sur la page `/download`. |

---

## Limites du MVP démo

- **Rooms en RAM** : perdues si le back redémarre (deploy = restart). Pour démos courtes c'est OK ; pour prod sérieuse → Redis.
- **Fichiers stockés sur volume Fly** : survivent au redeploy mais TTL 24h appliqué. Pour prod → R2/S3.
- **Pas de quota par IP** : si abus possible, ajouter `@fastify/rate-limit`.
- **Pas de signature .exe** (si PWABuilder MSIX en mode test) : Windows SmartScreen affichera un warning au premier lancement, l'user clique "Exécuter quand même". Acceptable pour testeurs internes.

---

## Coût mensuel estimé (MVP démo)

| Service | Plan | Coût |
|---|---|---|
| Fly.io | Free (1 shared CPU 256MB + 3GB volume) | 0 € |
| Vercel | Hobby (100GB bandwidth, 100h build) | 0 € |
| Domain (optionnel) | exxolab.bf | déjà payé |
| **Total** | | **0 €/mois** |

Si tu actives `min_machines_running = 1` pour éviter cold-start : ~3 €/mois sur Fly.
