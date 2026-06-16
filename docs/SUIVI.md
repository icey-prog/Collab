# SUIVI DE PROJET — Collab MVP

> Fichier maintenu à chaque fin de session. Ajoute une entrée datée à la fin.

---

## État global

| Module | Statut | % | Notes |
|---|---|---|---|
| Design system (collab.css) | ✅ Stable | 100 | 4 palettes A/B/C/D × clair/sombre, tokens, animations |
| Maquettes statiques | ✅ Stable | 100 | index.html · Landing.html · Room.html avec annotations |
| Frontend SvelteKit | ✅ Stable | 100 | Tous lots front livrés (A+B+F+C+J+D+I+E). Tous bugs fixés. Pages secondaires /legal /privacy /admin/stats. Manque G (Tauri wrap)/H (Lottie)/K (Playwright) — optionnels v2 |
| Backend Fastify | 🟡 MVP local | 70 | Single-file server.ts in-memory : create/preview/delete room, upload, Y.js relay + awareness, Q&A, admin/stats. Manque Redis/R2/JWT pour prod |
| Déploiement | 🔴 À démarrer | 0 | Vercel front + Cloudflare Tunnel back à configurer |
| Tests | 🔴 À démarrer | 0 | Aucun test écrit |

Légende : ✅ stable · 🟡 en cours · 🔴 à démarrer · ⏸️ en pause · ❌ bloqué

---

## Plan d'action FRONTEND (en cours — Phase 1)

> Validé le 2026-06-03. Backend hors scope de ce plan.

### Lot A — Fix bugs audit /find-bugs (front uniquement) — 30 min ✅
- [x] Bug #4 : `+error.svelte` → message générique pour 5xx
- [x] Bug #5 : `room/[id]/+page.svelte` → centraliser handler `room:closed`
- [x] Bug #6 : `package.json` → retirer `y-socket.io` (inutilisé)

### Lot B — Transport abstraction (LAN/Cloud switch) — 2h ✅
- [x] Nouveau `lib/transport.ts` — détection mode + URL backend dynamique
- [x] Nouveau `lib/stores/network.ts` — store `'cloud' | 'lan' | 'offline'`
- [x] Patch `lib/socket.ts` — support `VITE_API_URL` env + URL custom runtime
- [x] Nouveau `lib/components/NetworkBadge.svelte` — indicateur mode actif
- [x] Patch `Sidebar.svelte` — intégrer NetworkBadge

### Lot C — Offline persistence (Tier 3 PWA) — 3h ✅
- [x] `package.json` — `y-indexeddb` installé
- [x] `lib/yjs.ts` — IndexeddbPersistence câblée (Y.Doc persisté localement)
- [x] Nouveau `lib/offline/outbox.ts` — queue IDB pour qa:add offline (+ flush auto au retour réseau)
- [x] Patch `lib/stores/network.ts` — `registerOutboxFlush` callback
- [x] Patch `QAModule.svelte` — vérifie `isOnline`, queue si offline + toast info
- [x] Patch `FilesModule.svelte` — bloque upload offline + toast clair
- [x] Patch `room/[id]/+page.svelte` — enregistre flush au mount + flush session précédente
- [x] `src/service-worker.ts` — precache shell + network-first runtime (SvelteKit auto-détecte)
- Note : `lib/offline/persistence.ts` non nécessaire — déjà géré dans `yjs.ts` directement

### Lot D — UI Mode Host (Tauri-ready) — 2h
- [ ] Nouveau `routes/host/+page.svelte` — écran 2 boutons HÉBERGER / REJOINDRE
- [ ] Nouveau `lib/components/HostPanel.svelte` — affichage QR + URL + code
- [ ] Nouveau `lib/components/JoinPanel.svelte` — input code + scan QR
- [ ] `package.json` — ajouter `qrcode`
- [ ] Patch `routes/+page.svelte` — détecter Tauri → redirect `/host`

### Lot E — Pages manquantes — 1h
- [ ] `/legal` — mentions légales BF
- [ ] `/privacy` — politique privacy (courte, vraie)
- [ ] `/admin/stats` — dashboard consommant `GET /admin/stats`

### Lot F — PWA manifest + icons — 30 min
- [ ] `static/manifest.webmanifest`
- [ ] `static/icons/icon-{192,512}.png`
- [ ] Patch `app.html` — `<link rel="manifest">`
- → Active install PWA mobile (Android/iOS "Ajouter à l'écran d'accueil")

