# KAIROS — Session 2026-06-13 (Collab Front Audit)

**Projet** : Collab MVP (SvelteKit + Y.js + Socket.io)
**Branche** : `main` — commits `f2317cf`, `818da4c`
**Thème** : audit sécurité/bugs du front après livraison Lot C (offline) + CodeMirror 6 multi-curseurs

11 bugs racontés en analogies Feynman. À copier dans Kairos comme matériel d'apprentissage durable.

---

## #1 — Mock dev oublié en prod : la fausse clé d'admin sous le paillasson

**Analogie**
Tu loues un Airbnb. La porte s'ouvre toute seule 600ms après ton arrivée et un mot dit "bienvenue patron". Tu n'as rien fait — la maison décide que tu es admin parce que tu es sur le perron.

**Code**
[apps/frontend/src/routes/room/[id]/+page.svelte:74-79](../apps/frontend/src/routes/room/[id]/+page.svelte)
```ts
setTimeout(() => {
  status.set('joined');
  participants.set(1);
  isAdmin.set(true);
}, 600);
```

**Concept**
*Mock de dev en prod / debug backdoor*. Un faux serveur fictif posé pour tester l'UI seule, oublié en place.

**Pourquoi c'est grave**
Quand le vrai backend tournera, le serveur répondra "tu n'es pas admin", mais 600ms plus tard le code écrasera tout. L'utilisateur verra "Clore la room", cliquera, et croira l'avoir fait alors que le backend rejette.

**Fix**
Supprimer le bloc. Garder `status === 'connecting'` jusqu'au vrai `room:joined`.

---

## #2 — Validation entrée manquante : la boîte aux lettres au nom "Marc!@#$%"

**Analogie**
Tu fabriques une boîte aux lettres avec n'importe quel nom écrit dessus. Tu remplis ton hangar de boîtes-fantômes au nom imprononçable, le facteur les rejette plus tard. Tu as gaspillé des ressources entre-temps.

**Code**
[apps/frontend/src/routes/room/[id]/+page.svelte:26](../apps/frontend/src/routes/room/[id]/+page.svelte)
```ts
$: roomId = $page.params.id?.toUpperCase() ?? '';
//  utilisé tel quel dans :
//    new IndexeddbPersistence(`collab-room-${roomId}`, doc)
//    fetch(`/api/room/${roomId}`)
//    socket.emit('join:room', { roomId })
```

**Concept**
*Defense in depth* (validation côté client en complément du serveur). On ne fait pas confiance à l'URL.

**Pourquoi c'est un problème ici**
IndexedDB accepte n'importe quel `collab-room-XXX`. Un spam d'URLs `/room/aaa`, `/room/bbb` peut faire grossir la base locale d'un visiteur curieux jusqu'au quota navigateur. Pas catastrophique mais sale.

**Fix**
```ts
import { isValidRoomCode } from '$lib/api/room';

if (!isValidRoomCode(roomId)) {
  goto('/'); return;
}
```

---

## #3 — Race condition outbox : deux serveurs prennent la même commande

**Analogie**
Restaurant. Tu commandes un café. Serveur A note "café table 5", part le faire. Serveur B regarde le carnet, voit rien noté, dit "café table 5", part le faire. Tu reçois deux cafés et tu payes deux fois.

**Code**
[apps/frontend/src/lib/offline/outbox.ts:80-99](../apps/frontend/src/lib/offline/outbox.ts)
```ts
export async function outboxFlush(socket) {
  const items = await outboxGetAll();   // ← lit
  for (const item of items) {
    socket.emit('qa:add', { ... });     // ← envoie
    await outboxRemove(item.id);        // ← supprime
  }
}
```
Appelé à deux endroits qui peuvent se déclencher en même temps :
- `network.ts:18` — event `online`
- `room/[id]/+page.svelte:108` — au mount

**Concept**
*TOCTOU* (Time Of Check, Time Of Use) — entre le moment où on lit l'état et le moment où on agit, quelqu'un d'autre a modifié l'état.

