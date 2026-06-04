# ARCHITECTURE COMPLÈTE — Collab MVP

> Document de référence architecture système · EXXOLAB Digital Solutions
> Auteur : Jamil Maiga · Co-rédigé avec Claude · Version 1.0 — juin 2026

---

## 0. Contexte et contraintes

| Dimension | Valeur |
|---|---|
| Utilisateurs cibles | 5–50 par room. ~150k étudiants BF + PME |
| Réalité réseau | 3G/4G instable, connexion intermittente, sessions LAN uniquement fréquentes |
| Floor matériel | Android d'entrée de gamme, laptops bas de gamme, mobile-first |
| Souveraineté | Tout doit pouvoir tourner sur un VPS local (zéro dépendance SaaS occidental pour le cœur) |
| Budget bundle | < 60 KB initial JS (contrainte mobile 3G) |
| Plafond coût | < 10 €/mois infra année 1 |
| Modes de panne à tolérer | Coupure Internet, reboot PC host, peer qui quitte en cours, Redis OOM |

Ces contraintes structurent toutes les décisions ci-dessous.

---

## 1. Architecture système

### 1.1 Trois tiers opérationnels (dégradation gracieuse)

```
┌─────────────────────────────────────────────────────────────────────┐
│                          TIER 1 — CLOUD                              │
│                                                                       │
│   Frontend Vercel (gratuit) · Backend Fastify sur serveur Ubuntu     │
│   maison · Redis + MinIO sur ce même serveur                         │
│   Cas d'usage : équipes distribuées, rooms publiques                 │
└──────────────────┬───────────────────────────────────────────────────┘
                   │ dégrade vers ▼ si WAN inaccessible
┌─────────────────────────────────────────────────────────────────────┐
│                       TIER 2 — LAN HOST                              │
│                                                                       │
│   Un appareil lance le container backend · Les pairs rejoignent      │
│   via l'IP du host (Wi-Fi local)                                     │
│   Découverte : URL explicite (v1) → mDNS via Tauri/Capacitor (v2)    │
│   Cas d'usage : salle de TD, bureau, chantier BTP sans internet     │
└──────────────────┬───────────────────────────────────────────────────┘
                   │ dégrade vers ▼ si host inaccessible
┌─────────────────────────────────────────────────────────────────────┐
│                       TIER 3 — OFFLINE SOLO                          │
│                                                                       │
│   y-indexeddb (persistance locale) · service worker (app shell)      │
│   File d'attente des mutations · sync différé au retour réseau       │
│   Cas d'usage : travail préparatoire seul                            │
└─────────────────────────────────────────────────────────────────────┘
```

Le **même binaire client** tourne dans les trois tiers. Seule la couche **transport** change. La couche **données** (Y.Doc) est identique car Y.js est nativement P2P-agnostique.

### 1.2 Topologie de déploiement v1

```
   ┌──────────────────────────────┐
   │  Vercel (frontend gratuit)   │  ← collab.exxolab.bf (CNAME)
   │  collab.vercel.app           │  ← SvelteKit adapter-vercel ou static
   │  CDN mondial intégré         │  ← TLS auto · cache edge
   └──────────────┬───────────────┘
                  │ wss:// + https://
                  │
   ┌──────────────▼─────────────────────────────────┐
   │  Cloudflare Tunnel (gratuit)                   │  ← masque IP maison
   │  api.collab.exxolab.bf → 127.0.0.1:3001        │  ← TLS auto · DDoS
   └──────────────┬─────────────────────────────────┘
                  │
   ┌──────────────▼─────────────────────────────────┐
   │  Serveur maison Ubuntu (chez toi)              │
   │                                                  │
   │  ┌─────────────────────┐                        │
   │  │ Docker network      │                        │
   │  │                      │                        │
   │  │  ┌──────────────┐  │                        │
   │  │  │ backend      │  │  ← Fastify + Socket.IO │
   │  │  │ Fastify :3001│  │  ← PM2 cluster         │
   │  │  └──────┬───────┘  │                        │
   │  │  ┌──────▼───────┐  │                        │
   │  │  │ redis :6379  │  │  ← 256MB cap, AOF      │
   │  │  └──────────────┘  │                        │
   │  │  ┌──────────────┐  │                        │
   │  │  │ minio :9000  │  │  ← fichiers (10MB max) │
   │  │  └──────────────┘  │                        │
   │  │  ┌──────────────┐  │                        │
   │  │  │ audio-slice  │  │  ← optionnel, Phase 4  │
   │  │  └──────────────┘  │                        │
   │  └──────────────────────┘                       │
   └─────────────────────────────────────────────────┘
```

