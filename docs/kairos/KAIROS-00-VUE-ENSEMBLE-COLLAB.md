# KAIROS — Collab de A à Z : comment tout se connecte

**But de ce fichier** : contrairement aux 4 autres fichiers Kairos (qui racontent des bugs précis), celui-ci raconte **l'app entière comme une histoire**, du premier clic jusqu'au déploiement en prod. Explication façon "à 5 ans", en crescendo — on commence très simple, chaque section s'appuie sur la précédente, et la complexité monte crans par crans jusqu'à couvrir toute l'architecture réelle.

Lire ce fichier EN ENTIER donne la carte complète. Les 4 autres fichiers Kairos sont des zooms sur des incidents précis rencontrés en cours de route — ce fichier est le terrain sur lequel ils se sont tous produits.

---

# Partie 1 — Le problème, avant tout code

Imagine que tu es en réunion avec 3 amis. Tu veux qu'on prenne des notes ensemble, en même temps, sans que personne n'ait besoin de créer un compte, d'installer un logiciel, ou de se souvenir d'un mot de passe. Et une fois la réunion finie, tu veux que **tout disparaisse** — pas de trace qui traîne.

C'est exactement ça, Collab. Une salle (une "room") qui existe pendant 4 heures maximum, à laquelle on accède avec juste un code à 6 caractères ou un QR code, où plusieurs personnes peuvent écrire dans le même bloc-notes en même temps, partager des fichiers, et poser des questions avec un système de vote.

Zéro compte. Zéro mot de passe. Zéro trace après 4h.

Pour construire ça, il faut résoudre plusieurs petits problèmes empilés les uns sur les autres. On va les prendre un par un, dans l'ordre où ils se posent naturellement.

---

# Partie 2 — Deux ordinateurs qui doivent se parler

## 2.1 — Le problème le plus simple possible : un fichier html tout seul

Avant même de parler de "serveur" ou de "backend", imagine juste une page web basique — un fichier HTML avec du texte dedans. Tu peux l'ouvrir dans ton navigateur. Ça marche. Mais si tu le modifies, seul TON navigateur voit le changement. Ton ami, sur son propre ordinateur, ne voit rien.

**Le problème fondamental de Collab** : comment faire pour que quand TOI tu tapes une lettre, ton AMI la voie apparaître sur son écran, presque instantanément, sur un autre appareil, potentiellement à l'autre bout du monde ?

Il faut un **intermédiaire** — une machine allumée en permanence, que les deux navigateurs peuvent contacter. C'est le **serveur** (le "backend"). Dans Collab, ce serveur est un programme Node.js (langage JavaScript qui tourne côté serveur, pas juste dans le navigateur) utilisant un framework appelé **Fastify**.

## 2.2 — Le navigateur ne peut pas juste "téléphoner" au serveur n'importe comment

Un navigateur et un serveur communiquent avec des règles précises. La plus basique s'appelle **HTTP** : le navigateur envoie une "requête" (une question), le serveur répond avec une "réponse". Comme envoyer une lettre et recevoir une réponse par courrier — un aller-retour complet, puis c'est fini, il faut renvoyer une nouvelle lettre pour la prochaine question.

C'est suffisant pour "crée-moi une room" (une question, une réponse, terminé). Mais pas pour "préviens-moi dès que quelqu'un d'autre tape une lettre" — ça, il faudrait renvoyer une lettre toutes les 10 millisecondes pour demander "il y a du nouveau ?", ce qui serait ridiculement lent et lourd.

**La solution** : une deuxième technologie, les **WebSockets**, via une librairie appelée **Socket.io**. Contrairement à HTTP (une question, une réponse, fini), un WebSocket ouvre une ligne téléphonique **qui reste ouverte** — les deux côtés peuvent parler à tout moment, sans redemander la communication à chaque fois.

Dans Collab, HTTP sert pour les actions ponctuelles (créer une room, uploader un fichier). Les WebSockets (Socket.io) servent pour tout ce qui doit être instantané et répété (chaque lettre tapée, chaque clic de vote).

---

# Partie 3 — Créer une room : le tout premier clic

## 3.1 — Ce qui se passe quand tu cliques "Créer une room"

Décomposons cet unique clic en étapes ultra-fines, car chacune compte :

