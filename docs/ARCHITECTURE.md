# ARCHITECTURE — Collab MVP

## Vue d'ensemble système

```
                   ┌────────────────┐
                   │   Browser      │
                   │   (mobile/PC)  │
                   └───┬────────┬───┘
                       │ HTTPS  │ WebSocket
                       ▼        ▼
              ┌──────────────────────┐
              │   Nginx (reverse)    │  ← Let's Encrypt SSL
              │   :443 + :80→:443    │
              └────┬──────────────┬──┘
                   │              │
       static /    │              │  /room/* /admin/* /socket.io/*
       index.html  │              │
                   ▼              ▼
        ┌────────────────┐  ┌──────────────────┐
        │  /var/www/     │  │  Fastify :3001   │
        │  collab/       │  │  + PM2 cluster   │
        │  (build SvK)   │  │  (6 workers)     │
        └────────────────┘  └────┬─────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    ▼                          ▼
            ┌──────────────┐          ┌──────────────────┐
            │  Redis 7     │          │  Cloudflare R2   │
            │  TTL 4h      │          │  files / 24h     │
            │  Pub/Sub     │          │  lifecycle       │
            └──────────────┘          └──────────────────┘
```

---

## Frontend — SvelteKit

### Stack
- **SvelteKit 2.x** (adapter-static — build vers `build/`, servi par Nginx)
- **Svelte 4** (composants legacy stable, pas runes)
- **Vite 5** (dev server + proxy `/room` `/socket.io` → `:3001`)
- **TypeScript strict**
- **socket.io-client 4.7** (transport WebSocket)
- **yjs 13** (CRDT — pas de y-websocket, on utilise notre Socket.io)

### Arborescence

```
apps/frontend/
├── package.json
├── svelte.config.js          # adapter-static, fallback SPA
├── vite.config.ts            # proxy dev → :3001
├── tsconfig.json
└── src/
    ├── app.html              # template HTML (fonts preconnect)
    ├── app.css               # → copie de collab.css (design system)
    ├── lib/
    │   ├── socket.ts         # Singleton Socket.io
    │   ├── yjs.ts            # Y.Doc wrapper + sync via Socket.io
    │   ├── api/
    │   │   └── room.ts       # createRoom() · getRoomPreview() · isValidRoomCode()
    │   ├── stores/
    │   │   ├── theme.ts      # mode (light/dark) + palette (a/b/c/d) — 2 axes persistés
    │   │   ├── room.ts       # participants, isAdmin, sbCollapsed, activeModule, status, toasts
    │   │   ├── qa.ts         # questions[]
    │   │   └── files.ts      # files[]
    │   └── components/
    │       ├── Sidebar.svelte         # Dual-rail collapsible (rail 64px + panel 256px)
    │       ├── NotesModule.svelte     # Y.Text ↔ textarea diff bind
    │       ├── FilesModule.svelte     # Drop zone + multipart upload + admin delete
    │       ├── QAModule.svelte        # Input + voted list + admin delete
    │       ├── ToastStack.svelte      # Notifications slide-in 0.4s
    │       ├── ChromeTR.svelte        # Cluster top-right (palette + theme)
    │       ├── PaletteSwitch.svelte   # Sélecteur A/B/C/D (inline + rail)
    │       └── ThemeToggle.svelte     # Bouton clair/sombre
    └── routes/
        ├── +layout.svelte             # Hydrate body classes (theme + palette)
        ├── +page.svelte               # / Landing — créer/rejoindre
        ├── +error.svelte              # 404 / 500 — brand cohérent
        ├── about/+page.svelte         # /about Manifesto
        ├── join/[id]/+page.svelte     # /join/X7K92P Preview avant entrée
        └── room/[id]/
            ├── +page.svelte           # /room/X7K92P Orchestration room
            └── expired/+page.svelte   # /room/X7K92P/expired
```

### Flux de données

```
Component ─emit─▶ Socket  ─────▶  Backend
                  │                   │
Store ◀──update── │ ◀──broadcast──────┘
   │
   ▼
Component (auto-re-render via $store)
```

Y.js spécifique :

```
Textarea oninput
  └─▶ diff prev/next → yText.delete + yText.insert (transact)
        └─▶ doc emit 'update' (origin = undefined)
              └─▶ socket.emit 'yjs:sync' { roomId, update }
                    └─▶ backend applyUpdate + socket.to(room).emit 'yjs:update'
                          └─▶ peer client receives → Y.applyUpdate(doc, u8, 'remote')
                                └─▶ doc emit 'update' (origin = 'remote' → skip echo)
                                └─▶ yText.observe fires → textarea value re-sync
```

### Routes

| Path | Composant | Rôle |
|---|---|---|
| `/` | `+page.svelte` | Landing — créer ou rejoindre |
| `/about` | `about/+page.svelte` | Manifesto |
| `/join/[id]` | `join/[id]/+page.svelte` | Preview room (participants, expiration) |
| `/room/[id]` | `room/[id]/+page.svelte` | Interface room (3 modules) |
| `/room/[id]/expired` | `room/[id]/expired/+page.svelte` | Room introuvable/expirée |
| `*` (404/5xx) | `+error.svelte` | Erreur globale |

---

## Backend — Fastify

