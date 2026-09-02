# KAIROS — Temps Réel : Socket.io, Y.js, CodeMirror

**Projet** : Collab MVP
**Thème** : reconnexions, synchronisation d'état, attribution collaborative

7 concepts en analogies Feynman. Matériel d'apprentissage Kairos.

---

## #1 — Le serveur oublie qui était dans quelle room après une déconnexion

**Analogie**
Un badge d'accès à un immeuble. Tu badges pour entrer au 3e étage. Une coupure de courant coupe l'ascenseur. Quand le courant revient, le système de sécurité a **oublié** que tu étais censé être au 3e — il faut re-badger depuis le hall, sinon tu restes coincé sans accès à rien, même si ta connexion réseau est revenue.

**Contexte**
Après une reconnexion réseau (Wi-Fi qui coupe, PC qui sort de veille), Socket.io rétablit la connexion mais le serveur a perdu `socket.rooms` — sans re-émettre `join:room`, tous les événements suivants (`yjs:sync`, `qa:add`) étaient silencieusement ignorés côté serveur (`if (!socket.rooms.has(roomId)) return;`), sans aucune erreur visible côté client.

**Fix**
[apps/frontend/src/routes/room/[id]/+page.svelte](../../apps/frontend/src/routes/room/[id]/+page.svelte)
```ts
const join = () => s.emit('join:room', { roomId });
join();                        // premier join
s.io.on('reconnect', join);    // ré-émission après CHAQUE reconnexion
```

**Concept**
*L'état côté serveur ne survit pas à une reconnexion par défaut* — Socket.io recrée une nouvelle session logique, même si le client "sent" que c'est une continuité.

**Leçon**
Toute logique qui dépend d'un "état d'appartenance" côté serveur (avoir rejoint une room, une conversation, un canal) doit être **re-déclarée explicitement** après chaque reconnexion — jamais supposée persistante.

---

## #2 — Countdown qui gèle pendant la veille du PC : compter localement sans jamais vérifier

**Analogie**
Un sablier que tu retournes en partant en vacances, en te disant "je compterai le temps écoulé en comptant les grains tombés". Sauf que pendant que tu dors (le PC en veille), le sablier s'arrête aussi de couler — à ton réveil, il affiche un temps totalement faux, parce qu'il n'a jamais eu de vraie horloge, juste un compteur local.

**Code (le bug)**
```ts
countdownTimer = setInterval(() => {
  expiresInSec.update(s => Math.max(0, s - 1));   // décompte purement local
}, 1000);
```
Deux symptômes du même défaut : (1) un joiner tardif repartait toujours du défaut 4h, peu importe l'âge réel de la room ; (2) `setInterval` suspendu par le navigateur pendant la veille système ne "rattrape" jamais le temps manqué au réveil.

**Fix**
Le serveur envoie la valeur réelle (calculée depuis `r.expiresAt`, sa propre horloge) à **chaque** `room:joined` — y compris après reconnexion :
```ts
// serveur
const expiresInSec = Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000));
socket.emit('room:joined', { ..., expiresInSec });

// client — resync à CHAQUE room:joined, pas juste au premier mount
s.on('room:joined', ({ expiresInSec: exp }) => {
  if (typeof exp === 'number') expiresInSec.set(exp);
});
```

**Concept**
*Source de vérité unique*. Le serveur, avec son horloge continue (`r.expiresAt` posé une fois à la création), est la seule source fiable. Le client ne doit jamais compter "à l'aveugle" sans se resynchroniser périodiquement à cette source.

**Leçon**
Un compteur local (`setInterval -1/s`) n'est acceptable que comme **affichage entre deux resynchronisations** — jamais comme source de vérité. Toute logique de "temps restant" côté client doit prévoir un mécanisme de rattrapage après une coupure (reconnexion, réveil de veille, changement d'onglet).

---

## #3 — Race entre le flush de la queue offline et le join de la room

**Analogie**
Tu essaies de donner une commande à un serveur de restaurant qui est encore en train de s'installer à sa station — il ne t'entend pas encore, ta commande tombe dans le vide, mais personne ne te dit qu'elle a été perdue.

**Code (le bug)**
```ts
window.addEventListener('online', () => {
  outboxFlush(getSocket());   // tente d'envoyer AVANT que le join:room ait été retraité
});
```

