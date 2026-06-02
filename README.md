# Collab MVP

Outil de collaboration éphémère temps réel — par EXXOLAB (Ouagadougou).
Rooms anonymes, autodétruites après 4h d'inactivité, partagées par code 6 caractères.

## Stratégie Git

Le repo a **3 branches** alignées sur les cibles de déploiement :

| Branche | Contenu | Cible déploiement |
|---|---|---|
| `main` | Stable, intégration des 2 sides | Tag de release |
| `front` | Itérations SvelteKit (`apps/frontend/`) | Build statique → Nginx |
| `back`  | Itérations Fastify (`apps/backend/`)   | Docker container |

Workflow standard :
```bash
# Itérer sur le front
git checkout front
# ... modifs apps/frontend/
git commit -am "feat(front): ..."
git push origin front       # déclenche build statique sur le serveur

# Itérer sur le back
git checkout back
# ... modifs apps/backend/
git commit -am "feat(back): ..."
git push origin back        # déclenche rebuild container

# Quand stable des 2 côtés
git checkout main
git merge front
git merge back
git tag v1.x.x
```

## Structure

```
talk/
├── apps/
│   ├── frontend/        # SvelteKit + Y.js + Socket.io
│   └── backend/         # Fastify + Redis + Socket.io
├── design_refs/         # HTML statique des maquettes (collab.css, Room.html, ...)
└── docs/                # README, intégration, architecture
```

## Démarrage rapide

```bash
# Backend (terminal 1)
cd apps/backend && npm install && npm run dev    # → :3001

# Frontend (terminal 2)
cd apps/frontend && npm install && npm run dev   # → :5173
```

## Stack

- **Frontend** : SvelteKit + Vite + Y.js CRDT + Socket.io client
- **Backend** : Fastify + Redis 7 (TTL) + Socket.io + R2 storage
- **Deploy** : Docker Compose + Nginx + Let's Encrypt
