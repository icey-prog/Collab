# KAIROS — Migration Cloud-First + Sécurité Serveur

**Projet** : Collab MVP (SvelteKit + Fastify + Socket.io + Docker/Coolify)
**Période** : Juillet 2026 — bascule de l'architecture Tauri-sidecar vers cloud-first
**Thème** : suppression d'un sidecar Node.js embarqué, durcissement serveur, streaming disque

12 concepts racontés en analogies Feynman. Matériel d'apprentissage Kairos.

---

## #1 — Le sidecar antivirus : pourquoi empaqueter Node.js dans une app desktop est un piège

**Analogie**
Tu envoies un colis par la poste. À l'intérieur, tu glisses un deuxième colis emballé façon "colis suspect classique" (même papier, même ficelle que 10 000 colis de malware historiques). Le centre de tri (l'antivirus) ne regarde jamais le contenu réel — il reconnaît juste l'emballage et bloque tout.

**Contexte**
L'app desktop Collab embarquait un sidecar : un binaire Node.js compilé via `pkg`, lancé au démarrage de l'app Tauri pour servir de backend local. Chaque antivirus (Windows Defender, Avast) classait ce type de binaire — un `.exe` qui décompresse et exécute du JS en mémoire — dans la même famille que les packers utilisés par les malwares.

**Concept**
*Faux positif par heuristique de forme*, pas de contenu. L'antivirus ne sait pas ce que fait le programme, il reconnaît un **pattern d'emballage** suspect (auto-extraction + exécution).

**Pourquoi c'était insoluble en restant sur l'architecture sidecar**
Impossible de "prouver" au niveau utilisateur qu'un `pkg`-binary est honnête — la seule vraie solution est de ne plus en produire.

**Fix**
Suppression complète du sidecar. L'app desktop devient un client HTTP pur qui parle à un vrai serveur cloud (VPS via Coolify), exactement comme la version web. Fichiers supprimés : `sidecar.rs`, `network.rs`, script `build-sidecar.mjs`, dépendances `local-ip-address`.

**Leçon**
Quand une techno déclenche des faux positifs *par construction* (pas par bug), il ne faut pas chercher un contournement — il faut changer d'architecture.

---

## #2 — CORS + cookie cross-site : le videur qui refuse tout le monde par défaut

**Analogie**
Un videur de boîte de nuit qui ne connaît qu'une liste d'invités **exacte**. `http://localhost:5173` est sur la liste. `https://mon-app.vercel.app` n'y est pas — le videur refuse, même si c'est légitimement toi, juste avec une autre adresse.

**Code**
[apps/backend/src/lib/cors.ts](../../apps/backend/src/lib/cors.ts)
```ts
function corsOriginCheck(origin, cb) {
  if (!origin) return cb(null, true);
  if (ENV_ORIGIN && origin === ENV_ORIGIN) return cb(null, true);
  if (LAN_RE.test(origin)) return cb(null, true);
  console.warn(`[cors] origine refusée: ${origin}`);   // ajouté après coup — voir #12
  return cb(null, false);
}
```

**Concept**
*Allowlist stricte*. Contrairement à une blocklist (on bloque les mauvais, tout le reste passe), une allowlist bloque tout par défaut et n'autorise que ce qui est explicitement listé. Plus sûr, mais plus fragile aux oublis.

**Pourquoi le cookie a demandé un fix séparé**
Un cookie `SameSite=Lax` (le défaut) n'est **jamais envoyé** en cross-site (frontend Vercel, backend VPS = deux domaines différents). L'hôte de la room perdait ses droits admin sans que rien ne signale d'erreur — juste un `isAdmin` toujours `false`.

**Fix cookie**
```ts
const isProd = process.env.NODE_ENV === 'production';
reply.setCookie('collab_admin', `${id}:${adminToken}`, {
  sameSite: isProd ? 'none' : 'lax',   // 'none' obligatoire en cross-site
  secure: isProd,                       // 'none' EXIGE secure (HTTPS)
});
```

**Leçon**
`SameSite=None` sans `Secure=true` est rejeté silencieusement par les navigateurs modernes — toujours poser les deux ensemble, jamais l'un sans l'autre.

---

## #3 — TOCTOU sur upload concurrent : deux clients qui lisent le même compteur avant qu'il ne bouge

**Analogie**
Un parking a 1 place libre. Deux voitures regardent le panneau "1 PLACE" **au même instant**, chacune se dit "je peux entrer", et les deux avancent. Le panneau n'a pas eu le temps de se mettre à jour entre les deux lectures.