**Fix**
Le flush se fait dans le handler `room:joined` lui-même, jamais sur l'event `online` :
```ts
s.on('room:joined', () => {
  outboxFlush(s).then(count => {
    if (count > 0) pushToast(`${count} action(s) synchronisée(s)`, 'success');
  });
});
```

**Concept**
*Ordonnancement d'événements asynchrones*. `online` (réseau revenu) et `room:joined` (confirmation serveur qu'on est bien dans la room) ne sont PAS garantis dans un ordre précis — le seul événement fiable pour "je peux parler au serveur de cette room" est `room:joined` lui-même.

**Leçon**
Ne jamais synchroniser une action réseau sur un événement "générique" (réseau revenu) quand un événement plus **spécifique** (confirmation applicative) existe — le générique arrive souvent trop tôt.

---

## #4 — `.cm-cursor` inexistant : l'extension manquante qui rend une règle CSS morte

**Analogie**
Voir le concept jumeau côté CSS dans KAIROS-mobile-ux #4 — même bug, deux angles. Ici : côté CodeMirror, l'extension `drawSelection()` n'était jamais ajoutée aux `extensions[]` de l'éditeur.

**Code**
[apps/frontend/src/lib/components/NotesModule.svelte](../../apps/frontend/src/lib/components/NotesModule.svelte)
```ts
import { drawSelection } from '@codemirror/view';
extensions: [
  highlightActiveLine(), history(), /* ... */,
  drawSelection(),   // manquant → curseur natif du navigateur, non stylable
]
```

**Concept**
*Deux systèmes de curseurs coexistent dans CodeMirror + y-codemirror.next* : `.cm-cursor` (curseur LOCAL, nécessite `drawSelection()`) et `.cm-ySelectionCaret` (curseurs DISTANTS, toujours actifs via `yCollab`). Les deux étaient traités comme équivalents dans le code initial, alors que leurs conditions d'existence sont différentes.

**Leçon**
Dans une librairie avec plusieurs extensions optionnelles, ne jamais assumer qu'une fonctionnalité "de base" (afficher un curseur) est automatiquement active — vérifier explicitement quelle extension la fournit.

---

## #5 — Attribution de texte qui dépend d'un curseur en direct : une information éphémère

**Analogie**
Une étiquette "propriétaire" qui n'apparaît sur un objet QUE quand son propriétaire a la main dessus. Dès qu'il lâche l'objet ou quitte la pièce, l'étiquette disparaît — même si l'objet est toujours "le sien". Tu ne peux jamais savoir à qui appartient quoi que ce soit qui n'est pas activement tenu par quelqu'un.

**Contexte**
Le système d'attribution de sections dans le bloc-notes (`sections.ts`) ne décorait QUE la ligne marqueur invisible (`⟨clientID⟩`) — jamais le contenu réel. La seule façon de savoir "qui a écrit ce paragraphe" était de voir le curseur de son auteur positionné dessus **en cet instant précis**.

**Fix**
[apps/frontend/src/lib/notes/sections.ts](../../apps/frontend/src/lib/notes/sections.ts) — décorer aussi toutes les lignes de `[contentFrom, contentTo)`, pas juste le marqueur :
```ts
for (const s of sections) {
  b.add(s.markFrom, s.markFrom, Decoration.line({ /* marqueur, inchangé */ }));
  // NOUVEAU : chaque ligne de contenu récupère un liseré coloré persistant
  let lineNo = doc.lineAt(s.contentFrom).number;
  while (lineNo <= doc.lines && doc.line(lineNo).from < s.contentTo) {
    b.add(doc.line(lineNo).from, doc.line(lineNo).from, Decoration.line({
      attributes: { class: 'cm-owned-line', style: `--author-color: ${info.color}` },
    }));
    lineNo++;
  }
}
```

**Concept**
*Information persistante vs information transitoire*. Un curseur (position en direct) est intrinsèquement éphémère — il ne devrait jamais être le SEUL vecteur d'une information qu'on veut voir durer (qui a écrit quoi).