**Pourquoi c'est un problème ici**
Le user revient en ligne avec 5 questions en attente. `online` fire ET la page room finit son `onMount` au même instant. Tes 5 questions partent **deux fois**. "Quel est le code wifi ?" apparaît en double dans la Q&A.

**Fix**
Verrou en mémoire :
```ts
let flushing = false;
export async function outboxFlush(socket) {
  if (flushing) return 0;
  flushing = true;
  try { /* boucle */ } finally { flushing = false; }
}
```

---

## #4 — DoS par taille non-bornée : le facteur n'a pas pesé le paquet

**Analogie**
Boîte aux lettres. Règle du facteur : "tout ce qu'on me donne, je le glisse dedans". Un mauvais plaisant envoie un coffre de 200 kg. Le facteur, fidèle à la règle, défonce ton perron en essayant.

**Code**
[apps/frontend/src/lib/yjs.ts:86-95](../apps/frontend/src/lib/yjs.ts)
```ts
const onUpdate = (msg) => {
  if (msg.roomId !== roomId) return;
  const u8 = msg.update instanceof Uint8Array ? msg.update : new Uint8Array(msg.update);
  Y.applyUpdate(doc, u8, 'remote');   // ← pas de pesée
};
```

**Concept**
*Unbounded resource consumption*. OWASP A05:2021.

**Pourquoi c'est un problème ici**
Serveur compromis (ou peer P2P futur) envoie un update Y.js de 50 Mo → `Y.applyUpdate` décode, fusionne, onglet figé plusieurs secondes ou crash. Avec 10 messages comme ça, l'app est morte.

**Fix**
Pesée à l'entrée :
```ts
if (u8.byteLength > 256 * 1024) {
  console.warn('Y.js update too large, dropped');
  return;
}
Y.applyUpdate(doc, u8, 'remote');
```

---

## #5 — Resource leak IDB : on n'arrête jamais d'ouvrir le tiroir

**Analogie**
Tu cherches une chaussette. Plutôt que de réutiliser le tiroir déjà ouvert, tu en ouvres un nouveau à chaque fois. À la fin, 50 tiroirs ouverts traînent. Pas dangereux mais sale.

**Code**
[apps/frontend/src/lib/offline/outbox.ts](../apps/frontend/src/lib/offline/outbox.ts) — chaque fonction commence par `const db = await openDB()`, jamais `db.close()`.

**Concept**
*Resource leak*. Le navigateur garde les handles IDB ouverts.

**Pourquoi c'est un problème ici**
Flush de 5 items = 6 connexions ouvertes (1 read + 5 deletes). Bénin sur une courte session, lourd sur un onglet ouvert plusieurs heures.

**Fix**
Singleton réutilisé :
```ts
let dbPromise: Promise<IDBDatabase> | null = null;
function getDB() {
  return dbPromise ??= openDB();
}
```

---

## #6 — Fausse alerte

J'avais signalé un risque de "destroy qui emit après teardown" dans `yjs.ts:139-152`. Relecture : l'ordre `awareness.off(...)` ligne 144 → `removeAwarenessStates` ligne 148 est correct. Pas de bug. **Leçon** : toujours re-vérifier l'ordre exact des opérations dans un teardown avant de conclure.

---

## #7 — Mobile lifecycle : la sonnette qui marche pas chez Apple

**Analogie**
Sonnette pour savoir quand quelqu'un sort de la maison. Marche sur Windows. Sur certaines portes (Safari iOS, Chrome Android), la sonnette ne fonctionne tout simplement pas. Tu crois personne n'est sorti.

**Code**
[apps/frontend/src/lib/yjs.ts:127-129](../apps/frontend/src/lib/yjs.ts)
```ts
window.addEventListener('beforeunload', onUnload);
```

**Concept**
*Mobile lifecycle event compatibility*. Safari iOS a désactivé `beforeunload` en 2022 pour économiser la batterie. `pagehide` est l'event moderne.

