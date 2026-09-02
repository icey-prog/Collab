# KAIROS — UI Mobile + Pièges CSS Récurrents

**Projet** : Collab MVP (SvelteKit)
**Thème** : navigation mobile (tab bar glass), thème système, un bug d'ordre CSS qui a mordu deux fois

9 concepts en analogies Feynman. Matériel d'apprentissage Kairos.

---

## #1 — Sidebar desktop sur mobile : 320px fixes dans un écran de 375px

**Analogie**
Tu déménages tous tes meubles de salon (conçus pour 40m²) dans un studio de 12m². Le canapé à lui seul prend toute la pièce — plus de place pour vivre dedans.

**Contexte**
La Sidebar desktop (rail 64px + panel 256px = 320px fixes) restait affichée telle quelle sur mobile. Sur un écran de 375px de large, il ne restait que **55px** pour tout le contenu (bloc-notes, fichiers, Q&A) — mesuré directement via `getBoundingClientRect()`, pas une estimation.

**Concept**
*Responsive design absent* — un layout desktop-first qui ne s'adapte jamais, contrairement à mobile-first où on part du petit écran et on enrichit vers le grand.

**Fix**
Sidebar cachée sous 767px (`display: none`), remplacée par un nouveau composant `MobileNav.svelte` — tab bar en bas + bottom sheet pour le secondaire, pattern standard iOS HIG / Material Design pour 3-5 destinations.

**Leçon**
Ne jamais assumer qu'un composant desktop "se débrouillera" sur mobile — toujours mesurer l'espace réel disponible avant de juger un layout responsive.

---

## #2 — Le bug d'ordre CSS qui a mordu DEUX FOIS dans la même session

**Analogie**
Tu donnes deux instructions contradictoires à la même personne : "porte le rouge" (dit à 9h) puis "porte le bleu" (dit à 14h). Peu importe combien tu insistes sur le rouge à 9h — la dernière instruction (14h) gagne, à volume de voix égal.

**Code (1er cas — MobileNav)**
```css
/* Placé EN HAUT du fichier */
@media (max-width: 767px) {
  .tab-row { display: none; }
  .statusbar { display: none; }
}
/* ... 150 lignes plus bas, PAS dans un media query ... */
.statusbar { display: flex; height: 28px; ... }   /* ← gagne, même en mobile ! */
```
`.statusbar` réapparaissait sur mobile malgré la règle `display: none`, parce que la règle non-conditionnelle était placée **plus bas** dans le fichier — à spécificité CSS égale (même sélecteur, une classe), c'est l'ordre dans le fichier qui décide, pas le media query.

**Concept**
*Cascade CSS — l'ordre source départage les égalités de spécificité*. Un `@media` ne donne AUCUN bonus de spécificité — ce n'est qu'une condition d'activation. Si deux règles de même spécificité s'appliquent, la dernière dans le fichier gagne, qu'elle soit dans un media query ou non.

**Fix**
Déplacer tous les overrides mobile en toute fin du bloc `<style>`, après toutes les règles de base.

**2e occurrence — footer landing**
Le même bug est réapparu plus tard : `.foot { position: absolute; bottom: 28px }` devenait `.foot { position: static; margin-top: 40px }` en media query — mais une transformation de layout parent (flex-row → flex-column) faisait apparaître le footer comme item flex **à côté** du contenu principal au lieu d'en dessous, malgré la règle correcte.

**Leçon**
Quand un override media-query "ne prend pas" alors que le code semble juste, vérifier DEUX choses dans l'ordre : (1) la position dans le fichier source, (2) si un parent a changé de mode de layout (flex-direction) qui invaliderait l'hypothèse de positionnement du reste.

---

## #3 — Glass effect qui ne floute rien : la vitre sans rien derrière

**Analogie**
Tu poses une vitre dépolie devant... un mur vide. Aucun flou visible, parce qu'il n'y a rien à flouter derrière. La vitre ne devient "magique" que quand quelque chose bouge derrière elle.

**Contexte**
Première tentative de tab bar "glass" : `backdrop-filter: blur(20px)` posé sur un élément **en flux normal** (pas de contenu qui défile en dessous, car rien ne chevauche). Effet invisible.

**Fix**
`position: fixed` pour que la pilule flotte réellement AU-DESSUS du contenu qui scrolle — avec `.module { padding-bottom: ... }` pour réserver l'espace (éviter que le contenu soit caché derrière, même bug de fond que #2).

**Concept**
*Backdrop-filter a besoin d'un contexte d'empilement avec du contenu réel derrière*. Sans overlap réel entre l'élément et du contenu scrollable, le flou n'a mathématiquement rien à flouter.

**Leçon**
Un effet visuel "glass"/"frosted" n'est pas juste une propriété CSS — c'est une relation géométrique entre deux couches (le verre au-dessus, le contenu en dessous qui bouge).

---

