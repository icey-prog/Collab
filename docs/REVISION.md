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

## 9. Y.js Awareness (multi-cursor presence)

### C'est quoi
- Couche **éphémère** par-dessus Y.Doc (jamais persistée), portée par `y-protocols/awareness`.
- Chaque client publie un `state` (objet libre) associé à son `clientID` (auto-généré par `Y.Doc`).
- Les autres clients reçoivent ce state via un transport (socket, WebSocket, WebRTC).

### Différence avec Y.Doc
| Y.Doc | Awareness |
|---|---|
| Contenu (texte, listes…) | Métadonnées vivantes (curseur, sélection, identité) |
| Persisté (IndexedDB, serveur) | Volatil — disparaît au disconnect |
| CRDT merge | Last-write-wins par `clientID` |

### API minimal
```ts
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';

const awareness = new Awareness(doc);
awareness.setLocalStateField('user', { name: 'Renard #42', color: '#E63946' });

awareness.on('update', ({ added, updated, removed }, origin) => {
  if (origin === 'remote') return;
  const update = encodeAwarenessUpdate(awareness, added.concat(updated, removed));
  socket.emit('awareness:update', { update });
});

socket.on('awareness:update', ({ update }) => {
  applyAwarenessUpdate(awareness, new Uint8Array(update), 'remote');
});
```

### Pourquoi 2 connexions / 2 protocoles
- **Doc updates** = persistantes, doivent être stockées/relayées par le serveur.
- **Awareness updates** = volatiles. Si le serveur les perd, pas grave (le client republiera).
- Garder les 2 events séparés évite de polluer le Y.Doc avec des positions de curseur.

### Cleanup au unload
- Sans cleanup, les clients "fantômes" restent dans `awareness.getStates()`.
- Solution : `removeAwarenessStates(awareness, [doc.clientID], 'unload')` dans `beforeunload`.

### Dans notre code
- [`apps/frontend/src/lib/yjs.ts`](apps/frontend/src/lib/yjs.ts) — identité animale anonyme persistée en sessionStorage, transport via socket events `awareness:update`.

---

## 10. CodeMirror 6

### Pourquoi pas `<textarea>` ?
- `<textarea>` ne supporte pas d'**overlay** : impossible de dessiner un curseur d'un autre user au milieu du texte.
- Pas de sélection coloriée par-client.
- Pas de syntax highlighting / line numbers / line wrapping nativement.

### Architecture CodeMirror 6
- **`EditorState`** : modèle immutable du contenu + sélection + extensions actives.
- **`EditorView`** : DOM render + dispatch des changements via `Transaction`.
- **Extensions** : tout est extension (line numbers, keymap, highlight, syntax). Composables.
- **`Compartment`** : permet de swap dynamiquement une extension (changer le thème runtime).

### Pattern minimal
```ts
const state = EditorState.create({
  doc: 'hello',
  extensions: [
    lineNumbers(),
    keymap.of(defaultKeymap),
    markdown(),
    EditorView.theme({ '.cm-content': { padding: '12px' } })
  ],
});
const view = new EditorView({ state, parent: hostElement });
```

### `y-codemirror.next` (binding Y.js)
- Extension `yCollab(yText, awareness)` qui :
  1. Sync bidirectionnel `Y.Text ↔ CodeMirror state`.
  2. Lit `awareness.getStates()` et render curseurs/sélections distants (classes `.cm-ySelection`, `.cm-ySelectionCaret`).
- Le state de l'awareness DOIT contenir un champ `user: { name, color, colorLight }` pour que le rendering automatique fonctionne.

### Pièges
- **Sélection CSS** : par défaut le sélecteur natif `::selection` du browser cache la sélection CodeMirror. Override via `.cm-selectionBackground` ET `::selection` dans le thème.
- **Bundle size** : ~80KB minified. SvelteKit fait du code-splitting auto → la page landing ne le charge pas.
- **`cm-host`** : utiliser `:global(.cm-host .cm-editor)` car CodeMirror injecte du DOM hors du composant Svelte (scoping CSS échoue).

### Dans notre code
- [`apps/frontend/src/lib/components/NotesModule.svelte`](apps/frontend/src/lib/components/NotesModule.svelte)

---

## 11. PWA, Service Worker, Manifest

### Trois piliers d'une PWA installable
1. **Manifest** (`manifest.webmanifest`) — métadonnées (nom, icons, theme_color, display).
2. **Service Worker** — proxy réseau qui intercepte les fetch, sert depuis cache.
3. **HTTPS** — obligatoire (sauf `localhost`).

### Manifest — champs critiques
```json
{
  "name": "Collab",
  "short_name": "Collab",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#364C84",
  "background_color": "#364C84",
  "icons": [{ "src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }]
}
```