**Code (le bug, avant fix)**
```ts
const active = publicFiles(r);
const roomBytes = active.reduce((s, f) => s + f.size, 0);   // ← lecture
// ... await req.file() ...  ← upload long (500 Mo), le temps passe
if (roomBytes + buf.byteLength > MAX_ROOM_BYTES) return 429;
r.files.push(meta);   // ← écriture, bien après la lecture
```
Deux uploads simultanés lisent tous les deux `roomBytes` **avant** qu'aucun n'ait poussé son fichier — les deux passent le test, le quota est dépassé.

**Concept**
*TOCTOU* (Time-Of-Check to Time-Of-Use). Le danger grandit avec la durée entre le check et l'usage — un upload de 500 Mo qui prend plusieurs secondes ouvre une fenêtre de course énorme comparé à un upload de 1 Ko.

**Fix**
[apps/backend/src/routes/files.ts](../../apps/backend/src/routes/files.ts) — réservation synchrone AVANT tout `await` :
```ts
const declared = declaredBytes(req);           // Content-Length, dispo immédiatement
if (roomUsedBytes(r) + reservedFor(id) + declared > MAX_ROOM_BYTES) return 429;
reserve(id, declared);                          // synchrone — les concurrents la voient
try {
  // ... upload réel (async) ...
} finally {
  release(id, declared);                        // toujours libéré, même en erreur
}
```

**Leçon**
Un check-then-act n'est sûr que si le "act" (la réservation) est **synchrone et immédiat** après le check — pas après un `await`. Réserver avant, valider après sur la valeur réelle.

---

## #4 — L'upload qui charge tout en RAM : la valise qu'on avale entière avant de la ranger

**Analogie**
Tu déménages. Au lieu de porter les cartons un par un du camion à l'appartement, tu empiles **tout le camion** dans ton salon d'abord, puis tu ranges. Si le camion est plus gros que ton salon, ça ne rentre pas — tout s'effondre.

**Code (le bug)**
```ts
const buf = await data.toBuffer();   // charge le fichier ENTIER en mémoire
await writeFile(join(UPLOAD_DIR, key), buf);
```
Avec des fichiers jusqu'à 500 Mo et un conteneur Docker limité à 512 Mo de RAM, le premier gros upload provoque un OOM (Out Of Memory) — le process crashe.

**Fix**
[apps/backend/src/routes/files.ts](../../apps/backend/src/routes/files.ts)
```ts
import { pipeline } from 'node:stream/promises';
await pipeline(data.file, createWriteStream(diskPath));   // flux, jamais tout en mémoire
```

**Concept**
*Streaming vs buffering*. Un flux (`stream`) traite les données par petits morceaux qui passent et repartent — la mémoire utilisée reste constante quelle que soit la taille du fichier. Un buffer garde tout en mémoire jusqu'à la fin.

**Leçon**
Dès qu'une taille de fichier n'est pas bornée à quelques Ko, il faut streamer. Le buffering en mémoire est une bombe à retardement qui n'explose qu'en prod, avec des fichiers réels.

---

## #5 — Anti-zip-bomb : pourquoi ne JAMAIS décompresser suffit

**Analogie**
Un videur de boîte qui refuse d'ouvrir les sacs. Un sac vide qui prétend contenir "4,5 pétaoctets une fois déplié" (une vraie zip bomb, ex. 42.zip : 42 Ko → 4,5 Po) ne pose aucun problème **tant que personne ne l'ouvre**. Le videur pèse le sac fermé, point.

**Concept**
Une zip bomb n'est dangereuse qu'au moment de la **décompression**. Notre serveur stocke et reressert les fichiers octet pour octet — il ne décompresse jamais rien côté serveur.

**Pourquoi c'est suffisant**
La seule chose qui compte pour la protection, ce sont les **octets réellement transmis** sur le réseau — plafonnés par la limite multipart (`MAX_FILE_BYTES`) qui coupe le flux net, et par le quota room cumulé.

**Code**
```ts
app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
// ...
if (data.file.truncated) {           // flag posé par la limite multipart
  await unlink(diskPath).catch(() => {});
  return reply.code(413).send({ error: 'TOO_LARGE' });
}
```

**Leçon**
La meilleure défense contre une classe entière d'attaques (zip bombs) est parfois de **ne jamais faire l'opération dangereuse** (décompresser), plutôt que d'essayer de la faire "en sécurité".

---

## #6 — Rate-limit derrière un proxy : compter les mauvaises personnes

**Analogie**
Un videur qui compte les entrées par... la porte, pas par la personne. Si 50 personnes rentrent par la même porte tournante (le reverse-proxy), il croit que c'est **une seule personne** qui rentre 50 fois, et lui interdit l'entrée après 10 passages — alors que ce sont 50 personnes différentes.