## #4 — `.cm-cursor` n'existait pas : chercher un élément DOM qui n'a jamais été créé

**Analogie**
Tu cherches à peindre une porte qui n'existe pas encore — le mur est juste plein, personne n'a jamais découpé l'ouverture. Peu importe combien de couches de peinture (CSS) tu ajoutes, rien n'apparaît, car il n'y a pas de porte à peindre.

**Contexte**
Le curseur local dans l'éditeur de notes utilisait une règle CSS `.cm-cursor { border-left-color: var(--cm-cursor-color) }` — jamais visible. Diagnostic : `document.querySelector('.cm-cursor')` retournait `null`. CodeMirror 6 ne crée cet élément QUE si l'extension `drawSelection()` est explicitement ajoutée — sans elle, le navigateur affiche son caret natif (non stylable).

**Fix**
```ts
import { drawSelection } from '@codemirror/view';
extensions: [ /* ... */, drawSelection() ]
```

**Concept**
*CSS mort par absence de cible, pas par erreur de syntaxe*. La règle CSS était correcte, le sélecteur était juste — le problème était en amont, dans la configuration JS qui ne créait jamais l'élément ciblé.

**Leçon**
Avant de déboguer une règle CSS "qui ne marche pas", vérifier d'abord que l'élément ciblé **existe dans le DOM au moment attendu** (`querySelector` dans la console). Un sélecteur juste sur un élément absent ne produit aucune erreur, juste... rien.

---

## #5 — Icônes de fichiers façon VS Code sans dépendance

**Analogie**
Plutôt que d'acheter une encyclopédie illustrée entière (une lib d'icônes) pour afficher 8 symboles différents, tu dessines toi-même un petit tableau de correspondance couleur ↔ catégorie. Léger, suffisant, zéro poids ajouté au bundle.

**Concept**
VS Code utilise un système d'*icon themes* — mapping extension → icône SVG, avec priorité : nom exact > extension composée (`.spec.ts` avant `.ts`) > extension simple > défaut.

**Notre version allégée**
[apps/frontend/src/lib/utils/fileIcon.ts](../../apps/frontend/src/lib/utils/fileIcon.ts) — un objet `CATEGORY_EXTENSIONS` (code/image/pdf/doc/sheet/archive/audio/vidéo) + un objet `CATEGORY_STYLES` (couleurs), sans SVG par extension : juste un badge coloré + le texte de l'extension réelle (plus précis qu'une icône générique).

**Leçon**
Pas besoin de répliquer l'intégralité d'un système externe — identifier le **signal utile** (couleur par catégorie) et l'implémenter en 50 lignes plutôt qu'importer une dépendance de plusieurs Mo.

---

## #6 — Drag & drop d'un dossier : le faux fichier de 0 octet

**Analogie**
Tu glisses une boîte fermée (un dossier) vers quelqu'un. Le système de réception, habitué à recevoir des objets individuels, étiquette la boîte "objet, poids : 0g" sans l'ouvrir — puis, quand on essaie de peser son "contenu", ça échoue car il n'y a "rien" (au sens de l'étiquette).

**Code (le bug)**
```ts
function onDrop(e) {
  uploadBatch(Array.from(e.dataTransfer.files));   // traite un dossier comme un File normal
}
```
`dataTransfer.files` transforme un dossier déposé en un pseudo-`File` de taille 0 — tenter de l'uploader échoue quand le navigateur essaie de lire son "contenu" (qui n'existe pas sous cette forme).

**Fix**
API `FileSystemEntry` (webkitGetAsEntry + FileSystemDirectoryReader) pour lire l'arborescence réelle :
```ts
async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) return new Promise(res => entry.file(f => res([f])));
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const all = [];
    for (;;) {
      const batch = await new Promise(res => reader.readEntries(res));
      if (batch.length === 0) break;    // readEntries() ne renvoie pas tout en un appel
      all.push(...batch);
    }
    return (await Promise.all(all.map(readEntry))).flat();
  }
  return [];
}
```

**Concept**
*API historique du navigateur pour deux cas d'usage différents* — `dataTransfer.files` est pensé pour des fichiers individuels, `FileSystemEntry` pour de vraies arborescences (dossiers). Ce n'est pas un bug du navigateur, c'est deux APIs pour deux besoins.

**Leçon**
Quand une action utilisateur "ressemble" à une autre (glisser un fichier vs un dossier) mais échoue mystérieusement, vérifier si le navigateur expose une API DÉDIÉE pour le cas spécifique plutôt que de forcer l'API générique.

---

## #7 — Rate-limit + upload de dossier : quand zipper règle deux bugs d'un coup

**Analogie**
Une porte tourniquet qui n'accepte que 10 personnes par minute. Un groupe de 30 collègues (un dossier de 30 fichiers) essaie de passer un par un, simultanément — 20 se font recaler, dispersés, aucun ne sait où sont passés les autres. Solution : les faire monter dans **un seul bus** (un zip) qui passe la porte une fois.