### Lot G — Tauri desktop installable — 3h core (6h avec auto-updater)
- [ ] G.1 — `npm create tauri-app` setup dans `apps/frontend/`
- [ ] G.2 — `src-tauri/tauri.conf.json` (fenêtre 900×600, titre, icône Collab)
- [ ] G.3 — `src-tauri/src/main.rs` — commandes Rust :
  - `start_backend()` → lance `docker compose -f docker-compose.lan.yml up -d`
  - `stop_backend()` → `docker compose down`
  - `get_local_ip()` → IP LAN pour QR
  - `check_docker_installed()` → détection prérequis
- [ ] G.4 — `lib/tauri.ts` — helper `isTauri()` + invoke wrappers
- [ ] G.5 — Patch `routes/+page.svelte` — si Tauri → redirect `/host`
- [ ] G.6 — Couvert par Lot D (`/host` page Héberger/Rejoindre)
- [ ] G.7 — Embed `docker-compose.lan.yml` dans `src-tauri/resources/`
- [ ] G.8 — Build pipeline GitHub Actions (Win/Mac/Linux) **(optionnel v1)**
- [ ] G.9 — Auto-updater Tauri OTA **(optionnel v1)**
- [ ] G.10 — Splash screen + icônes **(optionnel v1)**
- → Génère `Collab-Host.exe` / `.dmg` / `.AppImage` installables

### Cibles plateforme final