**Étape 1** — Ton navigateur envoie une requête HTTP `POST /room/create` au serveur.
[apps/frontend/src/lib/api/room.ts](../../apps/frontend/src/lib/api/room.ts) — le code JS qui déclenche cet envoi, via une fonction native du navigateur appelée `fetch()`.

**Étape 2** — Le serveur reçoit cette requête, dans [apps/backend/src/routes/rooms.ts](../../apps/backend/src/routes/rooms.ts). Il génère un code à 6 caractères, aléatoire, en évitant les caractères ambigus (pas de `0`/`O`, pas de `1`/`I`) :
```ts
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
```
**Pourquoi c'est important** : si le code contenait un `0` et un `O`, quelqu'un qui recopie le code à la main (au lieu de scanner le QR) pourrait se tromper sans même s'en rendre compte.

**Étape 3** — Le serveur crée un objet "room" et le garde **en mémoire vive** (RAM), pas dans une vraie base de données :
```ts
const room: RoomConfig = {
  id, createdAt: Date.now(), expiresAt: Date.now() + ROOM_TTL_MS,   // TTL = 4h
  adminToken: randomBytes(24).toString('hex'),   // un secret pour reconnaître l'hôte plus tard
  participants: new Set(), questions: [], files: [], doc: new Y.Doc(),
};
rooms.set(id, room);   // stocké dans une Map JavaScript, en mémoire
```

**Pourquoi "en mémoire" et pas dans une vraie base de données ?**
Parce que la promesse de Collab est "tout disparaît après 4h". Une base de données classique est faite pour PERSISTER les données (les garder même si le serveur redémarre). Ici, on veut l'inverse : si le serveur redémarre, toutes les rooms actives disparaissent — et c'est voulu, ça colle exactement à la promesse produit. Une simple `Map` en RAM fait exactement ça, gratuitement, sans complexité supplémentaire.

**Étape 4** — Le serveur pose un **cookie** dans la réponse — une petite information stockée par le navigateur, qui prouve "c'est bien toi qui as créé cette room, tu es l'admin" :
```ts
reply.setCookie('collab_admin', `${id}:${adminToken}`, {
  httpOnly: true,       // invisible au JavaScript du navigateur (anti-vol)
  sameSite: 'none', secure: true,   // en prod — voir Partie 6
  maxAge: ROOM_TTL_MS / 1000,       // le cookie expire en même temps que la room
});
```

**Étape 5** — Le serveur répond `{ roomId: "ABCD12" }`. Le navigateur redirige vers `/room/ABCD12`.

Retiens ce mot : **`adminToken`**. C'est la clé secrète, connue seulement du créateur de la room (via son cookie), qui lui permet plus tard de fermer la room ou de supprimer une question. Personne d'autre ne l'a.

---

# Partie 4 — Rejoindre la room : la connexion qui reste ouverte

## 4.1 — Le navigateur ouvre la ligne téléphonique (Socket.io)

Une fois sur `/room/ABCD12`, la page appelle `initSocket()` :
[apps/frontend/src/lib/socket.ts](../../apps/frontend/src/lib/socket.ts)
```ts
const s = io(backendUrl, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  withCredentials: true,   // envoie le cookie collab_admin avec la connexion
});
```

**`withCredentials: true`** est crucial : ça dit au navigateur "envoie aussi les cookies avec cette connexion". Sans ça, le serveur ne saurait jamais que TOI, en particulier, es l'admin de la room.

## 4.2 — L'événement `join:room` : se présenter à la porte

Une fois la ligne ouverte, le client envoie un message spécial : `join:room` avec le code de la room. Côté serveur :
[apps/backend/src/sockets/handlers.ts](../../apps/backend/src/sockets/handlers.ts)
```ts
socket.on('join:room', ({ roomId }) => {
  // 1. Le code a-t-il la bonne forme (6 caractères de l'alphabet autorisé) ?
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(id)) { /* refus */ }
  // 2. La room existe-t-elle encore (pas expirée) ?
  const r = getRoom(id);
  if (!r) { /* refus : NOT_FOUND */ }
  // 3. Y a-t-il de la place (max 4 participants) ?
  if (r.participants.size >= MAX_PARTICIPANTS) { /* refus : room pleine */ }

  socket.join(id);              // le serveur "abonne" ce socket à un canal nommé "id"
  r.participants.add(socket.id);
  // ... puis le serveur répond room:joined avec plein d'infos
});
```

