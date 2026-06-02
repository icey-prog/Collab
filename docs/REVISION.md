# RÉVISION — Concepts utilisés dans Collab MVP

> Fiche de révision personnelle. Pour chaque concept : **ce que c'est**, **pourquoi on l'utilise ici**, **exemple dans notre code**, **piège connu**.
>
> Mets à jour quand tu rencontres un nouveau concept dans le projet.

---

## 1. SvelteKit & Svelte

### `+page.svelte` vs `+layout.svelte` vs `+error.svelte`
- **`+page.svelte`** : composant d'une route (`/about` → `routes/about/+page.svelte`)
- **`+layout.svelte`** : wrapper hérité par toutes les routes enfants (charge le CSS global, hydrate stores)
- **`+error.svelte`** : composant affiché si une route throw ou retourne un code erreur
- **`[id]`** : route dynamique → `$page.params.id` côté composant

### Stores Svelte (`writable`, `derived`)
- **C'est quoi** : observable réactif. Le composant se re-render quand le store change.
- **Pourquoi** : éviter le prop drilling. État global partagé (theme, palette, room status).
- **Syntaxe** :
  ```ts
  const count = writable(0);
  count.set(5);
  count.update(n => n + 1);
  count.subscribe(n => console.log(n));
  ```
- **Dans le composant** : `$count` (avec préfixe `$`) = valeur auto-souscrite, cleanup auto.
- **Piège** : `$count = 5` dans `<script>` réassigne via `count.set(5)` automatiquement. Magie Svelte.

### Réactivité `$:`
- **C'est quoi** : expression recalculée à chaque changement de ses dépendances.
- **Exemple** :
  ```svelte
  <script>
    let count = 0;
    $: doubled = count * 2;            // re-calcule si count change
    $: console.log('count =', count);   // side-effect réactif
  </script>
  ```
- **Piège** : `$:` n'est PAS un useEffect React. C'est synchrone, fires aussi pendant l'init.

### `bind:value` (two-way binding)
- **C'est quoi** : sync state ↔ input
- **Exemple** : `<input bind:value={code} />` — taper modifie `code`, set `code` modifie l'input.
- **Piège** : avec Y.js on doit faire un bind manuel (`value={...}` + `on:input`) pour diff la mutation, sinon perte de curseur.

### `onMount` / `onDestroy`
- Hooks lifecycle. `onMount` = côté browser uniquement (équivalent React `useEffect(()=>{}, [])`).
- Toujours retourner / cleanup dans `onDestroy` pour : timers, socket listeners, Y.Doc.

---

## 2. CRDT et Y.js

### CRDT = Conflict-free Replicated Data Type
- **Problème résolu** : 2 personnes éditent le même texte en même temps. Comment merger sans perdre de données et sans conflit ?
- **Solution naïve** (chat traditionnel) : verrou pessimiste, ou last-write-wins → perte d'info.
- **Solution CRDT** : structure mathématique qui garantit que **toute combinaison d'updates donne le même résultat final**, peu importe l'ordre d'application.
- **Y.js** : implémentation CRDT JavaScript la plus utilisée. Petite (~20KB).

### `Y.Doc`, `Y.Text`
- **`Y.Doc`** : container racine. Une room = un Y.Doc.
- **`Y.Text`** : type partagé pour texte collaboratif. Méthodes `insert(pos, str)`, `delete(pos, len)`.
- **Sync** : `Y.encodeStateAsUpdate(doc)` → snapshot binaire ; `Y.applyUpdate(doc, update)` → merge entrant.
- **Dans notre code** : `apps/frontend/src/lib/yjs.ts`

### Pourquoi pas y-websocket / y-socket.io ?
- Les providers officiels ajoutent dépendances + protocole spécifique.
- Notre cas : Socket.io déjà présent pour Q&A/participants. On réutilise → moins de code, moins de surface.
- Trade-off : on doit gérer le protocole sync nous-mêmes (3 events : `yjs:state` / `yjs:sync` / `yjs:update`).

### Piège connu
- **Echo loop** : si on applique un update local et qu'il re-trigger l'event `update`, on re-broadcast indéfiniment. Solution : passer un `origin` à `applyUpdate` (ex. `'remote'`) et filtrer dans le handler.