### Icônes SVG vs PNG
- **PNG** classique : nécessite plusieurs tailles (192, 512). Lourd à générer.
- **SVG** : un seul fichier sert toutes les tailles via `"sizes": "any"`. Plus léger.
- **`maskable`** : indique que l'icône peut être croppée en cercle/superellipse (Android). Garder le motif dans la "safe zone" (cercle 80% du carré).

### SvelteKit Service Worker
- Place un fichier `src/service-worker.ts` → SvelteKit l'enregistre automatiquement (pas besoin d'appeler `navigator.serviceWorker.register`).
- Globals injectés : `build` (chunks app), `files` (static/), `version` (auto).

### Stratégies de cache
| Stratégie | Quand | Exemple |
|---|---|---|
| **Cache-first** | Assets immutables (chunks Vite) | `build` array |
| **Network-first** | API live | requêtes `/api/...` |
| **Stale-while-revalidate** | Contenu user mais cache OK | thumbnails |

### Pièges
- SW persiste **entre rebuilds**. Si version change pas → cache obsolète. Solution : utiliser `version` injecté par SvelteKit dans le nom du cache.
- DevTools Application > Service Workers > "Update on reload" pendant le dev.

---

## 12. IndexedDB & queue offline

### Pourquoi pas `localStorage` ?
- `localStorage` : ~5MB limit, **synchrone** (bloque le main thread), strings only.
- `IndexedDB` : Go de stockage, **async**, objets natifs, transactions.

### API IndexedDB raw — pattern minimal
```ts
const req = indexedDB.open('mydb', 1);
req.onupgradeneeded = () => req.result.createObjectStore('actions', { keyPath: 'id' });
req.onsuccess = () => {
  const tx = req.result.transaction('actions', 'readwrite');
  tx.objectStore('actions').add({ id: crypto.randomUUID(), payload: {...} });
};
```

### Wrapper recommandé : `idb` (Jake Archibald)
- Promisifie l'API verbose IDB. ~3KB.
- Pour notre outbox simple on a écrit la raw API directement (évite la dep).

### Pattern outbox
1. Au `submit()` : si `!isOnline` → `outboxAdd()` puis toast "enregistré hors ligne".
2. Au retour réseau : `window.addEventListener('online', flushAll)`.
3. `flush()` parcourt la queue, ré-émet via socket, supprime après succès.
4. **Préserver `offline_created_at`** : timestamp local au moment de la queue, pas du flush → audit trail correct.

### Y-IndexedDB (Y.Doc persistence)
- `new IndexeddbPersistence('collab-room-XXX', doc)` — auto-load le doc au mount, auto-save à chaque update.
- Permet édition offline complète. Le doc est mergé proprement avec le serveur au retour.

### Pièges
- IndexedDB **n'est PAS** disponible en SSR. Toujours wrap dans `if (browser)` ou `onMount`.
- Versionning : changer le schéma → bump `VERSION` et gérer `onupgradeneeded`. Sinon clients existants restent bloqués.

### Dans notre code
- [`apps/frontend/src/lib/offline/outbox.ts`](apps/frontend/src/lib/offline/outbox.ts) — queue qa:add raw IDB.
- [`apps/frontend/src/lib/yjs.ts`](apps/frontend/src/lib/yjs.ts) — `IndexeddbPersistence` pour Y.Doc.

---

## 13. SvelteKit 2 — props automatiques sur layout/page

### Le warning `unknown prop 'params'`
- SvelteKit injecte automatiquement `data`, `params`, `form` sur les `+layout.svelte` / `+page.svelte` qui matchent une route dynamique.
- Si tu ne les déclares pas → warning runtime `<Layout> was created with unknown prop 'params'`.

### Solution propre — `export const`
```svelte
<script lang="ts">
  // Absorbe les props injectés sans les utiliser, sans warning svelte-check
  export const data:   unknown = undefined;
  export const params: Record<string, string> | undefined = undefined;
  export const form:   unknown = undefined;
  void data; void params; void form;
</script>
```

### Pourquoi `const` et pas `let`
- `export let unused` → svelte-check warn "Component has unused export property — use `export const`".
- `export const` = prop **read-only depuis l'extérieur**. Svelte accepte qu'on l'injecte mais on ne peut pas le réassigner. Parfait pour absorber sans utiliser.

---

## 14. Z-index, contexte d'empilement, et highlight chartreuse

### Le bug rencontré
Le highlight `.hl` du hero était fait via `::before` avec `z-index: -1` pour passer derrière le texte. **Invisible sur palettes B/C/D** (cream-strong sur cream-strong).

