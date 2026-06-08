# SUIVI DE PROJET — Collab MVP

> Fichier maintenu à chaque fin de session. Ajoute une entrée datée à la fin.

---

## État global

| Module | Statut | % | Notes |
|---|---|---|---|
| Design system (collab.css) | ✅ Stable | 100 | 4 palettes A/B/C/D × clair/sombre, tokens, animations |
| Maquettes statiques | ✅ Stable | 100 | index.html · Landing.html · Room.html avec annotations |
| Frontend SvelteKit | 🟡 En cours | 75 | Pages OK + composants room + Y.js wrap. Manque PWA/offline + transport abstraction + UI host |
| Backend Fastify | 🔴 À démarrer | 10 | Seul `plugins/yjs.ts` rédigé — squelette serveur attendu |
| Déploiement | 🔴 À démarrer | 0 | Vercel front + Cloudflare Tunnel back à configurer |
| Tests | 🔴 À démarrer | 0 | Aucun test écrit |

Légende : ✅ stable · 🟡 en cours · 🔴 à démarrer · ⏸️ en pause · ❌ bloqué

---

## Plan d'action FRONTEND (en cours — Phase 1)

> Validé le 2026-06-03. Backend hors scope de ce plan.

### Lot A — Fix bugs audit /find-bugs (front uniquement) — 30 min
- [ ] Bug #4 : `+error.svelte` → message générique pour 5xx
- [ ] Bug #5 : `room/[id]/+page.svelte` → centraliser handler `room:closed`
- [ ] Bug #6 : `package.json` → retirer `y-socket.io` (inutilisé)

### Lot B — Transport abstraction (LAN/Cloud switch) — 2h
- [ ] Nouveau `lib/transport.ts` — détection mode + URL backend dynamique
- [ ] Nouveau `lib/stores/network.ts` — store `'cloud' | 'lan' | 'offline'`
- [ ] Patch `lib/socket.ts` — support `VITE_API_URL` env + URL custom runtime
- [ ] Nouveau `lib/components/NetworkBadge.svelte` — indicateur mode actif
- [ ] Patch `Sidebar.svelte` — intégrer NetworkBadge

### Lot C — Offline persistence (Tier 3 PWA) — 3h
- [ ] `package.json` — ajouter `y-indexeddb` + `workbox-window`
- [ ] Nouveau `lib/offline/persistence.ts` — wrap Y.Doc + IndexeddbPersistence
- [ ] Nouveau `lib/offline/outbox.ts` — queue IDB pour qa/upload offline
- [ ] Patch `lib/yjs.ts` — persistance locale en parallèle du socket
- [ ] Nouveau `src/service-worker.ts` — Workbox precache shell + runtime cache
- [ ] Patch `svelte.config.js` — activer SW
- [ ] Patch `+layout.svelte` — register SW au mount

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
| 7 | 🟠 MED | `apps/frontend/src/routes/+page.svelte` + variantes | Double brand "Collab" haut-gauche : `<a class="spec-home">` + `.brand` se superposent | ⏳ À fixer (retirer `spec-home` sur landing, garder `.brand`) |
| 8 | 🔴 HIGH | `app.css` `.hl::before` + tous les hero | Highlight chartreuse invisible en palette B/C/D (cream-strong sur cream-strong). Texte "Disparu après.", "Notion.", "X7K92P" illisibles. Cause : `z-index: -1` cache le `::before` derrière le fond `<body>` quand pas de contexte d'empilement créé sur le parent. | ⏳ À fixer (retirer `z-index: -1`, utiliser `::after` avec `z-index: -1` + parent en `position: relative` ou changer pour `background-image` linear-gradient inline) |
| 9 | 🟡 LOW | `static/favicon.svg` | 404 sur favicon, log console à chaque page | ⏳ À fixer (créer favicon.svg avec logo Collab) |
| 10 | 🟡 LOW | SvelteKit v2.8 | Warning `<Layout/Page> was created with unknown prop 'params'` (vestige API v1) | ⏳ À fixer (vérifier `+layout.svelte` et `+page.svelte` n'export pas `let params`) |
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