**Contexte**
Un dossier de N fichiers partait en N requêtes HTTP **parallèles** (`upload()` appelé sans `await` dans une boucle) — au-delà de 10 fichiers, le rate-limit serveur (10 uploads/min) rejetait le reste en cascade de 429.

**Fix**
Compression côté client en une seule archive `.zip` avant l'envoi — `fflate` en mode "store" (sans compression réelle, juste concaténation + CRC32), car la plupart des contenus (images, vidéos) sont déjà compressés : deflater en JS gèlerait l'onglet pour un gain quasi nul.
```ts
const zipEntry = new ZipPassThrough(path);   // "store", pas "deflate"
zip.add(zipEntry);
```

**Concept**
*Résoudre la cause plutôt que le symptôme*. On aurait pu augmenter le rate-limit — mais le vrai problème (fichiers dissociés de leur dossier d'origine, N requêtes au lieu d'une) restait entier. Zipper adresse les deux à la fois.

**Leçon**
Quand un correctif technique (relever une limite) ne répond qu'à moitié au problème utilisateur (structure du dossier perdue), chercher une solution qui couvre le besoin réel, pas juste le symptôme mesurable.

---

## #8 — Thème système : le mauvais endroit pour écrire dans le storage

**Analogie**
Un thermostat "automatique" qui, dès qu'il détecte la température extérieure une fois, grave cette valeur en dur — et ignore ensuite tout changement de météo, même si tu n'as jamais touché à un bouton toi-même.

**Code (le piège)**
```ts
mode.subscribe((m) => {
  localStorage.setItem(KEY_MODE, m);   // écrit MÊME la valeur auto-détectée initiale
});
```
Ce `subscribe` s'exécute immédiatement à la création du store, donc la première valeur détectée via `prefers-color-scheme` était écrite en storage comme si c'était un choix explicite — rendant impossible de distinguer "l'utilisateur a choisi" de "le système a été détecté une fois".

**Fix**
Deux clés séparées : une pour la valeur courante (cache d'affichage), une pour "l'utilisateur a-t-il cliqué le bouton lui-même" :
```ts
const KEY_EXPLICIT = 'collab-theme-explicit';   // posé SEULEMENT au clic
export const toggleMode = () => {
  localStorage.setItem(KEY_EXPLICIT, '1');
  mode.update(m => m === 'dark' ? 'light' : 'dark');
};
// écoute les changements système EN DIRECT tant que explicite non posé
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (localStorage.getItem(KEY_EXPLICIT) === '1') return;
  mode.set(e.matches ? 'dark' : 'light');
});
```

**Concept**
*Distinguer une valeur dérivée d'une valeur choisie*. Deux données qui se ressemblent (toutes deux "light"/"dark") mais ont des origines et des durées de vie différentes doivent vivre dans des variables séparées — sinon on perd l'information de provenance.

**Leçon**
Avant d'écrire une valeur en storage persistant, se demander : "si je relis cette valeur demain, saurai-je encore POURQUOI elle est là ?"

---

## #9 — Bouton mal placé = bouton invisible, même s'il "marche"

**Analogie**
Une sonnette qui fonctionne parfaitement, mais installée au sous-sol d'un immeuble de 10 étages. Techniquement opérationnelle. Personne ne la trouve jamais.

**Contexte**
Le bouton thème clair/sombre était le 8e élément d'une pile verticale de 9 icônes identiques (même taille, même style, pas de label) dans la sidebar — noyé, sans distinction visuelle.

**Fix**
Repositionné en 2e position (juste après le logo, avant même le bouton collapse), avec un fond `chartreuse` distinctif — sort visuellement du lot d'icônes grises.

**Concept**
*Un composant fonctionnel n'est pas un composant utilisable*. La correction logique (le toggle marchait) ne suffisait pas — le placement et le contraste visuel font partie de la fonctionnalité, pas d'un "à côté" cosmétique.

**Leçon**
"Ça marche" et "l'utilisateur peut le trouver" sont deux critères d'acceptation différents. Toujours valider les deux séparément.

---

# Méta-leçons de cette phase

1. **CSS : à spécificité égale, l'ordre source décide** — placer tous les overrides mobile en fin de fichier, systématiquement, pour éviter de re-tomber dans ce piège.
2. **Un effet visuel composé (glass, ombre portée dynamique) a des prérequis géométriques** — vérifier qu'il y a bien "quelque chose derrière" avant de le styliser.
3. **`querySelector` qui retourne `null` est le premier réflexe de debug CSS** — un sélecteur juste sur un élément absent ne produit aucune erreur visible.
4. **Deux APIs du navigateur pour un même geste utilisateur (drag simple vs drag de dossier)** — chercher l'API dédiée avant de forcer la générique.
5. **Storage persistant : séparer la valeur courante de sa provenance** (auto-détecté vs choisi).