**Cette topologie permet** :
- Frontend ultra-rapide partout dans le monde (CDN Vercel)
- Backend chez toi → souveraineté totale + zéro coût hébergement back
- Cloudflare Tunnel cache ton IP maison + ajoute DDoS / TLS sans config
- Tu coupes ton serveur → l'app passe en mode LAN (Tier 2) ou Offline (Tier 3) automatiquement

### 1.3 Frontend sur Vercel — détails techniques

**Oui c'est possible, et c'est la meilleure option pour ta config.**

| Critère | Vercel | Auto-hébergé Nginx |
|---|---|---|
| Coût | Gratuit (Hobby plan) | 0 € (sur ton serveur) |
| Performance mondiale | CDN edge dans 100+ villes | Limité à ton DC |
| Latence Burkina Faso | ~50ms (Frankfurt edge) | Dépend de ton hébergeur |
| TLS / certificat | Auto, géré | Certbot manuel |
| Déploiement | `git push` → live en 30s | Script post-receive |
| Limite plan gratuit | 100 GB bande/mois | Aucune |

**Config SvelteKit pour Vercel** :
- Changer adapter : `adapter-vercel` au lieu de `adapter-static`
- Variables d'environnement : `VITE_API_URL=https://api.collab.exxolab.bf` (pointe vers ton Cloudflare Tunnel)
- Le frontend appelle backend en cross-origin → backend doit autoriser CORS pour le domaine Vercel

**Trade-off** : ton frontend est sur infra US (Vercel = Amazon). Pour purisme souverain total v2, possible de migrer sur Cloudflare Pages (gratuit aussi, infra plus distribuée) ou repasser sur Nginx du serveur maison.

### 1.4 Backend sur serveur maison Ubuntu

**Recommandé : Cloudflare Tunnel** plutôt que ouvrir des ports.

| Méthode | Avantages | Inconvénients |
|---|---|---|
| **Cloudflare Tunnel** ✅ | Gratuit, masque IP maison, TLS auto, DDoS inclus, pas de port forwarding | Dépendance Cloudflare |
| Port forwarding direct | 100% souverain | IP publique exposée, faut TLS soi-même, DDoS exposé, FAI peut bloquer port 443 |
| WireGuard VPN | Privé total | Setup complexe, pas accessible publiquement sans config |
| Tailscale Funnel | Simple | 5 GB/mois gratuit puis payant |

Avec Cloudflare Tunnel :

```bash
# Sur le serveur maison
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

cloudflared tunnel login
cloudflared tunnel create collab-api
cloudflared tunnel route dns collab-api api.collab.exxolab.bf

# Config /etc/cloudflared/config.yml
tunnel: collab-api
credentials-file: /root/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: api.collab.exxolab.bf
    service: http://localhost:3001
  - service: http_status:404

cloudflared service install
systemctl start cloudflared
```

Maintenant `api.collab.exxolab.bf` pointe vers ton serveur **sans exposer ton IP**, **sans ouvrir de port** sur ta box, **avec TLS automatique**.

### 1.5 Responsabilités par service

| Service | Responsabilité | Tech | Container |
|---|---|---|---|
| **frontend** | Livraison SPA, shell PWA, service worker | SvelteKit build → Vercel | (hors Docker) |
| **backend** | REST + WebSocket relay, auth, rate limits | Fastify + Socket.IO + ioredis + yjs | `backend` |
| **redis** | État session, compteurs rate-limit, pub/sub entre workers | Redis 7 | `redis` |
| **storage** | Upload fichiers (10MB max, magic-byte validé) | MinIO (mode local) ou Cloudflare R2 (cloud) | `storage` (local) |
| **audio-slice** | Microservice résumé à fermeture room (Phase 4) | FastAPI + Whisper + EasyOCR + Ollama | `audio-slice` |

Chaque service = un container indépendant. **Aucun service ne dépend du cloud** sauf `audio-slice` pour modèles avancés (dégradation : skip résumé si indisponible).

---

## 2. Architecture des données

### 2.1 Schéma Redis (état serveur)

