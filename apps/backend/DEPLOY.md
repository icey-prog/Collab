# Déploiement backend Collab — Coolify

## 1. Créer la ressource

Coolify → **New Resource** → **Public Repository**

| Réglage             | Valeur                                  |
|---------------------|------------------------------------------|
| Repository          | `https://github.com/icey-prog/Collab`    |
| Branch              | `main`                                   |
| Build Pack          | **Docker Compose**                       |
| Base Directory      | `apps/backend`                           |
| Compose Location    | `apps/backend/docker-compose.yml`        |

> Alternative : Build Pack **Dockerfile** (`apps/backend/Dockerfile`, port 3001)
> — dans ce cas configurer manuellement le volume `/app/data` et les env vars.

## 2. Variables d'environnement (UI Coolify)

```
FRONT_ORIGIN=https://collab-one-lac.vercel.app
```

Les autres (`NODE_ENV`, `PORT`, `DATA_DIR`) ont des défauts corrects dans le compose.

## 3. Domaine + SSL

Onglet **Domains** → attribuer le sous-domaine API, ex. :

```
https://collab-api.mondomaine.com
```

Coolify provisionne le certificat Let's Encrypt automatiquement.
**HTTPS obligatoire** : le cookie admin est `Secure` (cross-site Vercel ↔ API).

## 4. Déployer

**Deploy** → suivre les logs de build (bundle esbuild ~30 s).

Vérification :

```bash
curl https://collab-api.mondomaine.com/
# → {"ok":true,"service":"collab-backend","rooms":0}

curl -X POST https://collab-api.mondomaine.com/room/create
# → {"roomId":"XXXXXX"}
```

## 5. Câblage frontend (une fois l'URL API connue)

| Où | Variable | Valeur |
|----|----------|--------|
| Vercel → Settings → Env Vars | `VITE_API_URL` | `https://collab-api.mondomaine.com` |
| GitHub → Settings → Secrets → Actions | `VITE_API_URL` | idem |
| `apps/desktop/src-tauri/tauri.conf.json` | CSP `connect-src` | remplacer `collab-talk.fly.dev` par le domaine API (https + wss) |

Puis : redeploy Vercel + relancer le workflow release desktop (nouveau tag `v*-portable`).

## 6. Auto-deploy (optionnel)

Coolify → Webhooks : activer le déploiement auto sur push `main`
(GitHub App Coolify ou webhook manuel).

## Notes d'exploitation

- **Rooms en mémoire** : un redéploiement/restart efface les rooms actives
  (TTL 4h de toute façon). Les uploads persistent via le volume `collab-uploads`.
- **Healthcheck** : `GET /` toutes les 30 s — restart auto par Docker si KO.
- **Logs** : rotation 3 × 10 Mo (json-file).
- **RAM** : limite 512 Mo — largement suffisant pour le MVP.