| Plateforme | Format | Rôle | Build |
|---|---|---|---|
| Windows / Mac / Linux | App Tauri installable | Host **ou** client (peut lancer Docker) | `npm run tauri build` |
| Android / iOS | PWA installable (Lot C + F) | Client uniquement | `npm run build` (static) |
| Browser (n'importe lequel) | Web SPA | Client | `npm run build` (servi par Vercel) |

Une seule codebase. Build différent selon cible.

### Ordre d'attaque
```
1. Lot A — fixes audit + visuels #7-#10  (libère propre)
2. Lot F — manifest PWA                  (rapide, bonus mobile install)
3. Lot B — transport abstraction         (prérequis C, D, G)
4. Lot C — offline persistence           (gros morceau, requis PWA)
5. Lot D — UI host (/host route)         (requis G)
6. Lot G — Tauri wrap desktop            (encapsule D)
7. Lot E — pages secondaires             (peut attendre backend)
```

**Budget tokens estimé** : ~200k pour finir tout le front MVP (desktop + PWA + web).

---

## Plan FRONT 100% (étendu — 11 lots) — 2026-06-10

> Intègre les skills : Elegance Formula (35 principes), Frontend Design (DFII ≥ 8),
> Touch Psychology, Frontend Security, Kaizen, Clean Code.

### Direction esthétique consolidée

| Critère | Valeur |
|---|---|
| **Nom de la stance** | *Bauhaus IDE × Calm Tech Editorial* (mélange 2 max — autorisé) |
| **DFII estimé** | Impact 5 + Fit 4 + Feasibility 5 + Performance 5 − Risk 2 = **17 → Excellent** (mais cappé à 15) |
| **Ancre différenciation** | Cream-strong cursor + chartreuse comme **seul** signal d'action + status bar IDE bottom |
| **Identité visible logo masqué** | Tab actif chartreuse 2px top + breadcrumb mono + sidebar paper unifié |
| **Anti-pattern évité** | Pas de Inter (utilise Space Grotesk + DM Mono), pas de purple gradient SaaS, pas de Tailwind default |

### Cibles plateforme final

| Plateforme | Format | Rôle | Build |
|---|---|---|---|
| Windows / Mac / Linux | App Tauri installable | Host **ou** client (peut lancer Docker) | `npm run tauri build` |
| Android / iOS | PWA installable (Lot C + F) | Client uniquement | `npm run build` (static) |
| Browser (n'importe lequel) | Web SPA | Client | `npm run build` (servi par Vercel) |

Une seule codebase. Build différent selon cible.

---

### Lots A–G (existants, rappel)

A · Fix bugs audit + visuels (30min)
F · PWA manifest (30min)
B · Transport abstraction (2h)
C · Offline persistence (3h)
D · UI Host /host (2h)
G · Tauri wrap (3h core)
E · Pages secondaires /legal /privacy /admin (1h)

### Lots H–K (nouveaux — pour atteindre 100%)

#### Lot H — Animation system + Lottie + GIF zones — 2h30

Philosophie motion (Elegance §21 Micro-Experience + Frontend Design §Motion) :
- Une seule entrée forte par page (pas de spam micro-motion)
- 200ms ease-in-out standard pour transitions UI
- Lottie max 30KB par fichier (budget perf 3G)
- Respecter `prefers-reduced-motion`

- [ ] `package.json` — ajouter `lottie-svelte ^0.6` (~12KB gzip)
- [ ] Nouveau `lib/components/Lottie.svelte` — wrapper avec `loop` `autoplay` `controls` props
- [ ] Nouveau `lib/components/Skeleton.svelte` — placeholder loading (Elegance §21)
- [ ] Nouveau `lib/components/MotionGuard.svelte` — wrapper qui désactive animations si `prefers-reduced-motion`
- [ ] Nouveau dossier `static/animations/` avec 9 fichiers Lottie .json à fournir/créer

**Zones d'animation par écran :**

| Page | Zone | Type | Fichier source |
|---|---|---|---|
| `/` Landing | Hero ambient (4-spoke radial subtle pulse) | Lottie loop | `static/animations/hero-pulse.json` |
| `/` Landing | CTA "Créer room" hover bounce | CSS transform | inline |
| `/` Landing | Room créée success (checkmark dessiné) | Lottie one-shot | `static/animations/success-check.json` |
| `/` Landing | Loading "Génération du code…" | Lottie loop | `static/animations/spinner-dots.json` |
| `/about` | Stats counters animés (count-up) | JS interval | inline |
| `/about` | Feature cards hover (subtle lift + scale 1.02) | CSS | inline |
| `/join/[id]` | QR code pulse rings (connecting) | Lottie loop | `static/animations/connecting-rings.json` |
| `/join/[id]` | Card slide-in initial | CSS keyframe | inline |
| `/room/[id]` | Sidebar collapse (déjà OK) | CSS transition | existant |
| `/room/[id]` | Tab switch slide horizontal (fade + 8px translateX) | CSS keyframe | inline |
| `/room/[id]` | Empty Q&A illustration (mascotte qui demande question) | Lottie loop | `static/animations/empty-qa.json` |
| `/room/[id]` | File upload progress ring | Lottie progress | `static/animations/upload-ring.json` |
| `/room/[id]` | Toast slide-in (déjà OK) | CSS | existant |
| `/room/[id]/expired` | Ghost fade-out subtil sur code room | Lottie one-shot | `static/animations/ghost-fade.json` |
| `+error.svelte` | Broken thread illustration | Lottie loop | `static/animations/error-thread.json` |
| `/host` Tauri | QR code reveal (scan ligne lumineuse) | Lottie one-shot | `static/animations/qr-reveal.json` |
| `/host` Tauri | Server status (pulse vert si UP) | Lottie loop | `static/animations/server-pulse.json` |

**Zones GIF possibles** (alternative Lottie si fichier source dispo) :
- Démo onboarding (`/about` ou modal first-visit) — GIF 800×450 max 500KB
- Présentation features Notes/Files/Q&A — 3 GIFs courts dans `/about`

Fichiers Lottie à créer/sourcer :
- Option 1 : commandes LottieFiles (paid)
- Option 2 : conversion AE → Bodymovin (manuel)
- Option 3 : Lottie generative via Rive (gratuit, plus simple)

#### Lot I — Touch Psychology + A11y (mobile-first) — 1h30

Applique `touch-psychology.md` + Elegance §16.

- [ ] Audit tous les boutons : `min-height: 44px` + `padding` pour hit area (visuel peut rester plus petit)
- [ ] Audit nav items sidebar : déjà 40px → passer à 44px en mode mobile (`@media (max-width:768px)`)
- [ ] Ajouter `:active` scale 0.97 sur tous les boutons (feedback tap < 50ms)
- [ ] Ajouter `aria-label` partout où icon-only (close, copy, delete, vote)
- [ ] Focus visible : `:focus-visible` outline 2px chartreuse offset 2px (a11y keyboard)
- [ ] Contrast ratio audit ≥ 4.5:1 sur tous les texts (utiliser `--navy-60` minimum sur paper)
- [ ] Test screen reader (NVDA) sur landing + room
- [ ] Skip link `<a href="#main">Aller au contenu</a>` (a11y)
- [ ] Réorganiser thumb zone mobile (CTA en bas, nav en haut)
- [ ] Vibration API (haptic) sur mobile : `navigator.vibrate(10)` pour confirmation tap CTA

#### Lot J — Frontend Security hardening — 1h30

Applique `SKILL_frontend_security.md`.

- [ ] CSP strict via `<meta http-equiv="Content-Security-Policy">` dans `app.html` :
      ```
      default-src 'self';
      img-src 'self' data: blob:;
      connect-src 'self' wss: ws:;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src https://fonts.gstatic.com;
      script-src 'self';
      frame-ancestors 'none';
      ```
- [ ] `package.json` — ajouter `dompurify ^3.2` (~16KB) pour sanitize les contenus Y.js si markdown render plus tard
- [ ] Audit `innerHTML` partout dans le code (grep) → remplacer par `textContent` ou DOMPurify
- [ ] Validation URL côté `getRoomPreview` + `joinCode` (déjà OK via regex `isValidRoomCode`)
- [ ] `rel="noopener noreferrer"` sur tous les `target="_blank"` (déjà partiel, audit complet)
- [ ] `<link rel="noopener" ...>` sur images uploadées (prévention tabnabbing)
- [ ] Subresource Integrity (SRI) sur Google Fonts CDN — calculer hash
- [ ] HSTS via Vercel config (header `Strict-Transport-Security`)
- [ ] Trusted Types policy (browsers récents) — opt-in graduel
- [ ] Désactiver clickjacking : `X-Frame-Options: DENY` via Vercel headers

#### Lot K — Tests E2E Playwright — 2h

Applique `kaizen` (test before next iteration) + `clean-code` (F.I.R.S.T.).

- [ ] `package.json` — `@playwright/test ^1.49`
- [ ] `playwright.config.ts` — multi-browser (Chromium, Firefox, WebKit), retries 2
- [ ] `tests/e2e/landing.spec.ts` — create room, join room invalide, palette switch
- [ ] `tests/e2e/room.spec.ts` — joindre, taper notes, switch module, dark mode toggle
- [ ] `tests/e2e/expired.spec.ts` — page expired CTA fonctionne
- [ ] `tests/e2e/about.spec.ts` — links + scroll smooth
- [ ] `tests/e2e/a11y.spec.ts` — `axe-playwright` audit chaque page (0 violations critiques)
- [ ] `tests/e2e/visual.spec.ts` — screenshot regression (avant/après refactor)
- [ ] CI GitHub Actions — run `playwright test` on PR

### Ordre d'attaque mis à jour (11 lots)

```
1. Lot A  — fixes audit + visuels                (30min · libère propre)
2. Lot F  — manifest PWA                         (30min · install mobile)
3. Lot B  — transport abstraction                (2h · prérequis C, D, G)
4. Lot J  — security hardening                   (1h30 · CSP avant prod)
5. Lot C  — offline persistence                  (3h · service worker)
6. Lot H  — animations Lottie + motion system    (2h30 · UX delight)
7. Lot I  — touch + a11y polish                  (1h30 · mobile-first)
8. Lot D  — UI host /host                        (2h · prérequis Tauri)
9. Lot G  — Tauri wrap desktop                   (3h · installeurs)
10. Lot E — pages secondaires                    (1h · peut attendre back)
11. Lot K — tests Playwright E2E                 (2h · validation finale)
```

**Total : ~20h dev · ~320k tokens** pour finir tout le front 100 % avant touche back.

### Budget perfo enforced (CI gate)

```
build/_app/immutable/entry/*.js     <  20 KB gzip
total transféré sur /              <  60 KB gzip
Lottie chaque fichier              <  30 KB
GIF chaque fichier                 <  500 KB
```

Si dépassé → build échoue.

### Checklist Elegance Formula par écran (avant handoff)

- [ ] **Visual** : 1 seul focal point / CTA principal par écran (§6)
- [ ] **Spacing** : aligné sur grille 8px (§4)
- [ ] **Cognition** : compréhensible en < 3s par un nouveau user (§8 Krug)
- [ ] **A11y** : targets ≥ 44×44, contraste ≥ 4.5:1 (§16)
- [ ] **Consistency** : composants héritent du design system (§19)
- [ ] **Delight** : feedback tap < 50ms + haptique sur action principale (§28)

### Prérequis utilisateur final

| Cible | Prérequis |
|---|---|
| Desktop Tauri host | Docker Desktop installé (lien fourni à l'install si absent) |
| Desktop Tauri client | Aucun, l'app fonctionne autonome |
| Mobile PWA | Aucun, juste un browser moderne |
| Browser web | Aucun |

---

---

## Roadmap

### Phase 1 — MVP demo (10 jours)
- [x] Design system 4 palettes
- [x] Maquettes annotées (Landing, Room, Hub)
- [x] Scaffold SvelteKit + routes
- [x] Composants : Sidebar, NotesModule, FilesModule, QAModule, ToastStack
- [x] Pages flow : `/`, `/join/[id]`, `/room/[id]`, `/room/[id]/expired`, `/about`, `+error`
- [x] Audit bugs/sécurité (find-bugs)
- [x] Git init + branches `main/front/back`
- [ ] Backend scaffold complet (server.ts + routes/* + plugins/*)
- [ ] Brancher socket frontend ↔ backend (test end-to-end)
- [ ] Y.js sync vérifié à 2+ clients
- [ ] Upload R2 fonctionnel
- [ ] Deploy serveur perso (Nginx + Docker)

### Phase 2 — Polish
- [ ] Admin dashboard `/admin/stats`
- [ ] Pages `/legal` + `/privacy` (mention FR)
- [ ] Onboarding tour modal
- [ ] Tests E2E (Playwright)
- [ ] Internationalisation FR/EN

---

## Bugs identifiés (audit /find-bugs)

| # | Sévérité | Fichier | Description | Statut |
|---|---|---|---|---|
| 1 | 🔴 HIGH | `apps/backend/src/plugins/yjs.ts:42` | `app.redis.subscribe` met la connexion en mode subscriber-only → casse toutes les commandes Redis | ⏳ À fixer (utiliser `app.redis.duplicate()`) |
| 2 | 🔴 HIGH | `apps/frontend/src/lib/yjs.ts` + `apps/backend/src/plugins/yjs.ts` | Taille Y.js update non capée → DoS possible | ⏳ À fixer (cap 64KB côté serveur) |
| 3 | 🟠 MED | `apps/frontend/src/lib/components/QAModule.svelte` | Vote idempotence client-only — refresh permet re-vote | ⏳ À fixer côté backend (SADD voters) |
| 4 | 🟠 MED | `apps/frontend/src/routes/+error.svelte:13` | Message erreur backend leak en cas de 5xx | ⏳ À fixer (message générique) |
| 5 | 🟡 LOW | `apps/frontend/src/routes/room/[id]/+page.svelte` | Race `room:closed` : DELETE + redirect inline + handler socket | ⏳ À fixer (centraliser sur event socket) |
| 6 | 🟡 LOW | `apps/frontend/package.json:24` | `y-socket.io` listé mais inutilisé | ⏳ À retirer |

## Bugs identifiés (test visuel `npm run dev` 2026-06-08)

| # | Sévérité | Fichier | Description | Statut |
|---|---|---|---|---|
| 7 | 🟠 MED | `apps/frontend/src/routes/+page.svelte` + variantes | Double brand "Collab" haut-gauche : `<a class="spec-home">` + `.brand` se superposent | ✅ Fixé — `spec-home` retiré du landing |
| 8 | 🔴 HIGH | `app.css` `.hl::before` + tous les hero | Highlight chartreuse invisible en palette B/C/D | ✅ Fixé — `.hl` utilise `background` direct (no z-index) dans `+page.svelte` + `+error.svelte` |
| 9 | 🟡 LOW | `static/favicon.svg` | 404 sur favicon, log console à chaque page | ✅ Fixé — `static/favicon.svg` créé + icône SVG PWA + manifest mis à jour |
| 10 | 🟡 LOW | SvelteKit v2.8 | Warning `<Layout/Page> was created with unknown prop 'params'` (vestige API v1) | ✅ Fixé — `+layout.svelte` déclare `export const data/params/form` pour absorber les props injectés par SvelteKit |
| 11 | 🟠 MED | `vite.config.ts` (fixé en cours) | Proxy `/room` capturait les routes SvelteKit `/room/[id]` → 500 | ✅ Fixé via préfixe `/api/` |
| 12 | 🟠 MED | `apps/frontend/package.json` | `yjs` + `y-protocols` listés mais pas installés dans node_modules au moment du test | ✅ Fixé via `npm install yjs y-protocols` |

---

## Décisions techniques importantes

| Date | Décision | Raison |
|---|---|---|
| 2026-06-01 | Stack SvelteKit + Fastify (vs Next + Express) | Bundle 60KB, perf mobile Burkina, simplicité |
| 2026-06-01 | Y.js + Socket.io custom protocol (vs y-socket.io client) | Dépendance en moins, contrôle total |
| 2026-06-02 | 4 palettes A/B/C/D dans le design system | Test live de DA sans dupliquer fichiers |
| 2026-06-02 | Pattern Claude (cream-strong cursor, no left-border nav) | Plus calme que chartreuse partout, hiérarchie meilleure |
| 2026-06-03 | Git : 3 branches `main/front/back` | Deploy séparé front statique vs back container |

---

## Journal de session

### Session 2026-06-16 — Backend Fastify MVP single-file (test rapide)
**Durée** ~20 min · **Tokens** ~30k
- `apps/backend/server.ts` single-file, in-memory (rooms Map, no Redis)
- Routes HTTP : POST /room/create (+ cookie httpOnly admin), GET /room/:id/preview, DELETE /room/:id, POST /room/:id/upload (multipart, max 10MB), GET /room/:id/file/:key, GET /admin/stats
- Socket.io : join:room avec détection admin via cookie, Y.js relay (state/sync/update + cap 256KB), awareness:update (cap 16KB), qa:add/vote/delete (idempotence vote via SHA256 socket.id), file:delete admin-only
- TTL rooms 4h + TTL fichiers 24h + janitor 60s
- CORS allow http://localhost:5173 + credentials
- Stockage fichiers : data/uploads/ local (purgé au destroyRoom)
- Smoke test OK : POST create → 6-char roomId + cookie collab_admin, GET preview retourne stats, GET admin/stats répond avec heapUsed mémoire
- Mock simulate connection toujours retiré côté front (commit antérieur)
- **Prochaine session** : test 2 onglets multi-user real, durcissement Redis/R2/JWT pour prod, deploy Vercel + Contabo

### Session 2026-06-13 (Lot E) — Pages /legal + /privacy + /admin/stats
**Durée** ~25 min · **Tokens** ~35k
- `/legal` — mentions légales BF (loi n°010-2004/AN), éditeur EXXOLAB, hébergement, IP, modération, juridiction
- `/privacy` — politique courte et vraie (TL;DR cards 4 colonnes, table TTL, never-list, RGPD+BF)
- `/admin/stats` — dashboard KPI 4 cards (rooms actives, participants, fichiers, Q&A) + santé système + refresh auto 10s + gestion 401/erreur
- Footer about enrichi : Accueil · Mentions légales · Confidentialité
- 0 erreurs TypeScript. Build prod OK.
- Front : 99% → **100%** pour les lots core (A+B+C+D+E+F+I+J)
- Lots restants tous optionnels v2 : G (Tauri wrap), H (Lottie), K (Playwright E2E)
- **Prochaine session** : backend Fastify OU passer en mode production deploy

### Session 2026-06-13 (Lots D + I) — Page /host Tauri + A11y mobile-first
**Durée** ~40 min · **Tokens** ~60k
- `lib/tauri.ts` — `isTauri()` + stubs invoke wrappers (start_backend, get_local_ip, etc.)
- `lib/components/HostPanel.svelte` — QR code SVG navy (qrcode npm), code room, URL, LAN tag
- `lib/components/JoinPanel.svelte` — input code centré, scan QR via BarcodeDetector API native
- `routes/host/+page.svelte` — onglets Héberger / Rejoindre, default à Rejoindre si non-Tauri
- `routes/+page.svelte` — auto-redirect vers /host si isTauri()
- Skip link a11y dans +layout.svelte (top: -100px → 12px au focus, WCAG 2.4.1)
- :focus-visible chartreuse outline global (visible uniquement clavier)
- prefers-reduced-motion respecté (animations 0.01ms)
- :active scale(0.97) global (Touch Psy §4 — feedback ≤ 50ms)
- navigator.vibrate haptic sur CTA create (10ms tap, 20-30-20 pattern success)
- @media max-width 768px: tous boutons/nav-items à min 44×44px (WCAG 2.5.5)
- id="main-content" sur tous les <main> pour la skip link
- 0 erreurs TypeScript, build prod OK
- Front : 97 → 99%. Reste Lots G/E/H/K.
- **Prochaine session** : backend Fastify OU Lot H Lottie OU finir Lot G Tauri

### Session 2026-06-13 (toolbar + copy) — Formatage NotesModule + copy Claude-style
**Durée** ~25 min · **Tokens** ~30k
- Wire toolbar bloc-notes : boutons B / I / Code / H / Liste / Citation câblés sur fonctions CodeMirror
- Raccourcis clavier : Ctrl+B (gras), Ctrl+I (italique), Ctrl+E (code inline)
- `wrapSelection(left, right)` : entoure la sélection avec markers markdown
- `toggleLinePrefix(prefix)` : toggle ajout/retrait de prefix ligne (titre, liste, citation)
- Bouton copy-all dans toolbar (copie tout le bloc-notes en presse-papier)
- Q&A : bouton copy par question, apparition au hover façon Claude Desktop (`opacity: 0` → `1` au `:hover`)
- Feedback visuel : check ✓ en chartreuse pendant 1.5s après copie
- 0 erreurs TypeScript
- **Prochaine session** : Lot I (a11y mobile-first) ou Lot H (Lottie animations)

### Session 2026-06-13 (Lot J + bugs low) — Sécurité + hardening final
**Durée** ~30 min · **Tokens** ~40k
- Fix #5 : singleton dbPromise + onclose reset → plus de leak connexions IDB
- Fix #7 : `pagehide` ajouté en + de `beforeunload` (Safari iOS lifecycle)
- Fix #8 : fallback identité en variable module-level (Safari mode privé)
- Fix #9 : validation regex couleur peer `^#[0-9A-Fa-f]{6}$` + cap nom 40 chars
- Fix #10 : TTL 4h outbox + `outboxPruneStale()` au flush (promesse éphémère respectée)
- Lot J : CSP via SvelteKit config (`csp.mode: 'auto'`) — hashes générés au build
  Directives : default-src/script-src 'self', style fonts.googleapis, img data/blob, connect wss/ws/https, object-src 'none', base-uri 'self'
  Note : frame-ancestors via HTTP header côté Vercel/Nginx (pas supporté meta tag)
- Build prod testé : CSP injectée correctement avec hash auto Svelte
- Audit `{@html}` / `innerHTML` : aucun usage → safe par défaut
- Audit `target="_blank"` : 1 occurrence (FilesModule) déjà avec `rel="noopener noreferrer"`
- Front : 94 → 96%. 0 erreurs TypeScript.
- **Prochaine session** : backend Fastify pour test multi-onglet réel OU Lot H/D/I

### Session 2026-06-13 (fin) — Audit /find-bugs + fixes #1-#4 + export Kairos
**Durée** ~40 min · **Tokens** ~60k
- Audit /find-bugs complet (11 findings catégorisés Critical → Info)
- Fix #1 : bloc `TEMPORARY: simulate connection` retiré de room/[id]/+page.svelte (admin client-side leak)
- Fix #2 : `isValidRoomCode(roomId)` validé à mount, redirect '/' si invalide (defense in depth)
- Fix #3 : verrou `let flushing = false` dans outboxFlush (race condition online + onMount)
- Fix #4 : cap taille update Y.js (256KB) + state (2MB) + awareness (16KB) — DoS protection
- Export Kairos `docs/kairos/KAIROS-SESSION-2026-06-13.md` (11 bugs analogies Feynman)
- Memory : préférence style pédagogique sauvegardée
- Bugs restants (low priority) : #5 leak IDB connexions, #7 mobile lifecycle pagehide, #8 fallback identité, #9 validation couleur peer, #10 TTL outbox, #11 CSP (Lot J planifié)
- 0 erreurs TypeScript
- **Prochaine session** : choisir Lot J (security CSP) / Lot D (page host Tauri) / Lot H (animations Lottie)

### Session 2026-06-13 (suite) — CodeMirror 6 + curseurs multi-user
**Durée** ~25 min · **Tokens** ~30k
- Switch NotesModule `<textarea>` → CodeMirror 6 (yCollab binding + y-codemirror.next)
- Awareness Y.js : identité user anonyme (animal + numéro), couleur unique, persistée en sessionStorage
- Transport awareness via socket : nouveaux events `awareness:update` (à implémenter backend)
- Cleanup awareness state au beforeunload / destroy
- Chips peers en train d'éditer affichés dans header bloc-notes
- Bugs #10 fixé (export const data/params/form dans +layout.svelte)
- Bugs #7/#8/#9 fixés + icônes PWA (favicon.svg + icons/icon.svg + manifest SVG maskable)
- 0 erreurs TypeScript, 4 warnings pré-existants Sidebar (cosmétique)
- **Prochaine session** : tester multi-onglet (nécessite backend) ou attaquer Lot J/D/H

### Session 2026-06-13 — Audit front + Lots A/B/F/C livrés
**Durée** ~30 min · **Tokens** ~40k
- Audit complet du code : Lots A ✅ + B ✅ + F partiel ✅ déjà livrés par l'utilisateur
- Lot C livré : `lib/offline/outbox.ts` (queue IDB qa:add), patches QAModule/FilesModule/room page, flush auto au retour réseau
- Note : `yjs.ts` avait déjà IndexeddbPersistence — rien à faire sur la partie Y.Doc
- Bugs #7/#8/#9/#10 toujours ouverts, icons PWA manquantes
- 0 erreurs TypeScript (4 warnings pré-existants Sidebar.svelte)
- **Prochaine session** : Lot F (icônes PWA) + bugs #7/#8 visuels, puis choix Lot J (sécurité) ou Lot D (host)

### Session 2026-06-10 — Plan front 100% étendu (11 lots) + zones animation
**Durée** ~30 min · **Tokens** ~50k
- Refonte Room IDE-like livrée (commit cd89763) — Sidebar unifiée, status bar bottom, surfaces différenciées, contraste placeholder fixé
- Lots H/I/J/K ajoutés pour atteindre 100% : animations Lottie + GIF zones (17 zones cartographiées par page), touch psychology + a11y, security hardening (CSP/DOMPurify/SRI), tests Playwright E2E
- Direction esthétique nommée : **Bauhaus IDE × Calm Tech Editorial** (DFII 15/15)
- Skills appliqués : Elegance Formula, Frontend Design, Touch Psy, Security, Kaizen, Clean Code
- Budget perfo enforced : Lottie 30KB max, GIF 500KB max, total transferred < 60KB sur /
- Ordre attaque mis à jour : A → F → B → J → C → H → I → D → G → E → K
- Budget total : ~20h dev · ~320k tokens
- **Prochaine session** : démarrer Lot A après validation

### Session 2026-06-08 (suite) — Cible plateformes finales + Lot G Tauri
**Durée** ~20 min · **Tokens** ~30k
- Décision : Desktop = Tauri installable (Win/Mac/Linux) — peut host ou client
- Décision : Mobile = PWA via Lot C + F — client uniquement (mobile peut pas Docker)
- Décision : Web browser = même build PWA, accessible directement
- **Lot G ajouté au plan** (10 sous-tâches, 3h core)
- Ordre attaque mis à jour : A → F → B → C → D → G → E
- Budget tokens révisé : 200k (au lieu de 150k)
- **Prochaine session** : démarrer Lot A après validation

### Session 2026-06-08 — Premier test visuel `npm run dev`
**Durée** ~30 min · **Tokens** ~40k
- Frontend tourne (Vite + SvelteKit + yjs)
- Test visuel des 6 pages : `/`, `/about`, `/join/[id]`, `/room/[id]`, `/room/[id]/expired`, `+error` (404)
- **6 nouveaux bugs visuels catalogués (#7 à #12)** — voir tableau ci-dessus
- Fix immédiat : refactor proxy Vite `/room` → `/api/room` pour éviter collision avec routes SvelteKit
- Fix immédiat : `npm install yjs y-protocols` (manquants au moment du test)
- **Prochaine session** : démarrer Lot A (fix bugs #4, #5, #6 audit) + Lot F (PWA manifest) + Bug #8 (highlight invisible palette B/C/D)

### Session 2026-06-03 (suite) — Docs architecture LAN + Plan front
**Durée** ~1h · **Tokens** ~80k
- ARCHITECTURE-COMPLETE.md (FR) — doc principal architecte 3 tiers (Cloud/LAN/Offline), Vercel + serveur maison + Cloudflare Tunnel
- GUIDE-UTILISATEUR-LAN.md — guide 1 page non-dev
- Clarification Wi-Fi ≠ Internet, host/client v1 vs P2P mesh v2
- **Plan d'action frontend découpé en 6 lots (A→F)** — validé pour démarrer
- **Prochaine session** : exécuter Lot A (fix bugs) puis Lot F (PWA manifest)

### Session 2026-06-03 — Docs projet
**Durée** ~30 min · **Tokens** ~50k
- Création du repo git local (3 branches main/front/back)
- Génération de la doc projet : SUIVI, ARCHITECTURE, AI-BACKEND-DEPLOY, REVISION

### Session 2026-06-02 — Room SvelteKit + flows
**Durée** ~4h · **Tokens** ~180k
- Bundle design v2 mergé (4 palettes B/C/D, multi-palette switch, ChromeTR cluster)
- Pattern Claude appliqué (cream-strong cursor, no left-border nav, theme toggle button-secondary)
- Room interface SvelteKit complète : Sidebar dual-rail collapsible + Notes (Y.js) + Files + Q&A + ToastStack
- 4 pages flow ajoutées : `+error`, `/join/[id]`, `/room/[id]/expired`, `/about`
- Audit find-bugs (6 issues catégorisées)

### Session 2026-06-01 — Design + landing + scaffold
**Durée** ~3h · **Tokens** ~150k
- Mining Pinterest board Mind UI via Zapier
- Design system collab.css (palette A chartreuse + tokens)
- Maquettes Hub + Landing + Room (HTML statique)
- Scaffold SvelteKit (package.json, configs, layout, landing component)

---

## Template fin de session (à copier)

```markdown
### Session YYYY-MM-DD — [titre court]
**Durée** ~Xh · **Tokens** ~Xk
- [Action 1 réalisée]
- [Action 2 réalisée]
- [Bug fixé / Décision prise]
- **Prochaine session** : [next step]
```