| Pattern de clé | Type | TTL | Rôle |
|---|---|---|---|
| `room:{id}:config` | STRING (JSON) | 14400s | `{created_at, admin_hash}` |
| `room:{id}:admin` | STRING | 14400s | HMAC(admin_token) — vérification cookie httpOnly |
| `room:{id}:count` | STRING (int) | 14400s | Compteur participants actifs (INCR/DECR atomique) |
| `room:{id}:qa` | ZSET | 14400s | `{questionId → votes}` trié par score |
| `room:{id}:q:{qId}` | HASH | 14400s | `{text, createdAt, authorFingerprint}` |
| `room:{id}:q:{qId}:voters` | SET | 14400s | `{voterFingerprint}` — vote idempotent |
| `room:{id}:files` | LIST | 14400s | JSON `{key, name, size, type, url, uploaded_by}` |
| `room:{id}:audit` | LIST | 14400s | `{ts, action, actor}` plafonné à 200 (LTRIM) |
| `rl:{ip}:create` | STRING | 3600s | Sliding window rate-limit |
| `rl:{ip}:join` | STRING | 60s | Anti brute-force codes room |

**Snapshot Y.Doc (optionnel, recovery host crash)** :

| Clé | Type | TTL | Rôle |
|---|---|---|---|
| `room:{id}:yjs:snapshot` | STRING (binaire) | 14400s | `Y.encodeStateAsUpdate(doc)` toutes les 30s si dirty |

### 2.2 Schéma IndexedDB (persistance client)

| Store | Clé | Valeur | Rôle |
|---|---|---|---|
| `yjs-rooms` | roomId | État binaire Y.Doc | Persistance CRDT locale (y-indexeddb) |
| `outbox` | autoincrement | `{type, payload, createdAt, attempts}` | File mutations offline |
| `room-meta` | roomId | `{lastSeen, role, transport}` | Contexte de reprise |
| `app-config` | 'singleton' | `{theme, palette, knownHosts: string[]}` | Réglages + historique hosts LAN |

Le processeur outbox draine quand le transport redevient disponible (event network status change).

### 2.3 Layout fichiers stockés

```
{storage-root}/rooms/{roomId}/{uuid}-{slug-du-nom}.{ext}
```

- Préfixe UUID empêche l'énumération
- Slug pour URL lisible
- Dossier par room = nettoyage en une commande à l'expiration
- Cycle de vie : job externe (consumer Redis keyspace notification) supprime le dossier quand `room:{id}:config` expire

---

## 3. Surface d'API

### 3.1 REST (HTTP/HTTPS, idempotent)

| Méthode | Path | Auth | Rate limit | Rôle |
|---|---|---|---|---|
| `POST` | `/room/create` | aucune | 5/h/IP | Crée room. Set cookie `admin_{roomId}` (httpOnly, Secure, SameSite=Strict, max-age 4h). Retourne `{roomId}`. |
| `GET` | `/room/:id` | aucune | 60/m/IP | Preview : `{exists, participants, expiresInSec, full}`. 404 si expiré. |
| `DELETE` | `/room/:id` | cookie admin | — | Ferme room. Cascade suppression Redis + fichiers + emit `room:closed`. |
| `POST` | `/room/:id/upload` | participant joined | 30/m/IP | Multipart upload. Validation : taille ≤10MB, magic-byte vs whitelist MIME, scan virus en v2. Emit `files:updated`. |
| `GET` | `/room/:id/files/:key` | participant joined | 60/m/IP | Stream fichier. URL signée (HMAC, TTL 1h) pour R2 direct en mode cloud. |
| `GET` | `/admin/stats` | header `X-Admin-Secret` | — | Monitoring : count rooms, total participants, Redis memory, Y.Doc count. |
| `GET` | `/health` | aucune | — | Liveness : `{ok: true, uptime, redis: 'connected'}` pour Nginx + uptime monitors. |
| `POST` | `/room/:id/summarize` | cookie admin | 1/room | Trigger Audio-Slice. Async — retourne `{jobId}`, résultat via socket event. |

### 3.2 Events WebSocket (Socket.IO)

**Client → Serveur**