### Cause
- `z-index: -1` envoie l'élément derrière le **stacking context** parent.
- Si le parent ne crée pas de contexte (`position: static`, pas de `isolation`, pas de `transform`), `::before` se retrouve derrière le `<body>` → masqué.
- Sur palette A (paper clair), le `::before` passait derrière mais restait visible par contraste. Sur B/C/D (cream sur cream), il disparaissait littéralement dans le fond.

### Fix appliqué
```css
.hero .hl {
  color: var(--accent-ink);
  background: var(--chartreuse);  /* direct, pas via ::before */
  border-radius: 7px;
  padding: 2px 10px;
  display: inline-block;
}
```
- Plus de `::before` ni de jeu de z-index.
- Le `padding` remplace l'effet "marker" autour du mot.

### Règle
- **N'utilise `z-index: -1` que si le parent crée explicitement un stacking context** (`isolation: isolate` ou `position: relative` + `z-index: 0`).
- Préférer un `background` direct quand c'est possible.

---

## 15. Git config Windows — SSL

### Le bug rencontré
```
fatal: unable to access 'https://github.com/...': SSL certificate problem: unable to get local issuer certificate
```

### Cause
- Le bundle de certs livré avec Git for Windows ne contient pas toujours les CAs corporate.
- Git utilise OpenSSL par défaut, qui cherche dans son propre store, pas celui de Windows.

### Fix
```bash
git config --global http.sslBackend schannel
```
- Bascule sur **Schannel** = Windows Cert Store natif.
- Toutes les CAs installées sur Windows (Group Policy, Outlook, etc.) deviennent visibles.

### Alternatives
- `git config --global http.sslCAInfo "<path>"` — pointer vers un bundle custom (proxy entreprise).
- `git -c http.sslVerify=false push` — **NE PAS UTILISER** (MITM possible).

---

## 16. Questions à creuser plus tard

- [ ] **Cluster mode PM2** : comment ça partage les WebSockets ? Redis adapter — lire la doc
- [ ] **TypeScript strict** : `strict: true` cache quels pièges ?
- [ ] **Svelte 5 runes** : `$state` / `$derived` — vaut-il le coup de migrer ?
- [x] **Y.js Awareness** : pour montrer les curseurs des autres dans l'éditeur ✅ (voir §9)
- [x] **Service Worker offline** : queue IndexedDB pour brouillon hors-ligne ✅ (voir §11 + §12)
- [ ] **Bun vs Node** : Bun gère ws nativement, perf 2× — wait & see
- [ ] **WebRTC** : pour le voice/video si Collab v2 ajoute ça
- [ ] **Trusted Types policy** : prévention DOM-based XSS (Lot J sécurité)
- [ ] **CodeMirror 6 — Compartments** : swap thème/keymap runtime sans recreate EditorView

---

## 17. Erreurs courantes rencontrées (mises à jour au fil)

| Erreur | Cause | Fix |
|---|---|---|
| `ERR_MODULE_NOT_FOUND '@sveltejs/kit/vite'` | Versions cassées dans package.json | Reset versions à `@sveltejs/kit ^2.x`, `vite ^5.x` |
| `Connection in subscriber mode` Redis | Subscribe sur connexion principale | `app.redis.duplicate()` pour le subscriber |
| Echo loop Y.js | Pas de filtrage `origin === 'remote'` | Passer `'remote'` à `Y.applyUpdate`, filtrer dans `doc.on('update')` |
| Cookie pas envoyé en cross-port (dev) | Vite :5173 → backend :3001 | Vite proxy `/socket.io` ws:true + `credentials: 'include'` |
| `rm -rf` PowerShell | Pas une commande native | `Remove-Item -Recurse -Force` |
| `<Layout> was created with unknown prop 'params'` | SvelteKit injecte des props non déclarés | `export const data/params/form` dans `+layout.svelte` |
| `Component has unused export property 'data'` | `export let data` non lu | Bascule en `export const data` + `void data;` |
| Highlight chartreuse invisible palettes B/C/D | `::before` `z-index:-1` sans stacking context | Remplacer par `background` direct sur l'élément |
| `SSL certificate problem: unable to get local issuer certificate` (git push Windows) | OpenSSL bundle Git ignore CAs Windows | `git config --global http.sslBackend schannel` |
| `<textarea>` curseurs distants impossibles | `<textarea>` ne supporte pas overlay | Switch vers CodeMirror 6 + `y-codemirror.next` |
| Awareness "fantômes" après disconnect | Pas de cleanup unload | `removeAwarenessStates(awareness, [doc.clientID])` dans `beforeunload` |
| `IndexeddbPersistence is not defined` en SSR | Browser-only API | Wrap dans `if (browser)` ou `onMount` |
| Sélection CodeMirror cachée par `::selection` natif | Sélecteur browser plus spécifique | Override `.cm-selectionBackground, ::selection` ensemble dans le thème CM |