**Contexte**
Le backend est derrière le reverse-proxy Traefik de Coolify. Sans configuration, `request.ip` (utilisé par `@fastify/rate-limit`) renvoie l'IP interne du proxy pour **toutes** les requêtes — tous les utilisateurs partagent le même compteur.

**Concept**
*Trust proxy*. Le vrai client IP arrive dans l'en-tête `X-Forwarded-For`, mais Fastify ne le lit pas par défaut (mesure de sécurité : sans configuration explicite, n'importe qui pourrait mentir sur son IP en falsifiant cet en-tête).

**Fix**
```ts
const app = Fastify({ trustProxy: true, ... });
```

**Leçon**
Derrière un reverse-proxy, TOUJOURS activer `trustProxy` — sinon toute logique basée sur l'IP (rate-limit, geo, logs) est cassée silencieusement, sans erreur visible.

---

## #7 — ADMIN_SECRET fail-open : la porte qui reste ouverte si tu oublies la clé

**Analogie**
Un coffre-fort dont la règle est "si personne n'a configuré de code, laisse-le ouvert". Pratique pour tester chez soi. Catastrophique si on oublie de configurer le code avant de l'installer dans une banque.

**Code**
```ts
function requireAdminSecret(req, reply, done) {
  if (!ADMIN_SECRET) return done();   // pas de secret configuré → accès libre
  const auth = req.headers.authorization ?? '';
  if (auth === `Bearer ${ADMIN_SECRET}`) return done();
  reply.code(401).send({ error: 'UNAUTHORIZED' });
}
```

**Concept**
*Fail-open vs fail-closed*. Le code est correct pour le développement local (pas de secret = pas de friction), mais devient une faille béante en prod si le déploiement oublie de configurer `ADMIN_SECRET` — les routes `/admin/rooms` (tous les codes de room actifs !) restent publiques.

**Le vrai bug n'était pas dans le code**
Le code était juste. Le bug était dans la **documentation de déploiement** (`docker-compose.yml`, `DEPLOY.md`) qui ne mentionnait jamais `ADMIN_SECRET` — un opérateur suivant la procédure à la lettre déployait avec les routes admin grandes ouvertes.

**Leçon**
Un `if (!secret) return allow()` n'est un bug de sécurité **que combiné avec** une checklist de déploiement incomplète. Auditer le code seul ne suffit pas — il faut auditer le chemin complet jusqu'à la prod.

---

## #8 — Comparaison de secret non constant-time

**Analogie**
Deviner un digicode en testant chiffre par chiffre, en écoutant si le bip "erreur" arrive plus vite ou plus lentement selon combien de chiffres étaient corrects. Un attaquant patient peut reconstruire le code entier sans jamais le voir.

**Code (fragile)**
```ts
if (auth === `Bearer ${ADMIN_SECRET}`) return done();
```
`===` sur des chaînes s'arrête au **premier caractère différent** — le temps de réponse varie microscopiquement selon combien de caractères correspondent avant l'échec.