**Pourquoi c'est un problème ici**
iPhone, user ferme l'onglet → son curseur reste affiché chez les autres comme fantôme. Au bout d'une heure : 12 fantômes empilés.

**Fix**
```ts
window.addEventListener('pagehide', onUnload);
window.addEventListener('beforeunload', onUnload); // les deux pour ceinture+bretelles
```

---

## #8 — Graceful degradation manquante : le carnet sans encre en mode privé

**Analogie**
Carnet d'adresses qui refuse l'encre en navigation privée. Tu écris, rien s'imprime. Tu reviens, le carnet est vide, tu recommences.

**Code**
[apps/frontend/src/lib/yjs.ts:55-57](../apps/frontend/src/lib/yjs.ts)
```ts
try { sessionStorage.setItem('collab.identity', JSON.stringify(id)); } catch { /* ignore */ }
```

**Concept**
*Graceful degradation* — on gère l'erreur mais on n'a pas de plan B en mémoire.

**Pourquoi c'est un problème ici**
Safari mode privé : "Renard #42" → reconnect → "Hibou #88" → reconnect → "Loutre #15". Les autres voient sa couleur changer sans cesse.

**Fix**
Variable module-level comme fallback :
```ts
let inMemoryIdentity: UserIdentity | null = null;
function loadOrCreateIdentity() {
  if (inMemoryIdentity) return inMemoryIdentity;
  try {
    const raw = sessionStorage.getItem('collab.identity');
    if (raw) return inMemoryIdentity = JSON.parse(raw);
  } catch {}
  /* génère */
  try { sessionStorage.setItem(...); } catch {}
  return inMemoryIdentity = id;
}
```

---

## #9 — Input validation peer : la couleur écrite par un inconnu