**Détail d'implémentation important**
L'atténuation visuelle des lignes "des autres" devait toucher UNIQUEMENT `border-left-color` (via `color-mix()`), jamais `opacity` sur toute la ligne — `opacity` aurait aussi assombri le texte lui-même, nuisant à la lisibilité du contenu des autres participants.
```css
.cm-owned-other { border-left-color: color-mix(in srgb, var(--author-color) 55%, transparent); }
```

**Leçon**
Avant d'atténuer visuellement un élément "secondaire", vérifier précisément QUELLE propriété CSS porte l'atténuation voulue — `opacity` est un marteau qui touche tout l'élément, souvent trop large.

---

## #6 — XHR plutôt que fetch pour la progression d'upload

**Analogie**
Deux façons d'envoyer un colis : la poste classique (fetch) qui ne te donne AUCUNE nouvelle tant que le colis n'est pas livré ou perdu — et un service de coursier (XHR) qui t'envoie un texto à chaque étape ("colis récupéré", "50% du trajet", "arrivé").

**Contexte**
`fetch()` n'expose aucun événement de progression d'upload de façon fiable inter-navigateurs. Pour un fichier de plusieurs centaines de Mo, l'UI restait bloquée sur "Envoi en cours…" statique pendant potentiellement plusieurs minutes — impossible de distinguer "ça avance" de "c'est figé".

**Fix**
```ts
const xhr = new XMLHttpRequest();
xhr.upload.onprogress = (e) => {
  if (!e.lengthComputable) return;
  updatePending(pendingId, { progress: Math.round((e.loaded / e.total) * 100) });
};
```

**Concept**
*API plus ancienne, capacité plus riche*. `XMLHttpRequest` est antérieur à `fetch`, mais reste le seul moyen standard et universellement supporté d'observer la progression d'un envoi (pas juste d'une réception).

**Leçon**
"Plus récent" ne veut pas dire "strictement supérieur" — parfois l'ancienne API a une capacité que la nouvelle n'a jamais exposée, et reste le bon outil pour ce besoin précis.

---

## #7 — Deux cartes de progression pour une seule opération conceptuelle

**Analogie**
Un colis qui change d'étiquette de suivi au milieu du trajet — "Colis A en préparation" devient "Colis B en livraison" sans lien visible entre les deux, comme si c'étaient deux envois différents. Le destinataire perd le fil.

**Contexte**
Zipper un dossier (compression) puis l'uploader (réseau) sont deux opérations async distinctes. Naïvement, chacune aurait pu créer sa propre entrée "pending" dans la liste — donnant l'impression que deux choses différentes se passent, l'une après l'autre, plutôt qu'une seule action continue.

**Fix**
Une seule entrée, un seul `id`, qui change juste de `phase` :
```ts
interface PendingUpload { id: string; phase: 'zipping' | 'uploading'; progress: number; /* ... */ }
// création pendant la compression
pending = [...pending, { id, phase: 'zipping', progress: 0, ... }];
// bascule vers l'upload SANS créer de nouvelle entrée
updatePending(id, { phase: 'uploading', progress: 0 });
```

**Concept**
*Identité stable à travers les étapes d'un même flux*. L'utilisateur perçoit "j'envoie mon dossier" comme UNE action — l'UI doit refléter cette continuité perceptuelle, même si techniquement ce sont deux opérations séparées en coulisses.

**Leçon**
Quand une action utilisateur se décompose en plusieurs étapes techniques asynchrones, préserver un identifiant stable à travers toutes les étapes plutôt que de créer une nouvelle entité à chaque transition.

---

# Méta-leçons de cette phase

1. **L'état de "connexion à une room" ne survit jamais implicitement à une reconnexion Socket.io** — toujours re-déclarer.
2. **Un décompte local (`setInterval`) doit être un affichage entre deux resynchronisations serveur, jamais la source de vérité.**
3. **Pour synchroniser une action réseau, préférer l'événement le plus spécifique disponible** (`room:joined`) à l'événement générique (`online`).
4. **Vérifier qu'une extension/dépendance "de base" est bien activée** avant de déboguer le CSS/la logique qui en dépend.
5. **Une information qu'on veut voir persister ne doit jamais dépendre d'un état éphémère** (position de curseur, présence en ligne) comme unique vecteur.
6. **Choisir l'API en fonction du besoin réel**, pas de sa date de sortie — `fetch` récent n'a pas toutes les capacités de `XMLHttpRequest`.
