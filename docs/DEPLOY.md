# DEPLOY — Collab MVP

> Guide pas-à-pas pour passer du local à `https://collab.exxolab.bf` (ou équivalent).
> Architecture cible : **Frontend Vercel + Backend Fly.io**.

---

## Modèle mental

```
                ┌─────────────────────────────────────┐
                │      BACKEND (Fly.io, permanent)    │
                │   https://collab-back.fly.dev       │
                └─────────────▲────────────▲──────────┘
                              │            │
                ┌─────────────┴──┐   ┌─────┴──────────┐
                │  Front PWA     │   │ Front Tauri    │
                │  installé sur  │   │ installé sur   │
                │  téléphone     │   │ laptop         │
                └────────────────┘   └────────────────┘
                              ▲
                              │ téléchargé depuis
                              │
                ┌─────────────┴──────────────┐
                │  Vercel (statique CDN)      │
                │  https://collab.vercel.app  │
                └─────────────────────────────┘
```

- Le **back** est **un seul serveur** sur Internet, toujours up.
- Le **front** est **téléchargé depuis Vercel** une fois, puis **vit sur le device** (PWA cache + Service Worker). Pas de serveur Vercel à charger pour ouvrir l'app installée.
- À l'install (Vercel build), on injecte `VITE_API_URL=https://collab-back.fly.dev` → le bundle JS sait à qui parler.

---

## Étape 1 — Backend Fly.io

### 1.1 Installer flyctl (une fois)

**Windows PowerShell** :
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

**macOS** :
```bash
brew install flyctl
```

### 1.2 Se connecter

```bash
fly auth login
```
Le browser s'ouvre. Login avec ton compte Fly.io.

### 1.3 Lancer l'app (interactif)

```bash
cd apps/backend
fly launch
```

Réponds :
- **App name** : `collab-back` (ou un autre, retiens-le)
- **Region** : `cdg` (Paris) — le plus proche du BF
- **PostgreSQL ?** Non
- **Redis ?** Non (MVP in-memory)
- **Deploy now ?** Non — on règle d'abord les secrets

Cette commande :
- Crée l'app sur Fly
- Met à jour `fly.toml` avec ton nom d'app réel
- Crée le volume `collab_data` (1 GB)

### 1.4 Secrets

⚠ Le `FRONT_ORIGIN` sera connu après le deploy Vercel (étape 2). Pour l'instant, on peut le laisser vide (CORS LAN ouvert) ou poser une valeur provisoire :

```bash
fly secrets set FRONT_ORIGIN=https://collab.vercel.app
```

### 1.5 Deploy

```bash
fly deploy
```

Attend ~2 min (build Docker + upload). À la fin, tu vois :
```
✓ Machine running: https://collab-back.fly.dev
```

### 1.6 Test

```bash
curl https://collab-back.fly.dev/
# → {"ok":true,"service":"collab-backend","rooms":0}
```

---

## Étape 2 — Frontend Vercel

### 2.1 Installer Vercel CLI (une fois)

```bash
npm install -g vercel
```

### 2.2 Se connecter

```bash
vercel login
```

### 2.3 Déployer

```bash
cd apps/frontend
vercel
```

Réponds :
- **Set up and deploy ?** Yes
- **Which scope ?** ton compte personnel
- **Link to existing project ?** No
- **What's your project's name ?** `collab` (ou `collab-front`)
- **In which directory is your code located ?** `./`
- **Want to override settings ?** No

Premier deploy → URL preview type `https://collab-xxx.vercel.app`.

### 2.4 Configurer l'env var côté Vercel

Va sur https://vercel.com/dashboard → ton projet `collab` → Settings → Environment Variables. Ajoute :

| Key | Value | Environment |
|---|---|---|
| `VITE_API_URL` | `https://collab-back.fly.dev` | Production, Preview, Development |

### 2.5 Redeploy prod

```bash
vercel --prod
```

Cette fois l'URL est `https://collab.vercel.app` (ou ton nom). Le bundle contient maintenant `VITE_API_URL` → il parle au back Fly.

### 2.6 Mise à jour CORS back

Une fois l'URL Vercel connue, retourne sur le back :

```bash
cd apps/backend
fly secrets set FRONT_ORIGIN=https://collab.vercel.app
fly deploy
```

---

## Étape 3 — Test depuis téléphone

1. Sur ton téléphone (réseau quelconque, 4G ou Wi-Fi distant), ouvre `https://collab.vercel.app`
2. Chrome / Safari va proposer "Ajouter à l'écran d'accueil" → accepte
3. L'icône Collab apparaît comme une app native
4. Tu cliques → s'ouvre en mode standalone (sans barre browser)
5. Crée une room → tu vois le code
6. Sur un laptop ailleurs, ouvre la même URL, entre le code → tu rejoins
7. Tape dans le bloc-notes → l'autre voit en temps réel

---

## Custom domain (optionnel)

Pour avoir `https://collab.exxolab.bf` au lieu des URLs Vercel/Fly :

**Vercel** :
- Settings → Domains → Add `collab.exxolab.bf`
- Vercel te donne 1 enregistrement `CNAME` ou `A` à mettre chez ton registrar
- HTTPS auto via Let's Encrypt

**Fly** (optionnel, pour `api.collab.exxolab.bf`) :
```bash
fly certs create api.collab.exxolab.bf
```
Puis `CNAME` chez ton registrar.

---

## Mise à jour future

Chaque `git push origin main` peut auto-déployer :

**Vercel** :
- Dashboard → Settings → Git → connecte le repo GitHub
- Désormais chaque push sur `main` déclenche un build + deploy automatique

**Fly** :
- Pas d'auto-deploy natif, mais 1 commande :
  ```bash
  cd apps/backend && fly deploy
  ```
- Pour automatiser : GitHub Action `superfly/flyctl-actions/setup-flyctl@master`

---

## Limites de cette config

| Limite | Mitigation |
|---|---|
| Backend Fly free tier : **dort après 5 min sans trafic** | `min_machines_running = 1` dans `fly.toml` (coût ~3$/mois) |
| Fichiers uploadés : **perdus si le volume Fly est purgé** | OK pour MVP (TTL 24h). Passer à R2/S3 pour prod sérieuse |
| Rooms en RAM : **perdues si le back redémarre** | OK pour MVP éphémère. Passer à Redis si on veut survivre redéploiements |
| Une seule région : **latence haute Afrique** | Ajouter Johannesburg : `fly regions add jnb` |

---

## En cas de problème

| Erreur | Cause probable | Fix |
|---|---|---|
| `Connection refused` côté front | `FRONT_ORIGIN` pas posé → CORS bloque | `fly secrets set FRONT_ORIGIN=...` puis `fly deploy` |
| Socket.io ne se connecte pas | Mauvaise URL `VITE_API_URL` | Vérifie env Vercel + redeploy |
| `502 Bad Gateway` Fly | Healthcheck KO | `fly logs` pour voir si le serveur écoute bien sur PORT=3001 |
| Vercel build fail | env var manquante | Settings → Env Variables → Ajoute `VITE_API_URL` |
| Mobile Safari : pas d'install PWA | Pas d'install promo iOS automatique | Tu cliques **Partager → Ajouter à l'écran d'accueil** manuellement |
