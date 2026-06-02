# SUIVI DE PROJET — Collab MVP

> Fichier maintenu à chaque fin de session. Ajoute une entrée datée à la fin.

---

## État global

| Module | Statut | % | Notes |
|---|---|---|---|
| Design system (collab.css) | ✅ Stable | 100 | 4 palettes A/B/C/D × clair/sombre, tokens, animations |
| Maquettes statiques | ✅ Stable | 100 | index.html · Landing.html · Room.html avec annotations |
| Frontend SvelteKit | 🟡 En cours | 75 | Pages OK, intégration socket à tester live |
| Backend Fastify | 🔴 À démarrer | 10 | Seul `plugins/yjs.ts` rédigé — squelette serveur attendu |
| Déploiement | 🔴 À démarrer | 0 | Nginx + Docker compose à configurer |
| Tests | 🔴 À démarrer | 0 | Aucun test écrit |

Légende : ✅ stable · 🟡 en cours · 🔴 à démarrer · ⏸️ en pause · ❌ bloqué

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

### Session 2026-06-03 — Docs projet
**Durée** ~30 min · **Tokens** ~50k
- Création du repo git local (3 branches main/front/back)
- Génération de la doc projet : SUIVI, ARCHITECTURE, AI-BACKEND-DEPLOY, REVISION
- **Prochaine session** : démarrer le scaffold backend Fastify côté `back` branch

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