### Stack
- **Fastify 4** (logger Pino, plugin system)
- **Socket.io 4.7** (transport WebSocket, Redis adapter pour cluster)
- **@socket.io/redis-adapter** (pub/sub entre workers PM2)
- **ioredis 5** (1 client commands + 1 dupliqué pour subscribe keyspace)
- **yjs 13** (relay in-memory par room, libéré sur expire)
- **@aws-sdk/client-s3** (Cloudflare R2 compatible S3)
- **file-type 19** (magic bytes validation upload)
- **PM2** (cluster 6 workers — saturer 6 cores VPS)

### Arborescence prévue

```
apps/backend/
├── package.json
├── tsconfig.json
├── ecosystem.config.js       # PM2 cluster 6 workers
├── Dockerfile
└── src/
    ├── server.ts             # Entry — Fastify + Socket.io + plugin registrations
    ├── plugins/
    │   ├── redis.ts          # Decorate app.redis (commands client)
    │   ├── cookie.ts         # @fastify/cookie
    │   ├── rateLimit.ts      # @fastify/rate-limit (Redis backend)
    │   ├── socket.ts         # Socket.io events (join, qa, files)
    │   ├── yjs.ts            # Y.js relay (custom protocol)
    │   └── storage.ts        # R2 ou local selon STORAGE_MODE
    └── routes/
        ├── room.ts           # POST /room/create · GET /room/:id · DELETE /room/:id
        ├── upload.ts         # POST /room/:id/upload
        ├── qa.ts             # GET /room/:id/questions (REST fallback)
        └── stats.ts          # GET /admin/stats (protégé X-Admin-Secret)
```

### Schéma Redis

```
room:{id}:config         STRING   {created_at, admin_token_hash}    TTL 14400s
room:{id}:admin          STRING   HMAC(token)                       TTL 14400s
room:{id}:count          STRING   integer (INCR/DECR atomique)      TTL 14400s
room:{id}:qa             ZSET     {questionId → votes}              TTL 14400s
room:{id}:q:{qId}        HASH     {text, createdAt}                 TTL 14400s
room:{id}:q:{qId}:voters SET      {voterFingerprint}                TTL 14400s  ← idempotence
room:{id}:files          LIST     JSON {key, name, size, type, url} TTL 14400s
rl:{ip}:create           STRING   sliding window                    TTL 3600s
```

Config Redis recommandée :
```
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
notify-keyspace-events KEx    # critical : libère Y.js docs sur expire
```

### Events Socket.io

**Client → Serveur**

| Event | Payload | Logique |
|---|---|---|
| `join:room` | `{ roomId }` | Check config existe, INCR count (max 50), socket.join(roomId), check cookie admin |
| `qa:add` | `{ text }` (≤500 chars) | HSET + ZADD score 0, broadcast `qa:updated` |
| `qa:vote` | `{ questionId }` | SADD voters (dédupe), ZINCRBY 1, broadcast `qa:updated` |
| `qa:delete` | `{ questionId }` | Admin only — ZREM + DEL hash, broadcast |
| `file:delete` | `{ fileKey }` | Admin only — remove R2/local + LREM list, broadcast |
| `yjs:state` | `{ roomId, sv }` | Renvoie snapshot diff via `Y.encodeStateAsUpdate(doc, sv)` |
| `yjs:sync` | `{ roomId, update }` (≤64KB) | `Y.applyUpdate` + `socket.to(roomId).emit('yjs:update', ...)` |

**Serveur → Client**

| Event | Payload |
|---|---|
| `room:joined` | `{ participants, isAdmin }` |
| `room:error` | `{ code: 'NOT_FOUND' }` |
| `room:full` | `{ max: 50 }` |
| `room:closed` | `–` |
| `participants:count` | `{ count }` |
| `qa:updated` | `Question[]` (triés par votes desc) |
| `files:updated` | `RoomFile[]` |
| `yjs:state` | `{ roomId, doc }` (snapshot diff) |
| `yjs:update` | `{ roomId, update }` (broadcast peers) |

### Sécurité

| Vecteur | Mesure | Couche |
|---|---|---|
| Spam rooms | Rate limit 5/h/IP via sliding window Redis | Fastify |
| Collision RoomID | SETNX atomique + retry loop max 10 | Redis |
| Token admin volé | Cookie httpOnly SameSite=Strict, hash HMAC en Redis | Fastify |
| Upload malveillant | Magic bytes (file-type) + whitelist MIME + cap 10MB | Fastify |
| Room saturée | INCR/DECR atomique, max 50 | Socket.io |
| Saturation mémoire | maxmemory 256MB + TTL 4h + lifecycle R2 24h | Redis + R2 |
| DoS Y.js update | Cap 64KB par message | Socket.io |
| XSS → token | httpOnly → cookie inaccessible JS | Browser |
| Accès cross-room | Cookie scopé par roomId (`admin_{id}`) | Fastify |

---

## Déploiement

### Cibles
- **Demo** : Oracle Cloud Free Tier (ARM A1, 24GB RAM)
- **Prod** : Contabo VPS S (€5.99/mois, 4 vCPU, 8GB, Frankfurt)
- **Domaine** : `collab.exxolab.bf` (Let's Encrypt auto-renew)

### Compose modes

**SaaS** (`docker-compose.yml`)
- backend (Fastify+PM2) + redis
- frontend servi par Nginx hors Docker → build copié vers `/var/www/collab/`
- STORAGE_MODE=r2

**White-label** (`docker-compose.embed.yml`)
- frontend (Nginx in Docker) + backend + redis
- STORAGE_MODE=local (volume monté)
- Livré au client en ZIP avec README

### Hook git post-receive (serveur perso)

Voir `docs/AI-BACKEND-DEPLOY.md` pour le prompt complet à donner à l'IA serveur.