**Concept**
*Timing attack* — CWE-208. Dans la pratique, mitigé ici par le rate-limit (60 req/min rend l'attaque statistiquement trop lente pour être exploitable), mais reste une mauvaise pratique.

**Fix recommandé**
```ts
import { timingSafeEqual } from 'node:crypto';
// comparer des buffers de longueur égale, temps constant quel que soit le contenu
```

**Leçon**
Pour toute comparaison de secret (token, mot de passe hashé, signature), utiliser une fonction "constant-time" dédiée — jamais `===`/`==` natif.

---

## #9 — Le port occupé par un projet inconnu : investiguer avant de tuer

**Analogie**
Tu veux garer ta voiture sur TA place de parking. Il y a déjà une voiture. Avant de la faire enlever, tu vérifies la plaque — et si c'est la voiture du voisin garée par erreur, tu ne la fais pas exploser, tu trouves une autre place.

**Contexte**
En testant le backend local, le port 3001 était occupé par un process Node.js. `curl` dessus a révélé une **tout autre application** ("Veille Marchés Publics — LIVREASE SARL", un projet Next.js du user, sans rapport).

**Ce qu'on n'a PAS fait**
Tuer le process aveuglément pour libérer le port.

**Ce qu'on a fait**
Lancé le backend de test sur un port alternatif (3002) et redirigé les appels réseau du navigateur temporairement, sans toucher au process existant.

**Leçon**
Un port occupé n'est pas automatiquement "un zombie à tuer" — toujours identifier ce qui tourne avant d'agir. Une action destructive (kill process) doit être réversible et informée, jamais un réflexe.

---

## #10 — Rate-limit + Fastify plugin scope : l'ordre d'enregistrement compte

**Analogie**
Un vigile embauché **après** l'ouverture du magasin ne peut pas fouiller les clients déjà entrés — seulement ceux qui entrent après son arrivée. Si tu enregistres tes routes avant ton plugin de rate-limit, elles ne sont jamais "vues" par le videur.

**Code**
```ts
// ❌ AVANT (ne fonctionnait pas) :
registerRoomRoutes(app, getIO);          // routes déclarées
app.register(rateLimit, { max: 60 });    // rate-limit après → ignore les routes déjà là

// ✅ APRÈS :
app.register(rateLimit, { max: 60 });    // le videur d'abord
app.register(async (scope) => {          // les routes dans un plugin ENFANT
  registerRoomRoutes(scope, getIO);      // chargé après par avvio (boot Fastify)
});
```

**Concept**
*Plugin encapsulation & boot order*. Fastify utilise `avvio` pour charger les plugins dans un ordre précis — `config.rateLimit` par route n'est appliqué que si le plugin `rate-limit` est déjà actif au moment où la route est enregistrée.

**Leçon**
Avec un framework à plugins, l'ordre d'enregistrement n'est pas cosmétique — il détermine littéralement quelles fonctionnalités "voient" quelles routes.

---

## #11 — Content-Disposition non échappé : le nom de fichier qui casse le header HTTP

**Analogie**
Une étiquette bagage où le nom du passager contient des guillemets. Si le système d'impression ne les échappe pas, l'étiquette se coupe au milieu du nom — le reste du texte prévu déborde ailleurs.

**Code (fragile)**
```ts
reply.header('Content-Disposition', `attachment; filename="${meta.name}"`);
```
Un nom de fichier contenant un `"` casse le parsing du header côté navigateur.

**Fix**
```ts
const safeName = meta.name.replace(/["\\\r\n]/g, '_');
const encoded = encodeURIComponent(meta.name);
reply.header('Content-Disposition',
  `attachment; filename="${safeName}"; filename*=UTF-8''${encoded}`);
```
`filename` (ASCII, échappé) pour compat, `filename*` (RFC 5987, encodé UTF-8) pour les noms Unicode.

**Leçon**
Tout ce qui va dans un header HTTP et vient d'une entrée utilisateur doit être échappé pour LE FORMAT DU HEADER (pas pour HTML, pas pour SQL — chaque contexte a ses propres caractères dangereux).

---

## #12 — Logs manquants = bug invisible : ajouter le log qui aurait tout résolu

**Analogie**
Une caméra de sécurité braquée sur le mauvais mur. Le cambriolage a bien eu lieu, mais personne n'a de preuve de comment. On ne peut que deviner après coup.

**Contexte**
Un bug CORS (domaine Vercel qui avait changé) a pris plusieurs échanges à diagnostiquer, faute de logs côté serveur sur les origines refusées. Une fois le vrai problème trouvé, le fix le plus précieux n'était pas la correction elle-même, mais le log qui la rend visible la prochaine fois.

**Fix**
```ts
console.warn(`[cors] origine refusée: ${origin}`);   // dans cors.ts
console.log(`[socket] connect ${socket.id} origin=${socket.handshake.headers.origin}`);
console.warn(`[socket] join refusé (room introuvable) ${socket.id} → ${id}`);
```
Socket.io s'attache directement au serveur HTTP brut, **hors** du pipeline de logs Fastify (`logger: true` ne couvre que les requêtes HTTP classiques) — ce trafic était totalement muet avant.

**Leçon**
Un bug résolu une fois sans laisser de log derrière soi n'est résolu qu'à moitié — la prochaine occurrence (même cause différente : mauvais domaine, mauvaise config) demandera le même effort de diagnostic à l'aveugle.

---

# Méta-leçons de cette phase

1. **Un antivirus n'analyse pas le contenu, il reconnaît des formes** — packers/sidecars déclenchent des faux positifs par construction, pas de fix côté code possible.
2. **TOCTOU grandit avec la durée de la fenêtre** — un upload de 500 Mo qui prend des secondes est bien plus risqué qu'une opération de quelques ms.
3. **La sécurité "correcte dans le code" ne suffit pas** — un `ADMIN_SECRET` bien implémenté mais absent de la doc de déploiement est un trou de sécurité tout aussi réel.
4. **Streaming > buffering** dès qu'une taille n'est pas garantie petite.
5. **Ne jamais faire l'opération dangereuse** (décompresser une archive non fiable) est souvent plus sûr que d'essayer de la sécuriser.
6. **Un log ajouté après coup vaut plus que le fix lui-même** — il transforme le prochain bug similaire d'une enquête en un coup d'œil.