**`socket.join(id)`** est le cœur du système : Socket.io permet de grouper des connexions dans des "rooms" internes (rien à voir avec nos rooms Collab, coïncidence de vocabulaire). Une fois dans ce groupe, le serveur peut envoyer un message à **tout le monde dans ce groupe d'un coup** avec `io.to(id).emit(...)` — c'est comme ça que tes camarades de room reçoivent tes frappes de clavier en temps réel.

## 4.3 — Ce que le serveur répond immédiatement après le join

D'un coup, le serveur envoie plusieurs choses au nouvel arrivant :
```ts
socket.emit('room:joined', { participants: r.participants.size, isAdmin, expiresInSec });
socket.emit('qa:updated', publicQuestions(r));      // les questions déjà posées
socket.emit('files:updated', publicFiles(r));       // les fichiers déjà partagés
io.to(id).emit('participants:count', { count: ... }); // "il y a maintenant N personnes" à TOUT le monde
socket.emit('yjs:state', { doc: Y.encodeStateAsUpdate(r.doc) });  // le contenu actuel du bloc-notes
socket.to(id).emit('awareness:request-rebroadcast', { roomId });  // demande aux autres de re-signaler leurs curseurs
```

**Pourquoi tout ça d'un coup ?** Parce qu'un nouvel arrivant doit "rattraper" instantanément tout ce qui s'est passé avant lui — sinon il verrait une room vide alors que 3 personnes discutent déjà depuis 10 minutes.

---

# Partie 5 — Le bloc-notes qui s'écrit à plusieurs mains : le vrai tour de magie

## 5.1 — Pourquoi on ne peut pas juste "envoyer le texte entier à chaque frappe"

Imagine 3 personnes qui tapent en même temps dans le même document. Si chacun envoyait "voici le texte ENTIER" à chaque lettre tapée, celui qui arrive en dernier écraserait le travail des deux autres. C'est le problème classique de l'édition collaborative.

## 5.2 — La solution : Y.js et les CRDT

**CRDT** veut dire "Conflict-free Replicated Data Type" — un type de donnée conçu spécifiquement pour être modifié par plusieurs personnes en même temps, **sans jamais avoir besoin de demander "qui a raison ?"**.

**Analogie** : imagine que chaque lettre que tu tapes reçoit une étiquette invisible et unique — "cette lettre a été insérée par Renard#42, juste après la lettre étiquetée X". Quand deux personnes insèrent en même temps au même endroit, le système sait, grâce à ces étiquettes, comment les ranger dans un ordre cohérent, **sans jamais perdre de texte et sans jamais avoir besoin d'un arbitre central**. C'est mathématiquement garanti — c'est ce que veut dire "conflict-free".

Dans Collab, cette magie est fournie par une librairie appelée **Y.js**. On ne réinvente pas l'algorithme — on utilise Y.js comme "moteur de fusion", et notre travail est de faire circuler les petits paquets de changements (appelés "updates") entre les navigateurs, via le serveur.

## 5.3 — Le trajet complet d'une lettre tapée

Tu tapes la lettre "a". Voici EXACTEMENT ce qui se passe, dans l'ordre :