**Analogie**
Fête. Chaque invité écrit sa couleur de chapeau. Un blagueur écrit "couleur : tirer la nappe". Pas de XSS dans notre cas (l'API DOM protège), mais sabotage cosmétique possible.

**Code**
[apps/frontend/src/lib/components/NotesModule.svelte:25](../apps/frontend/src/lib/components/NotesModule.svelte)
```ts
list.push({ id: clientId, name: u.name, color: u.color || '#888' });
```

**Concept**
*Input validation de données externes contrôlées par un peer*.

**Pourquoi c'est un problème ici**
- XSS : zéro (setProperty protège).
- Peer envoie `color: "var(--paper)"` → pastille invisible (sabotage discret).
- Peer envoie `color: "salut"` → pastille transparente.

**Fix**
Whitelist regex :
```ts
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const safe = COLOR_RE.test(u.color || '') ? u.color : '#888';
```

---

## #10 — Pas de TTL client : les plats oubliés au congélateur

**Analogie**
Tu mets des plats au congélateur "pour plus tard". Tu déménages, oublies le congélateur. Trois ans plus tard les plats sont encore là. Du temps figé.

**Code**
[apps/frontend/src/lib/offline/outbox.ts](../apps/frontend/src/lib/offline/outbox.ts) — aucun nettoyage périodique des items expirés.

**Concept**
*Stale data / TTL côté client*. Le serveur a Redis 4h, le client garde tout.

**Pourquoi c'est un problème ici**
Promesse Collab : "éphémère, disparu après 4h". Un user écrit hors-ligne, sa room expire pendant l'absence → sa question reste sur l'appareil indéfiniment. Promesse cassée.

**Fix**
Stocker `expiresAt = Date.now() + 4 * 3600 * 1000` à l'ajout, filtrer/nettoyer au mount.

---

## #11 — CSP absent : la maison sans alarme moderne

**Analogie**
Ta maison a des portes normales. Pas d'alarme, pas de caméras. Tu peux vivre dedans. **CSP** = la couche qui dit "n'exécute JAMAIS du JS d'un autre domaine, même si quelqu'un y arrive". Filet de dernière instance.

**Code**
[apps/frontend/src/app.html](../apps/frontend/src/app.html) — pas de `<meta http-equiv="Content-Security-Policy">`.

**Concept**
*CSP + Trusted Types + SRI*. Lot J du plan SUIVI.

**Pourquoi pas urgent**
Pas de faille XSS introduite cette session. CSP est un blocage de dernière instance pour le jour où un bug XSS apparaît ailleurs.

**Fix**
Lot J planifié. Pas à faire maintenant.

---

# Annexe — Fixes finaux (Lot J + bugs low #5, #7, #8, #9, #10)

## Fix #5 — Singleton IDB : un seul tiroir, toujours le même

**Analogie**
On range les chaussettes. Avant : on ouvre un nouveau tiroir à chaque fois → 50 tiroirs ouverts à la fin. Maintenant : on dit "ce tiroir, on le garde ouvert en permanence et on y revient". Une variable au sommet du fichier `dbPromise` qui retient la connexion et la réutilise.

**Code**
```ts
let dbPromise: Promise<IDBDatabase> | null = null;
function getDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(...);
  req.onsuccess = () => {
    req.result.onclose = () => { dbPromise = null; }; // si le browser ferme tout seul, on rouvre la prochaine fois
    resolve(req.result);
  };
  return dbPromise;
}
```

**Leçon** : la promesse mise en cache au niveau module = pattern singleton léger. Pas de classe, pas de service. Juste un `let` au bon endroit.

---

## Fix #7 — `pagehide` en plus de `beforeunload` : la sonnette qui marche sur tous les téléphones

**Analogie**
On veut savoir quand quelqu'un quitte la maison. Sur Windows, la sonnette `beforeunload` marche. Sur iPhone Safari, elle est cassée depuis 2022. Solution : on installe **deux sonnettes** différentes. Une au moins fonctionnera.

**Code**
```ts
window.addEventListener('beforeunload', onUnload);
window.addEventListener('pagehide',     onUnload);
```

**Leçon** : sur le web, la portabilité mobile ≠ desktop. Toujours ceinture+bretelles pour les événements de cycle de vie.

---

## Fix #8 — Fallback en mémoire : le carnet d'adresses qui a aussi une copie dans la tête

**Analogie**
Le carnet d'adresses (sessionStorage) refuse l'encre en mode privé. Solution : on retient aussi le nom dans la tête (variable module-level). Comme ça, même si le carnet refuse, on garde notre identité tant que la fenêtre est ouverte.

**Code**
```ts
let inMemoryIdentity: UserIdentity | null = null;

function loadOrCreateIdentity() {
  if (inMemoryIdentity) return inMemoryIdentity;   // d'abord la tête
  try { /* lire sessionStorage */ } catch {}       // sinon le carnet
  /* générer nouveau */
  try { sessionStorage.setItem(...); } catch {}    // essayer de l'écrire
  inMemoryIdentity = id;                            // toujours garder en tête
  return id;
}
```

**Leçon** : 3 niveaux de cache (mémoire → storage → générer). Toujours le moins fragile en premier.

---

## Fix #9 — Validation couleur peer : le videur à l'entrée de la pastille

**Analogie**
Un peer envoie sa couleur. Avant on faisait confiance. Maintenant, un videur à l'entrée vérifie : "ta couleur, c'est bien un hex 6 caractères ? Sinon je te file la couleur grise par défaut." Pareil pour le nom : "plus de 40 caractères ? Je coupe."

**Code**
```ts
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const safe = COLOR_RE.test(c) ? c : '#888888';

function safeName(n) {
  if (typeof n !== 'string') return 'Anon';
  return n.length > 40 ? n.slice(0, 40) + '…' : n;
}
```

**Leçon** : tout input externe a un type *attendu*. Si la donnée ne correspond pas, on fournit un fallback raisonnable. Jamais d'erreur visible, jamais de comportement bizarre.

---

## Fix #10 — TTL outbox : le frigo qui se vide tout seul après 4h

**Analogie**
Le frigo (outbox) avait pas de date d'expiration. Maintenant : à chaque ouverture, on jette ce qui est là depuis plus de 4h. Aligné sur la promesse "Collab disparaît en 4h".

**Code**
```ts
const TTL_MS = 4 * 60 * 60 * 1000;

export async function outboxPruneStale() {
  const items = await outboxGetAll();
  const now = Date.now();
  for (const item of items) {
    if (now - item.createdAt > TTL_MS) await outboxRemove(item.id);
  }
}

// Appelé au début de outboxFlush
export async function outboxFlush(socket) {
  await outboxPruneStale();   // jette d'abord les périmés
  /* puis flush le reste */
}
```

**Leçon** : la cohérence avec la promesse produit est aussi importante que la correction technique. Si on dit "éphémère", chaque coin de l'app doit l'être.

---

## Lot J — CSP : le portier qui interdit aux inconnus d'apporter à manger

**Analogie**
La maison (l'app) a un portier qui dit aux livreurs : "voici la liste des fournisseurs autorisés. Toute personne qui prétend livrer un script ou une image mais qui n'est pas sur la liste, tu refuses". Même si un cambrioleur arrive à se déguiser en livreur, le portier le bloque à la porte.

**Code**
[apps/frontend/svelte.config.js](../apps/frontend/svelte.config.js)
```ts
csp: {
  mode: 'auto',
  directives: {
    'default-src':  ["'self'"],                                                  // rien d'externe par défaut
    'script-src':   ["'self'"],                                                  // scripts uniquement de notre origine (+ hash auto SvelteKit)
    'style-src':    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // CSS Google Fonts autorisé
    'font-src':     ["'self'", 'https://fonts.gstatic.com'],                     // fichiers fonts
    'img-src':      ["'self'", 'data:', 'blob:'],                                // SVG inline + previews
    'connect-src':  ["'self'", 'wss:', 'ws:', 'https:'],                         // Socket.io
    'object-src':   ["'none'"],                                                  // pas de <object>, <embed>
    'base-uri':     ["'self'"],                                                  // pas de redirect via <base>
    'frame-ancestors': ["'none'"],                                               // anti-clickjacking (HTTP header en prod)
  },
},
```

**Concept**
*Content Security Policy*. Ce n'est pas une protection active : c'est une **liste blanche** envoyée au navigateur. Le navigateur refuse tout ce qui n'est pas dessus.

**Pourquoi c'est important**
Si demain un développeur introduit accidentellement une faille XSS (ex: oubli d'échapper un input), le navigateur refusera quand même d'exécuter le script injecté parce qu'il ne vient pas d'une source autorisée. La CSP est le **filet de dernière instance**.

**Note**
`frame-ancestors` (anti-clickjacking) doit être envoyé comme **header HTTP**, pas via meta tag (limitation du standard). Sera config côté Vercel/Nginx en prod.

**Leçon** : la sécurité moderne = couches. Échapper les inputs (Svelte le fait), valider (Fix #9), ET avoir une CSP au cas où une couche a un trou.

---

# Méta-leçons de la session

1. **Audit = re-lire, pas survoler.** J'ai signalé #6 comme bug, c'était faux. Toujours valider l'ordre des opérations en relisant.
2. **"Temporaire" est un mot dangereux** — le mock simulate connection (#1) est marqué TEMPORARY depuis 2 semaines. Si le commentaire dit TEMPORARY, tracer un TODO et un nom de personne, sinon il devient permanent.
3. **Defense in depth** — front + back valident chacun. Aucun ne fait confiance à l'autre.
4. **Race conditions sont les bugs préférés des débutants à louper** — TOCTOU est invisible en lecture séquentielle, faut visualiser le timing.
5. **Pèse toujours ce qui entre** — taille des payloads, validité des couleurs, format des URLs. Sans pesée, tout est attaque DoS possible.
