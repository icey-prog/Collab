# Room — Intégration Frontend ↔ Backend

## Côté frontend (✅ fait)

- `src/lib/socket.ts` — Socket.io client singleton
- `src/lib/yjs.ts` — Y.Doc wrapper avec sync via Socket.io custom events
- `src/lib/stores/` — room / qa / files (Svelte stores)
- `src/lib/components/Sidebar.svelte` — dual-rail collapsible
- `src/lib/components/{Notes,Files,QA}Module.svelte`
- `src/lib/components/ToastStack.svelte`
- `src/routes/room/[id]/+page.svelte` — orchestration

## Côté backend — events Socket.io à implémenter

### Client → Serveur

| Event | Payload | Action serveur |
|---|---|---|
| `join:room` | `{ roomId }` | check existence, INCR count, join socket.io room |
| `qa:add` | `{ text }` | ZADD redis + HSET data, broadcast `qa:updated` |
| `qa:vote` | `{ questionId }` | ZINCRBY, broadcast `qa:updated` |
| `qa:delete` | `{ questionId }` | admin only — ZREM + DEL, broadcast |
| `file:delete` | `{ fileKey }` | admin only — remove from R2/list, broadcast |
| `yjs:state` | `{ roomId, sv }` | renvoie `yjs:state` avec doc snapshot |
| `yjs:sync` | `{ roomId, update }` | applyUpdate puis `socket.to(roomId).emit('yjs:update', ...)` |

### Serveur → Client

| Event | Payload |
|---|---|
| `room:joined` | `{ participants, isAdmin }` |
| `room:error` | `{ code: 'NOT_FOUND' }` |
| `room:full` | `{ max: 50 }` |
| `room:closed` | – |
| `participants:count` | `{ count }` |
| `qa:updated` | `Question[]` |
| `files:updated` | `RoomFile[]` |
| `yjs:state` | `{ roomId, doc }` |
| `yjs:update` | `{ roomId, update }` |

### Plugin Y.js (suggéré)

Voir `apps/backend/src/plugins/yjs.ts` (déjà rédigé dans la conversation
précédente — à créer une fois le squelette backend en place).

Garde la même structure custom (`yjs:state` / `yjs:sync` / `yjs:update`)
plutôt que d'importer `y-socket.io` — ça reste léger et lisible.

## Test sans backend

L'app SvelteKit démarre sans backend, mais les events Socket.io ne
résoudront jamais — la room restera bloquée sur "Connexion…".
Pour valider visuellement le rendu, ouvre la console et tape :

```js
import('$lib/stores/room').then(m => {
  m.status.set('joined');
  m.participants.set(3);
  m.isAdmin.set(true);
});
import('$lib/stores/qa').then(m => m.questions.set([
  { id: 'q1', text: 'Test question', votes: 3, createdAt: Date.now() - 120000 }
]));
```