| Event | Payload | Garde |
|---|---|---|
| `join:room` | `{roomId}` | Room existe, count < 50, INCR atomic, socket.join |
| `qa:add` | `{text}` | Joined, `text.length` in [3,500], rate 10/m/socket |
| `qa:vote` | `{questionId}` | Joined, SADD voter (idempotent), ZINCRBY |
| `qa:delete` | `{questionId}` | Cookie admin vérifié |
| `file:delete` | `{fileKey}` | Cookie admin vérifié |
| `room:close` | — | Cookie admin vérifié → cascade |
| `yjs:state` | `{roomId, sv: Uint8Array}` | Joined, sv ≤ 1KB |
| `yjs:sync` | `{roomId, update: Uint8Array}` | Joined, **update ≤ 64KB** (cap DoS), backend applique sur Y.Doc in-mem + `socket.to(room).emit` |

**Serveur → Client**

| Event | Payload | Trigger |
|---|---|---|
| `room:joined` | `{participants, isAdmin}` | Join réussi |
| `room:error` | `{code: 'NOT_FOUND' \| 'FULL'}` | Join échoué |
| `room:closed` | — | DELETE appelé ou TTL expiré |
| `participants:count` | `{count}` | INCR/DECR |
| `qa:updated` | `Question[]` | Après add/vote/delete |
| `files:updated` | `RoomFile[]` | Après upload/delete |
| `yjs:state` | `{roomId, doc: Uint8Array}` | Réponse à `yjs:state` client |
| `yjs:update` | `{roomId, update: Uint8Array}` | Broadcast update peer |
| `summary:ready` | `{url, summary}` | Complétion Audio-Slice |

### 3.3 Audio-Slice API (microservice séparé)

| Méthode | Path | Rôle |
|---|---|---|
| `POST` | `/slice/transcribe` | `{audio: base64, lang}` → `{text}` (Whisper) |
| `POST` | `/slice/ocr` | `{image: base64}` → `{text}` (EasyOCR) |
| `POST` | `/slice/summarize` | `{notes, qa, transcripts, files_meta}` → `{summary_md, key_points[], action_items[]}` (Qwen3 via Ollama) |
| `GET` | `/health` | Status warmup Whisper/Ollama |

REST public. Auth par clé API (vendu standalone selon pitch STIC).

---

## 4. Stratégie cache & performance

### 4.1 Couches de cache (top-down)

| Couche | Technologie | Hit ratio cible | TTL | Invalidation |
|---|---|---|---|---|
| **L1 — Browser** | Service Worker (app shell) | 95% visite répétée | Stale-while-revalidate | Version bump au déploiement |
| **L1b — Browser** | y-indexeddb (état Y.Doc) | 100% (toujours présent) | Jusqu'à expiration room | Sur event `room:closed` |
| **L2 — Vercel Edge** | Cache CDN sur assets immutables | 95% | 1 an | Hash dans le nom de fichier |
| **L3 — App backend** | `fastify-caching` sur `GET /room/:id` | 80% en 5s | 5s | Aucune (lecture live counter) |
| **L4 — Redis** | Tout l'état chaud | 100% | Par clé | TTL ou DEL explicite |

### 4.2 Optimisations réseau

- **Sync delta Y.js** — seuls les diffs transitent. Update moyen ≈ 50 octets par frappe.
- **Socket.IO** — WebSocket primaire, fallback long-polling auto. Permessage-deflate activé.
- **Brotli** sur assets statiques (Vercel par défaut).
- **HTTP/2** mandatory.
- **Preconnect** fonts.gstatic.com depuis `<head>`.
- **Lazy-load images** `loading="lazy"` natif.

### 4.3 Enforcement du budget bundle

CI gate : `npm run build` doit respecter :

```
build/_app/immutable/entry/*.js     <  20 KB gzip
build/_app/immutable/chunks/*.js    <  35 KB gzip combiné
total transféré sur /              <  60 KB gzip
```

Si dépassé → build échoue. Tient la promesse STIC.

---

## 5. Modèle de sécurité

### 5.1 Threat model (STRIDE appliqué)