---

## 3. Socket.io

### REST vs WebSocket
- **REST (HTTP)** : requête-réponse. Bonne pour CRUD ponctuel (créer une room, uploader un fichier).
- **WebSocket** : connexion persistante bidirectionnelle. Bonne pour temps réel (sync notes, broadcast Q&A, participants count).
- **Socket.io** : librairie qui abstrait WebSocket + fallback polling + reconnect auto + rooms (groupes de sockets).

### Singleton pattern (notre `socket.ts`)
- **Pourquoi** : 1 seule connexion par browser, partagée entre composants.
- **Comment** : module-level variable `let socket: Socket | null = null` + getter qui crée à la demande.
- **Cleanup** : `disconnectSocket()` dans `onDestroy` pour libérer.

### `socket.emit` vs `socket.broadcast.emit` vs `io.to(room).emit`
- `socket.emit(event, data)` : envoie à CE client uniquement
- `socket.broadcast.emit(...)` : envoie à TOUS sauf l'émetteur
- `io.to(roomId).emit(...)` : envoie à tous les sockets du namespace dans la room (inclut émetteur)
- `socket.to(roomId).emit(...)` : tous dans la room SAUF l'émetteur

### Piège
- Socket.io ne traverse pas un cluster sans **adapter Redis** (`@socket.io/redis-adapter`). Sinon worker 1 et worker 2 ne se voient pas → user A et user B sur la même room ne reçoivent pas les mêmes events.

---

## 4. Redis

### Pourquoi Redis pas Postgres ici ?
- Toutes les données sont **éphémères** (TTL 4h max).
- Besoin d'opérations atomiques rapides (SETNX, INCR, ZADD).
- Pub/Sub natif pour broadcast cluster.
- Postgres = overkill, plus lent, et il faudrait CRON pour cleanup TTL.

### Types Redis utilisés
- **STRING** : config room (JSON), counter participants
- **HASH** : data d'une question (`text`, `createdAt`)
- **SORTED SET (ZSET)** : Q&A triée par votes (score)
- **SET** : voters d'une question (idempotence vote)
- **LIST** : fichiers uploadés

### Commandes clés
- `SETNX key value` : SET if Not eXists → garantit unicité d'un roomId (atomique)
- `SET key value EX 14400 NX` : version moderne avec TTL en 1 commande
- `INCR / DECR` : compteur atomique (jamais de race)
- `ZADD key score member` : ajouter avec score
- `ZINCRBY key 1 member` : +1 sur score (vote)
- `ZREVRANGE key 0 -1 WITHSCORES` : liste triée desc avec scores