1. CodeMirror (l'éditeur de texte visuel) détecte la frappe.
2. `y-codemirror.next` (une extension qui relie CodeMirror à Y.js) transforme cette frappe en modification du document Y.js partagé (`Y.Text`).
3. Y.js génère un petit paquet binaire — un "update" — qui décrit précisément ce changement.
4. [apps/frontend/src/lib/yjs.ts](../../apps/frontend/src/lib/yjs.ts) écoute ces updates :
   ```ts
   doc.on('update', (update, origin) => {
     if (origin === 'remote') return;   // ignore les updates qui viennent d'ailleurs (évite une boucle infinie)
     socket.emit('yjs:sync', { roomId, update });   // envoie ce petit paquet au serveur
   });
   ```
5. Le serveur reçoit `yjs:sync`, vérifie que le paquet n'est pas trop gros (protection anti-abus, max 256 Ko), l'applique à SA propre copie du document, puis le retransmet à **tous les autres** participants de la room :
   ```ts
   Y.applyUpdate(r.doc, u8, 'remote');
   socket.to(roomId).emit('yjs:update', { roomId, update: u8 });   // à tout le monde SAUF l'expéditeur
   ```
6. Chez chaque autre participant, [yjs.ts](../../apps/frontend/src/lib/yjs.ts) reçoit `yjs:update` et applique ce paquet à SA propre copie locale du document :
   ```ts
   Y.applyUpdate(doc, u8, 'remote');
   ```
7. Y.js, en interne, fusionne intelligemment ce changement avec tout ce qui existait déjà — et CodeMirror redessine l'écran.

Tout ça se produit en quelques dizaines de millisecondes. C'est pour ça que ça "semble" instantané.

## 5.4 — Le piège du timing : envoyer avant que la porte soit ouverte

Il y a un ordre implicite dans tout ça : le serveur ne retransmet un `yjs:sync` que si l'expéditeur a bien fait `socket.join(id)` avant (`socket.rooms.has(roomId)`). Si le navigateur envoie un changement AVANT que le serveur ait fini de traiter `join:room`, ce changement est silencieusement perdu.

**Fix appliqué** ([yjs.ts](../../apps/frontend/src/lib/yjs.ts)) : bufferiser localement tout changement tapé avant la confirmation `room:joined`, et les envoyer d'un coup dès que la confirmation arrive :
```ts
let joined = false;
const pendingLocal: Uint8Array[] = [];
const onLocal = (update, origin) => {
  if (origin === 'remote') return;
  if (!joined) { pendingLocal.push(update); return; }   // attend son tour
  socket.emit('yjs:sync', { roomId, update });
};
socket.on('room:joined', () => {
  joined = true;
  for (const u of pendingLocal) socket.emit('yjs:sync', { roomId, update: u });
});
```

**Leçon générale** : dès qu'il y a un "avant" et un "après" dans une séquence réseau (ici : rejoindre PUIS écrire), il faut explicitement gérer le cas où quelque chose arrive trop tôt — sinon la donnée disparaît silencieusement, sans erreur visible.

## 5.5 — Savoir QUI a écrit QUOI : le système de sections

Y.js fusionne le texte, mais ne dit pas "cette phrase appartient à telle personne". Collab ajoute par-dessus un système "maison" : chaque fois qu'un participant commence à écrire dans une nouvelle zone, un marqueur invisible est inséré dans le texte :
[apps/frontend/src/lib/notes/sections.ts](../../apps/frontend/src/lib/notes/sections.ts)
```ts
export function makeMark(clientId: number): string {
  return `${MARK_OPEN}${clientId}${MARK_CLOSE}`;   // caractères invisibles (Unicode "Private Use Area")
}
```
Ce marqueur utilise des caractères Unicode spéciaux, impossibles à taper au clavier normalement — ça empêche quelqu'un de "usurper" une section en tapant le même symbole que le marqueur.

Une règle stricte (`ownershipFilter`) empêche ensuite chacun de modifier le texte d'un autre : si tu essaies de taper dans la section de quelqu'un d'autre, ton texte est automatiquement redirigé en fin de document, dans une nouvelle section à toi.

Chaque ligne de contenu reçoit visuellement un **liseré coloré** (la couleur assignée à cet auteur), qui reste affiché **même quand personne n'a le curseur dessus** — sinon l'attribution "qui a écrit quoi" disparaîtrait dès qu'on bouge la souris (voir KAIROS-temps-reel #5 pour le détail de ce bug et son fix).

## 5.6 — Les curseurs des autres : l'awareness

En plus du texte lui-même, Y.js a un système séparé appelé **awareness** ("conscience de présence") — il transmet des informations éphémères comme "où est mon curseur en ce moment", sans jamais les sauvegarder dans le document. Utile pour voir les curseurs colorés des autres bouger en direct, inutile de les garder après leur départ.

---

# Partie 6 — Deux domaines qui doivent se faire confiance

## 6.1 — Le problème : frontend et backend ne vivent pas au même endroit

Le frontend (l'interface visuelle, en SvelteKit) est hébergé sur **Vercel**. Le backend (le serveur Fastify + Socket.io) est hébergé sur un **VPS** (serveur privé), géré via **Coolify** (un outil qui simplifie le déploiement Docker) et exposé sur un nom de domaine séparé.

Deux domaines différents = ce qu'on appelle une situation **cross-origin** (ou cross-site). Par défaut, les navigateurs **interdisent** à une page web de communiquer librement avec un autre domaine — c'est une protection de sécurité fondamentale du web, appelée la **Same-Origin Policy**.

**Analogie** : imagine que chaque site web est une maison, et que par défaut, les habitants d'une maison n'ont pas le droit de répondre au téléphone si l'appelant dit venir "d'une autre maison". Il faut une liste explicite de numéros autorisés.

## 6.2 — CORS : la liste d'autorisation

**CORS** (Cross-Origin Resource Sharing) est le mécanisme qui permet au serveur de dire explicitement "j'autorise CE domaine précis à me parler" :
[apps/backend/src/lib/cors.ts](../../apps/backend/src/lib/cors.ts)
```ts
function corsOriginCheck(origin, cb) {
  if (origin === 'https://collab-one-lac.vercel.app') return cb(null, true);   // autorisé
  return cb(null, false);   // refusé
}
```
Sans cette liste, TOUTE requête depuis le frontend Vercel vers le backend serait bloquée par le navigateur, même si les deux serveurs fonctionnent parfaitement.

## 6.3 — Le cookie qui doit voyager entre deux domaines

Rappelle-toi le cookie `collab_admin` posé à la création de la room (Partie 3.1). Un cookie normal (`SameSite=Lax`, le comportement par défaut) **n'est jamais envoyé** entre deux domaines différents — exactement le cas ici (Vercel ≠ VPS).

**Fix** : en production, le cookie est posé avec `SameSite=None` (autorise l'envoi cross-site) — mais cette option EXIGE `Secure=true` (le cookie ne peut voyager QUE via HTTPS, jamais en HTTP normal) :
```ts
sameSite: isProd ? 'none' : 'lax',
secure: isProd,
```

**Leçon** : `SameSite=None` sans `Secure=true` est automatiquement rejeté par les navigateurs modernes. Les deux options vont toujours ensemble.

## 6.4 — La CSP côté app desktop (Tauri)

L'application desktop (bundlée via Tauri) a une couche de sécurité supplémentaire : la **Content Security Policy (CSP)**, une liste blanche de domaines avec lesquels l'app a le droit de communiquer :
[apps/desktop/src-tauri/tauri.conf.json](../../apps/desktop/src-tauri/tauri.conf.json)
```json
"csp": "connect-src 'self' https://collab-backend.duckdns.org wss://collab-backend.duckdns.org; ..."
```
Si le domaine du backend change (ce qui est arrivé plusieurs fois pendant cette session), cette liste doit être mise à jour manuellement — sinon l'app desktop refuse de contacter le nouveau serveur, même si tout le reste est correct.

---

# Partie 7 — L'app existe sur trois formes différentes

## 7.1 — Web, desktop, mobile : le même code, trois habillages

Collab n'est PAS trois applications séparées. C'est un seul code SvelteKit, qui s'adapte :

- **Web** : ouvert directement dans un navigateur (Chrome, Safari, Firefox), hébergé sur Vercel.
- **Desktop** : le même code, empaqueté dans une coquille Tauri (un framework qui transforme une app web en `.exe`/`.app` natif, bien plus léger qu'Electron).
- **Mobile** : pas d'app native — le même site web s'adapte visuellement à un petit écran via CSS (media queries), avec une navigation différente (tab bar en bas au lieu de sidebar).

**Comment le code sait dans quel contexte il tourne ?**
[apps/frontend/src/lib/tauri.ts](../../apps/frontend/src/lib/tauri.ts)
```ts
export function isTauri(): boolean {
  return !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}
```
Tauri injecte un objet spécial dans `window` que seule l'app desktop possède. C'est de la **feature detection** — on vérifie qu'une CAPACITÉ existe, pas qu'on reconnaît "tel navigateur" (plus robuste : ça continue de marcher même si Tauri change de nom interne entre versions).

## 7.2 — L'histoire (importante) : il y a eu un sidecar, puis plus de sidecar

À l'origine, l'app desktop embarquait son PROPRE petit serveur backend (un "sidecar" Node.js compilé), pour pouvoir fonctionner même sans connexion internet, en réseau local. Cette architecture a été **complètement abandonnée** en cours de route (voir KAIROS-migration-securite #1) — trop de faux positifs antivirus, trop de complexité pour un gain limité.

Aujourd'hui, l'app desktop est un simple **client HTTP/WebSocket** qui parle au même serveur cloud que la version web — exactement comme un navigateur, juste avec une fenêtre différente autour.

## 7.3 — Mobile : la même logique, une autre disposition visuelle

Sur un écran de moins de 767px de large, la sidebar desktop (320px fixes) est masquée et remplacée par [MobileNav.svelte](../../apps/frontend/src/lib/components/MobileNav.svelte) : une pilule flottante en bas de l'écran (effet "verre dépoli" via `backdrop-filter`), avec 3 onglets (Notes/Fichiers/Q&A) + un bouton "Plus" qui ouvre un tiroir (bottom sheet) pour le reste (thème, palette, fermer la room).

**Le code métier (Socket.io, Y.js, logique de room) est IDENTIQUE entre desktop et mobile** — seule la couche d'affichage change. C'est le principe même de SvelteKit : un seul arbre de composants, du CSS conditionnel pour l'adaptation visuelle.

---

# Partie 8 — Les fichiers : un problème différent du texte

## 8.1 — Pourquoi les fichiers ne passent PAS par Y.js/Socket.io

Le texte du bloc-notes est petit (quelques Ko) et change souvent — parfait pour des petits paquets Y.js envoyés en continu. Un fichier peut faire jusqu'à 500 Mo — complètement inadapté à ce système. Les fichiers utilisent donc un chemin totalement différent : une requête HTTP classique, avec un format spécial appelé **multipart** (permet d'envoyer un fichier binaire dans une requête HTTP).

## 8.2 — Le trajet d'un upload, du clic au fichier stocké

1. L'utilisateur glisse un fichier sur la zone de dépôt. Le navigateur construit une requête `POST /room/ABCD12/upload` avec le fichier en pièce jointe (`FormData`).
2. Le serveur ([apps/backend/src/routes/files.ts](../../apps/backend/src/routes/files.ts)) reçoit ce flux, et — étape cruciale — **NE charge jamais le fichier entier en mémoire**. Il le fait couler directement vers le disque (streaming), morceau par morceau :
   ```ts
   await pipeline(data.file, createWriteStream(diskPath));
   ```
   Voir KAIROS-migration-securite #4 pour comprendre pourquoi c'est vital (sinon, un fichier de 500 Mo dans un serveur limité à 512 Mo de RAM = crash garanti).
3. Une fois écrit, le serveur enregistre les métadonnées (nom, taille, date d'expiration = 24h) et prévient TOUS les participants via Socket.io :
   ```ts
   getIO().to(id).emit('files:updated', publicFiles(r));
   ```
4. Chaque navigateur connecté reçoit cet événement et met à jour sa liste de fichiers affichée — sans avoir eu besoin de redemander quoi que ce soit.

## 8.3 — Uploader un dossier entier : un problème inattendu

Glisser un DOSSIER (pas juste des fichiers) pose un problème que le navigateur ne gère pas nativement de façon utilisable — voir KAIROS-mobile-ux #6 pour le détail. La solution retenue : compresser le dossier en une seule archive `.zip` **côté client**, avant l'envoi, avec la librairie `fflate` — en mode "store" (juste empaqueter, sans vraie compression), pour ne pas geler le navigateur sur un gros dossier.

## 8.4 — Pourquoi zipper un dossier a aussi résolu un bug de rate-limit

Le serveur limite les uploads à 10 par minute par IP (protection anti-abus). Un dossier de 15 fichiers, envoyés individuellement et en parallèle, dépassait cette limite — 5 fichiers étaient rejetés en cascade. En les regroupant en UN SEUL fichier zip, un dossier entier ne compte plus que pour UN upload. Deux problèmes réglés par une seule décision architecturale (voir KAIROS-mobile-ux #7).

---

# Partie 9 — La sécurité, en couches (defense in depth)

Aucune protection n'est jamais suffisante seule. Collab empile plusieurs couches, chacune couvrant un angle différent :

1. **Couche réseau (CORS)** — seul le domaine officiel du frontend peut parler au backend.
2. **Couche authentification légère (cookie admin)** — pas de mot de passe, mais un token secret prouve "tu as créé cette room".
3. **Couche rate-limiting** — personne ne peut spammer `/room/create` ou `/upload` au-delà d'un seuil raisonnable.
4. **Couche quotas** — taille max par fichier (500 Mo), taille cumulée max par room (1 Go), nombre max de fichiers (20), nombre max de participants (4).
5. **Couche validation d'entrée** — le code de room doit matcher exactement le format attendu avant d'être utilisé n'importe où (évite des recherches IndexedDB avec des identifiants n'importe quoi).
6. **Couche streaming/anti-DoS mémoire** — jamais de fichier entier chargé en RAM, jamais de document Y.js qui grossit sans limite (`MAX_NOTES_CHARS`).
7. **Couche TTL (expiration automatique)** — même si tout le reste échouait, au pire, tout disparaît après 4h (rooms) ou 24h (fichiers). Un "janitor" (concierge) vérifie ça toutes les minutes :
   ```ts
   export function startJanitor(): void {
     setInterval(() => {
       for (const [id, r] of rooms) if (r.expiresAt < now) destroyRoom(id);
     }, 60_000);
   }
   ```

**Le principe clé** : chaque couche suppose que TOUTES les autres pourraient échouer. Aucune ne fait confiance aux autres. C'est ça, "defense in depth" — une expression qu'on retrouve déjà dans le tout premier fichier Kairos (session du 13 juin), et qui reste vraie un mois plus tard, à une toute autre échelle.

---

# Partie 10 — La fin de vie d'une room

## 10.1 — Trois façons pour une room de "mourir"

1. **Expiration naturelle** — 4h passées, le janitor la détruit à la prochaine vérification (au pire, 1 minute de retard).
2. **Fermeture manuelle par l'admin** — clic sur "Clore la room", vérifié via le cookie admin, qui prévient tout le monde puis détruit tout :
   ```ts
   getIO().to(id).emit('room:closed', { roomId: id });
   destroyRoom(id);
   ```
3. **Redémarrage du serveur** — comme tout est en RAM (Partie 3.1), un redémarrage du serveur (déploiement d'une mise à jour, par exemple) efface TOUTES les rooms actives d'un coup. C'est un choix assumé, cohérent avec la promesse "éphémère" — pas un oubli.

## 10.2 — Ce qui est nettoyé à la destruction

```ts
export function destroyRoom(id: string): void {
  const r = rooms.get(id);
  r.doc.destroy();                                    // libère la mémoire Y.js
  for (const f of r.files) unlinkSync(join(UPLOAD_DIR, f.key));   // supprime les fichiers du disque
  rooms.delete(id);                                    // retire l'entrée de la Map
}
```
Rien ne reste — ni en RAM, ni sur le disque.

## 10.3 — Côté client : la promesse "éphémère" doit aussi s'appliquer localement

Le bloc-notes utilise `IndexedDB` (une petite base de données DANS le navigateur) pour une copie locale, utile en cas de coupure réseau temporaire. Mais si on ne fait rien, cette copie locale survivrait indéfiniment, MÊME après la fermeture de la room côté serveur — brisant la promesse "tout disparaît". Fix : purger cette copie locale dès que `room:closed` (ou `room:error` NOT_FOUND) est reçu :
```ts
if (purgeLocalData && typeof indexedDB !== 'undefined') {
  indexedDB.deleteDatabase(`collab-room-${roomId}`);
}
```

---

# Partie 11 — Comment le code arrive en production

## 11.1 — Deux destinations, deux méthodes de déploiement

**Le frontend (Vercel)** — chaque `git push` sur la branche `main` déclenche automatiquement un nouveau build et déploiement. Vercel sert des fichiers statiques (le résultat du build SvelteKit), avec une règle de réécriture cruciale :
```json
"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
```
**Pourquoi c'est nécessaire** : l'app est une "Single Page Application" — un seul vrai fichier HTML existe (`index.html`), et c'est le JavaScript, une fois chargé, qui décide d'afficher `/room/ABCD12` ou `/about` sans jamais redemander une nouvelle page au serveur. Mais si quelqu'un ouvre `/room/ABCD12` DIRECTEMENT (lien partagé, ou recharge la page), le serveur Vercel doit quand même répondre — et il n'a physiquement aucun fichier nommé `room`. Cette règle dit "peu importe l'URL demandée, sers `index.html`, et laisse le JavaScript s'occuper du reste une fois chargé." (Voir KAIROS-debug-production #1 pour l'histoire complète du bug qui a résulté d'une mauvaise configuration ici.)

**Le backend (VPS via Coolify)** — le code tourne dans un conteneur Docker, construit à partir d'un `Dockerfile`, déployé manuellement (bouton "Deploy" dans Coolify) ou automatiquement via un webhook GitHub. Coolify gère aussi le certificat SSL (HTTPS) et le nom de domaine.

## 11.2 — Pourquoi deux systèmes de déploiement séparés, pas un seul ?

Vercel est excellent pour héberger des sites statiques/frontend (rapide, gratuit à cette échelle, CDN mondial) mais n'est pas fait pour faire tourner un serveur Socket.io qui doit rester connecté en continu (Vercel exécute du code par courtes "invocations", pas des process qui vivent en permanence). Un VPS classique, lui, garde le process Node.js allumé 24/7, ce qui est exactement ce dont Socket.io a besoin.

## 11.3 — Le fil qui relie les deux : les variables d'environnement

Le frontend doit savoir OÙ est le backend. Ça passe par une variable posée au moment du build :
```
VITE_API_URL=https://collab-backend.duckdns.org
```
Cette variable est "gelée" dans le code JavaScript généré au build — changer le domaine du backend exige un NOUVEAU build+déploiement du frontend, pas juste une modification de config à chaud.

**Piège rencontré** : cette même variable (`VITE_API_URL`, qui pointe vers l'API) a été accidentellement utilisée comme base pour générer les LIENS DE PARTAGE (QR codes) — un lien de partage doit pointer vers le SITE (pour qu'un humain l'ouvre dans un navigateur), jamais vers l'API (qui répond en JSON brut, illisible pour un humain). Voir KAIROS-debug-production #4.

---

# Partie 12 — Vue d'ensemble finale : tout le trajet, en une fois

Récapitulons le voyage complet d'une session Collab typique, du tout premier clic à la fin :

1. **Toi** : tu ouvres `collab-one-lac.vercel.app`, tu cliques "Créer une room".
2. **HTTP** : ton navigateur envoie `POST /room/create` au backend (sur son propre domaine, via CORS autorisé).
3. **Backend** : génère un code, crée un objet room en RAM, pose un cookie admin, répond.
4. **Toi** : redirigé vers `/room/ABCD12`, ton navigateur ouvre une connexion Socket.io.
5. **Socket.io** : `join:room` envoyé, le serveur t'ajoute au groupe interne "ABCD12", te renvoie l'état actuel (vide, tu es le premier).
6. **Ton ami** : scanne ton QR code (qui pointe vers le FRONTEND, pas l'API), arrive sur `/room/ABCD12`, fait le même trajet (étapes 4-5).
7. **Vous deux tapez en même temps** : chaque frappe devient un petit paquet Y.js, transite par le serveur (qui le retransmet à tout le monde sauf l'expéditeur), fusionné localement chez chacun sans jamais perdre de texte.
8. **Un de vous partage un fichier** : uploadé en streaming vers le disque du serveur (jamais en RAM), tous les participants reçoivent la notification en temps réel.
9. **4 heures passent** (ou l'admin clique "Fermer") : le serveur prévient tout le monde, détruit la room, supprime les fichiers du disque, et chaque navigateur purge sa copie locale IndexedDB.
10. **Rien ne reste.** Exactement la promesse du tout premier clic.

Chaque brique de cette histoire — Socket.io, Y.js, CORS, cookies cross-site, streaming de fichiers, TTL — existe pour résoudre UN problème précis rencontré en construisant cette promesse simple : "une salle éphémère, sans compte, qui disparaît vraiment."

---

# Comment lire les 4 autres fichiers Kairos à partir d'ici

Maintenant que tu as la carte complète, les 4 autres fichiers prennent tout leur sens :

- **KAIROS-migration-securite.md** — zoom sur tout ce qui a changé dans la Partie 6 et 9 (CORS, cookies, quotas, streaming) au moment où l'app est passée du "sidecar local" (Partie 7.2) au "vrai serveur cloud".
- **KAIROS-mobile-ux.md** — zoom sur la Partie 7.3 (adaptation mobile) et 8.3 (upload de dossiers), avec le détail des bugs CSS et curseur rencontrés en chemin.
- **KAIROS-temps-reel.md** — zoom sur la Partie 5 (Y.js/Socket.io) et 10 (fin de vie), avec les bugs de reconnexion, de countdown, et d'attribution de texte.
- **KAIROS-debug-production.md** — zoom sur la Partie 11 (déploiement), avec la méthodologie utilisée pour diagnostiquer des bugs qui n'existaient QU'en production réelle.