| Menace | Vecteur | Mitigation | Couche |
|---|---|---|---|
| **Spoofing admin** | Vol token via XSS | Cookie `httpOnly` + `Secure` + `SameSite=Strict` ; HMAC en Redis (jamais le token brut) | Browser + Fastify |
| **Tampering Y.js** | Injection update mal formé | Y.js update = CRDT binaire, octets invalides ignorés par `applyUpdate`. Cap 64KB prévient memory bombing. | Backend |
| **Repudiation** | User anonyme nie une action | Log audit par room (`room:{id}:audit`) plafonné à 200, contient `{ts, action, fingerprint}`. Fingerprint = SHA256(socket.id + IP). | Backend |
| **Info disclosure** | Énumération rooms actives | Codes room dans 32^6 = 1.07 × 10^9 espace, sans 0/O/1/I. Rate-limit join 60/m/IP. SETNX atomique = pas de collision. | Backend + Redis |
| **Info disclosure** | Messages d'erreur leak stack | `+error.svelte` retourne message générique pour 5xx. Fastify logs côté serveur uniquement. | Frontend + Backend |
| **Info disclosure** | Fichiers accessibles cross-room | UUID dans path + dossier par room + URL signée HMAC en mode cloud. | Storage |
| **DoS — spam rooms** | Création massive | Rate limit 5/h/IP sliding window (Redis). | Fastify |
| **DoS — flood Y.js** | Payload `yjs:sync` énorme | **Cap 64KB par update** côté serveur. Reject si plus gros. | Socket.IO |
| **DoS — Redis OOM** | Y.Doc qui grossit | `maxmemory 256mb` + `allkeys-lru`. Snapshots Y.Doc compressés toutes les 30s. | Redis |
| **DoS — flood connexions** | Milliers de WS | Cloudflare Tunnel limite connexions + per-room cap 50 (INCR atomique). | Edge + Backend |
| **Elevation** | Participant prétend admin | Statut admin vérifié serveur depuis cookie à chaque action privilégiée. `isAdmin` client = affichage only. | Backend |
| **CSRF** | Write cross-origin | `SameSite=Strict` + SvelteKit CSRF protection + vérif Origin sur `/room/create`. | Browser + Fastify |
| **Upload malware** | Malware en image | `file-type` (magic byte) + whitelist MIME + cap 10MB + ClamAV en v2. | Fastify |
| **Replay token** | Réutilisation cookie expiré | Max-age cookie = TTL room. Serveur stocke hash avec même TTL ; mismatch → 403. | Fastify + Redis |

### 5.2 Defense in depth