### Keyspace notifications
- Redis peut publier des events quand une clé expire ou change.
- Activé via `notify-keyspace-events KEx` (K = events, E = key-events, x = expired).
- On écoute `__keyevent@0__:expired` pour libérer les Y.Doc en mémoire.
- **Piège** : Subscribe met la connexion en mode "subscriber only" → il faut **duplicate()** la connexion pour subscribe (sinon les SET/GET du reste de l'app crashent).

---

## 5. Fastify

### Pourquoi pas Express ?
- 2-3× plus rapide qu'Express (35MB RAM à vide vs 80MB).
- Plugin system propre (encapsulation, lifecycle hooks).
- Schema validation JSON intégrée.
- Logger Pino haute perf intégré.

### Plugin pattern
```ts
// plugins/redis.ts
import fp from 'fastify-plugin';
export default fp(async (app) => {
  const redis = new Redis(...);
  app.decorate('redis', redis);     // → app.redis dispo partout
  app.addHook('onClose', () => redis.quit());
});
```
- `fp(...)` = wrap pour partager les decorations entre plugins (sinon scope-only).

### Form Request validation (côté Fastify)
- Pas de FormRequest comme Laravel. Mais on passe un schema JSON à la route :
  ```ts
  app.post('/x', { schema: { body: { type: 'object', required: ['text'], ... } } }, handler)
  ```
- Validation auto, erreurs 400 auto.

---

## 6. Docker & déploiement

### Multi-stage build (frontend)
- Phase 1 : `node:20-alpine` pour `npm ci && npm run build`
- Phase 2 : `nginx:alpine` qui copie `/app/build` → `/usr/share/nginx/html`
- Image finale ~30MB au lieu de 800MB.

### `docker-compose` : services
- Chaque service = un container. Réseau privé partagé entre services nommés.
- `depends_on` n'attend PAS que le service soit "prêt", juste démarré. Solution : `healthcheck` + `condition: service_healthy`.

### Volume vs bind mount
- **Volume** (`redis_data:/data`) : géré par Docker, persiste entre `docker compose down/up`.
- **Bind mount** (`./code:/app`) : sync direct avec le filesystem hôte (dev).

---

## 7. Architecture & design

### Règle 60-30-10 (couleurs)
- 60% surface dominante (fond)
- 30% texte/structure
- 10% accent unique
- **Pourquoi** : guide l'œil. Si tout crie, rien n'est entendu (Elegance §3 §6).

### Bauhaus minimaliste fonctionnel
- Whitespace = élément actif, pas un vide.
- Pas de décoration gratuite. Chaque pixel a une raison.
- Inspirations : Linear, Arc, Notion v2.

### Pattern Claude (cream-strong cursor)
- Tab actif = fond solid cream-strong (`#F0EBDD`), pas un fill brand fort.
- Lecture plus calme que "voilà l'élément actif EN GROS".
- Le chartreuse reste **scarce** = seul vrai signal d'action (CTA, badge actif).

### Pourquoi pas Tailwind ?
- Design system custom centralisé dans `collab.css` via CSS vars.
- 4 palettes = 4 jeux de tokens. Tailwind aurait demandé un préset par palette.
- Bundle plus petit en pratique (pas de classes générées en masse).

---

## 8. Git workflow

### Branches déployables
- `main` = stable, tags de release
- `front` = travail SvelteKit, push = rebuild static
- `back` = travail Fastify, push = rebuild container

### Pourquoi 3 branches au lieu de feature branches ?
- Solo dev / petite équipe → pas de PR review formel.
- Permet de déployer 1 côté sans toucher à l'autre.
- Trade-off : merger main back regularly to keep branches en phase.

### Commit messages (convention)
- `feat(front): add join preview page`
- `fix(back): redis subscriber duplicate`
- `chore(infra): nginx config tighten security headers`
- Types : `feat | fix | chore | docs | refactor | test | perf`
- Scopes : `front | back | infra | design | docs`

---

## 9. Questions à creuser plus tard

- [ ] **Cluster mode PM2** : comment ça partage les WebSockets ? Redis adapter — lire la doc
- [ ] **TypeScript strict** : `strict: true` cache quels pièges ?
- [ ] **Svelte 5 runes** : `$state` / `$derived` — vaut-il le coup de migrer ?
- [ ] **Y.js Awareness** : pour montrer les curseurs des autres dans l'éditeur
- [ ] **Service Worker offline** : queue IndexedDB pour brouillon hors-ligne
- [ ] **Bun vs Node** : Bun gère ws nativement, perf 2× — wait & see
- [ ] **WebRTC** : pour le voice/video si Collab v2 ajoute ça

---

## 10. Erreurs courantes rencontrées (mises à jour au fil)

| Erreur | Cause | Fix |
|---|---|---|
| `ERR_MODULE_NOT_FOUND '@sveltejs/kit/vite'` | Versions cassées dans package.json | Reset versions à `@sveltejs/kit ^2.x`, `vite ^5.x` |
| `Connection in subscriber mode` Redis | Subscribe sur connexion principale | `app.redis.duplicate()` pour le subscriber |
| Echo loop Y.js | Pas de filtrage `origin === 'remote'` | Passer `'remote'` à `Y.applyUpdate`, filtrer dans `doc.on('update')` |
| Cookie pas envoyé en cross-port (dev) | Vite :5173 → backend :3001 | Vite proxy `/socket.io` ws:true + `credentials: 'include'` |
| `rm -rf` PowerShell | Pas une commande native | `Remove-Item -Recurse -Force` |
