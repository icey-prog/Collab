# Collab Frontend — SvelteKit

## Démarrage

```bash
npm install
npm run dev      # → http://localhost:5173
```

Le proxy Vite redirige `/room`, `/admin`, `/socket.io` vers `http://localhost:3001` (backend Fastify).

## Build production

```bash
npm run build
```

Sort dans `build/` — un dossier statique servi par Nginx.

## Structure

```
src/
├── app.html              # template HTML racine
├── app.css               # design system COLLAB (60-30-10)
├── lib/
│   ├── api/room.ts       # client REST → backend
│   ├── components/       # composants partagés (ThemeToggle, ...)
│   └── stores/theme.ts   # store thème light/dark persisté
└── routes/
    ├── +layout.svelte    # layout global, charge le CSS
    ├── +page.svelte      # landing /
    └── room/[id]/
        └── +page.svelte  # interface room (à implémenter)
```