- **TLS 1.3** mandatory (Cloudflare Tunnel + Vercel s'en chargent), HSTS preload, cible A+ SSL Labs.
- **CSP** strict : `default-src 'self'; img-src 'self' data: blob: https://*.r2.cloudflarestorage.com; connect-src 'self' wss://api.collab.exxolab.bf; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com`.
- **Aucune PII stockée** — par design. Politique de confidentialité littérale : "rien sur vous au-delà de la durée 4h de la room."
- **Gestion secrets** — `.env` uniquement sur serveur, jamais en repo. `JWT_SECRET ≥ 32 octets random`. Rotation à chaque déploiement majeur.
- **Scan dépendances** — `npm audit --production` en CI, Renovate pour auto-PRs.
- **Durcissement OS** — UFW (22/80/443 uniquement), fail2ban sshd, root SSH désactivé, auth par clé.

### 5.3 Posture privacy (BF + GDPR-friendly)

- Pas de compte → pas de PII à perdre
- Cookie functional-only (session admin) → pas de bandeau cookies requis sous ePrivacy
- Fichiers auto-supprimés après 24h ou expiration room (le plus court)
- Logs serveur conservent IP 30 jours max pour détection abus, puis caviardé

---

## 6. Monitoring & observabilité

### 6.1 Stack

| Tier | Outil | Rôle |
|---|---|---|
| **Logs** | Pino JSON → stdout → Docker logs → Loki (optionnel v2) | Structuré, queryable |
| **Métriques** | Prometheus scrape sur `/metrics` (fastify-metrics) | Méthode RED : Rate / Errors / Duration |
| **Tracing** | Skip v1 (prématuré pour solo dev) | — |
| **Uptime** | UptimeRobot free (checks 5min sur `/health`) | Alerting externe |
| **Erreurs** | Sentry free (5k events/mois) | Frontend + backend |
| **Real-user** | Plausible self-hosted (respect privacy) | Page views, pays, device |

### 6.2 Métriques clés

| Métrique | Type | Seuil alerte |
|---|---|---|
| `http_requests_total{status="5xx"}` | counter | > 1% sur 5m |
| `socketio_connections` | gauge | chute > 50% subite |
| `redis_memory_used_bytes` | gauge | > 200MB (cap = 256MB) |
| `yjs_docs_count` | gauge | > 200 simultanés |
| `room_create_rate` | counter | > 100/h (signal attack spam) |
| `upload_size_bytes` | histogram | p99 > 8MB |
| `audio_slice_job_duration_seconds` | histogram | p95 > 60s |

### 6.3 Conventions logging

```json
{
  "level": "info",
  "time": "2026-06-03T14:23:45.123Z",
  "msg": "room created",
  "room_id": "X7K92P",
  "ip_hash": "a3f...",
  "user_agent_family": "Chrome",
  "request_id": "01H..."
}
```

Pas de PII, pas d'IP brute, pas de tokens admin, pas de contenu fichiers.

---

## 7. Infrastructure — décisions

### 7.1 Décisions retenues pour ta config

| Composant | Décision | Pourquoi |
|---|---|---|
| **Frontend hosting** | Vercel Hobby (gratuit) | CDN mondial, déploiement git push, TLS auto, 100 GB bande/mois suffit pour année 1 |
| **Backend hosting** | Ton serveur maison Ubuntu | Souveraineté + zéro coût |
| **Exposition publique backend** | Cloudflare Tunnel | Masque IP maison, TLS auto, DDoS inclus, pas de port forwarding |
| **DNS** | Cloudflare DNS | Free, intégré au tunnel, cache edge |
| **Stockage fichiers v1** | MinIO local sur serveur maison | Sovereign, gratuit, contrôle total |
| **Stockage fichiers v2 (si besoin scale)** | Cloudflare R2 | 0 egress fee, lifecycle 24h auto |

### 7.2 Backup & disaster recovery

| Asset | Méthode | RPO | RTO |
|---|---|---|---|
| Redis AOF | Snapshot volume quotidien 03h UTC | 24h | 5min |
| Fichiers uploadés | Lifecycle 24h auto (éphémère = OK) | None | N/A |
| Code backend | Git GitHub + miroir bare sur serveur | 0 | 5min |
| Config Nginx + env | Cron tar daily vers backup encrypté | 24h | 10min |

L'éphémérité est ton amie : perdre 4h de room = équivalent à une expiration normale. Vrai risque = opérationnel (Redis OOM, Docker crash). Restart-recovery + AOF = downtime < 1min.

---

## 8. Roadmap d'implémentation

### Phase 0 — Maintenant (semaine 0) ✅ FAIT
- [x] Design system (4 palettes)
- [x] Pages frontend + composants
- [x] Squelette backend (plugin yjs uniquement)
- [x] Repo git + 3 branches
- [x] Docs (SUIVI, ARCHITECTURE, REVISION, DEPLOY)

### Phase 1 — MVP COMPLET = Cloud + LAN + Offline (semaines 1–3) **← chemin critique**

Cette phase fait le **MVP utilisable** : 3 modes opérationnels, déployable, prêt à utiliser **par toi et tes collègues sans Internet**.

**Backend complet** :
- [ ] `server.ts`, `plugins/{redis,socket,yjs,rateLimit,cookie,storage}.ts`
- [ ] `routes/{room,upload,qa,stats}.ts`
- [ ] Fix bugs audit : #1 (redis duplicate), #2 (cap 64KB Y.js), #3 (vote idempotence), #4 (error generic), #5 (room:closed centralise), #6 (retirer y-socket.io)

**Containerisation** :
- [ ] Dockerfile backend
- [ ] `docker-compose.yml` (mode cloud — pour ton serveur maison)
- [ ] `docker-compose.lan.yml` (mode LAN host — pour les sessions sans internet)

**Frontend adaptable** :
- [ ] `VITE_API_URL` env support (pointer vers cloud ou LAN selon contexte)
- [ ] Détection automatique du mode (cloud OK / fallback LAN / fallback offline)
- [ ] Indicateur réseau dans la UI (3 états visibles)

**Mode LAN — outillage non-dev** :
- [ ] Script `collab-lan-start.bat` (Windows) et `collab-lan-start.sh` (Mac/Linux) — installeur Docker auto si absent + lance compose + affiche URL à partager
- [ ] Tutoriel image-par-image dans `docs/GUIDE-UTILISATEUR-LAN.md`
- [ ] Page `/lan-help` dans l'app expliquant comment trouver son IP et la partager

**Offline solo (Tier 3)** :
- [ ] `y-indexeddb` provider intégré (auto-save Y.Doc local)
- [ ] Service worker Workbox : précache app shell + runtime caching
- [ ] Outbox store + drain loop

**Test d'acceptation Phase 1** :
> Sur le Wi-Fi de la maison sans internet, Jamil lance Collab en double-cliquant un script.
> Deux collègues sur leurs portables ouvrent une URL dans le browser.
> Les trois éditent simultanément le bloc-notes, postent des questions, uploadent des fichiers.
> Tout fonctionne. Aucun account, aucune config, aucun Internet.

### Phase 2 — Production cloud (semaine 4)
- [ ] Configurer Vercel (deploy front)
- [ ] Configurer Cloudflare Tunnel sur serveur maison
- [ ] Domaines : `collab.exxolab.bf` (Vercel) + `api.collab.exxolab.bf` (tunnel)
- [ ] UptimeRobot + Sentry branchés
- [ ] CORS backend autorise origin Vercel
- [ ] Test bout-en-bout : créer room depuis n'importe où dans le monde

### Phase 3 — Audio-Slice intégration (semaines 5–6)
- [ ] `apps/audio-slice/` scaffold (FastAPI + Whisper + EasyOCR + Ollama)
- [ ] Queue async (Celery ou Redis simple)
- [ ] `POST /room/:id/summarize` → returns jobId → event `summary:ready`
- [ ] Frontend "Générer résumé" sur fermeture room

### Phase 4 — Polish & STIC démo (semaines 7–8)
- [ ] Admin dashboard `/admin/stats`
- [ ] Pages `/legal` + `/privacy`
- [ ] Onboarding tour modal
- [ ] Tests Playwright (5 chemins critiques)
- [ ] Script démo + screencast jury STIC

### Phase 5 — Post-STIC scale (mois 3+)
- [ ] Wrap Tauri/Capacitor (mDNS auto-discovery LAN, apps native)
- [ ] Fallback P2P WebRTC pur (mode 100% serverless)
- [ ] i18n FR/EN
- [ ] API webhook intégrations tierces
- [ ] Audio-Slice vendu en standalone SaaS

---

## 9. Mode LAN — Expérience non-dev

**Objectif** : un prof, un chef de projet BTP, un community manager doit pouvoir lancer une session Collab LAN en **moins de 30 secondes** sans rien comprendre à Docker.

### 9.1 Distribution sous forme d'installeur

Trois formats prévus :

| Plateforme | Format | Comment ça marche |
|---|---|---|
| **Windows** | `Collab-LAN-Setup.exe` | Double-clic → installe Docker Desktop si absent → installe Collab → ouvre menu démarrer |
| **macOS** | `Collab-LAN.dmg` | Drag-and-drop dans Applications → premier lancement installe Docker si absent |
| **Linux** | `collab-lan.deb` ou `.AppImage` | Apt install ou exécution directe |

**Sous le capot** : ces packages sont des wrappers Tauri (Rust) qui :
1. Embarquent les fichiers `docker-compose.lan.yml` + images Docker pré-tirées
2. Détectent si Docker est installé, sinon télécharge l'installeur officiel
3. Lancent `docker compose up -d` en arrière-plan
4. Affichent une fenêtre avec l'URL à partager + QR code

### 9.2 Interface "Collab Host" (app desktop)

Au lancement, fenêtre simple :

```
┌──────────────────────────────────────────────┐
│  Collab Host · Session LAN active            │
│                                                │
│  ┌────────────────────────────────────────┐  │
│  │                                          │  │
│  │      ▢▢▢▢▢▢▢▢▢▢▢▢▢▢                   │  │
│  │      ▢ QR CODE ▢                        │  │
│  │      ▢▢▢▢▢▢▢▢▢▢▢▢▢▢                   │  │
│  │                                          │  │
│  │  Tes collègues scannent ce QR code      │  │
│  │  ou tapent cette adresse :               │  │
│  │                                          │  │
│  │  http://192.168.1.42:5173               │  │
│  │  [📋 Copier]                             │  │
│  │                                          │  │
│  │  Participants connectés : 3              │  │
│  │  Rooms actives : 1                       │  │
│  │                                          │  │
│  │  [Arrêter Collab]                        │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

Trois actions max. Zéro jargon technique.

### 9.3 Côté participant (PC ou téléphone)

1. Ouvre le QR scanner du téléphone OU tape l'URL dans le browser
2. Tombe sur la landing Collab familière
3. Crée une room ou rejoint avec un code
4. Bosse normalement

**Aucune installation côté participant.** Seul le host installe l'app.

### 9.4 Documentation utilisateur (GUIDE-UTILISATEUR-LAN.md)

Doc en 5 étapes avec captures d'écran :
1. Télécharger Collab Host (lien selon OS)
2. Double-cliquer pour installer
3. Lancer Collab Host
4. Montrer le QR code aux collègues
5. C'est tout

---

## 10. Décisions critiques (log)

| Décision | Rationnel | Alternative rejetée |
|---|---|---|
| **Même client binaire, 3 transports** | Codebase unique, dégradation gracieuse | "App offline" séparée → cauchemar maintenance |
| **Y.js source de vérité, backend = relay** | Y.js mathématiquement peer-agnostique → serveur optionnel | Algo OT custom → réinventer CRDT, 10× effort |
| **Redis uniquement, pas SQL** | Tout éphémère, atomic ops, pas de migrations | Postgres → overkill, plus lent, CRON cleanup |
| **Fastify > Express** | 3× plus rapide, plugin encapsulation, schema validation builtin | Express → standard mais plus lent, types faibles |
| **SvelteKit > Next** | 60KB vs 300+, mandatory pour cible 3G | Next → écosystème large mais bust le budget bundle |
| **Frontend Vercel** | CDN mondial gratuit, perfomance edge | Auto-hébergé Nginx → moins rapide mondialement |
| **Backend serveur maison + Cloudflare Tunnel** | Souveraineté + zéro coût + sécurisé sans port forwarding | Tout sur Vercel → cher pour WebSocket, pas souverain |
| **Protocole Socket.IO custom pour Y.js** | Une dépendance en moins, contrôle total | y-socket.io → opaque, debug difficile |
| **Audio-Slice = microservice séparé** | Revente standalone (pitch STIC), scaling indépendant | Embedded backend → couplage, scaling GPU complexe |
| **Auth par cookie httpOnly (pas JWT)** | XSS-immune, pas de token client à gérer | JWT → vulnérable à exfiltration XSS |
| **Pas de système migrations DB** | Redis schemaless, convention nom de clés en code | Framework migrations → complexité prématurée |
| **Déploiement single-node v1** | 500 rooms / 25k participants tient sur 1 serveur maison | Kubernetes → 100× complexité ops pour zéro bénéfice |

---

## 11. Risques connus & mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Redis OOM lors d'un pic viral | Moyenne | Élevé | maxmemory cap + allkeys-lru + alerte 80% |
| PC host se met en veille (mode LAN) | Élevée | Moyen | y-indexeddb chaque client → crash host = pas de perte d'état |
| WebRTC NAT traversal nécessaire (LAN différents) | Faible (v1) | Moyen | Defer v2 avec TURN |
| Whisper trop lent sur CPU-only | Élevée | Faible (Audio-Slice optionnel) | Modèles quantifiés (whisper.cpp) + limite queue |
| Upload malware bypass magic-byte | Faible | Moyen | ClamAV en Phase 6, lifecycle R2 limite exposition |
| Abus domaine (porn / phishing rooms) | Moyen | Élevé légal | Contact abuse + route emergency shutdown + log audit |
| Bus factor — dev solo | Élevée | Élevé | Docs détaillées, runbook, monitoring playbook, code conventionnel |
| **Coupure internet maison** (backend down) | Moyenne | Élevé (cloud users) | Mode LAN reste utilisable + mode Offline fallback automatique |

---

## 12. Hors scope (explicite)

- Voice/video calling — utiliser lien Jitsi si besoin
- Chiffrement E2E des notes — l'hébergement souverain est l'histoire privacy ; E2E = v3
- Apps mobiles natives — PWA couvre jusqu'à Tauri/Capacitor en Phase 5
- Fédération (protocole multi-instance) — pas justifié par les use cases
- Paiement intégré — billing Pro tier manuellement out-of-band jusqu'à v2
- Multi-tenant SaaS isolation — single tenant par déploiement VPS pour l'instant

---

**Posture architecturale** : optimiser pour **simplicité × souveraineté × capacité offline** — dans cet ordre. Tout le reste est secondaire.

---

## Annexe A — Compte de tokens estimé

| Phase | Estimation tokens dev |
|---|---|
| Phase 1 backend + LAN + offline | ~500k (4-5 sessions intensives) |
| Phase 2 deploy cloud | ~100k (1 session) |
| Phase 3 Audio-Slice | ~400k (3 sessions) |
| Phase 4 polish STIC | ~200k (2 sessions) |
| **Total MVP complet** | **~1.2M tokens** |

Avec sessions de 200k tokens, ça représente ~6 sessions intensives bien planifiées.
