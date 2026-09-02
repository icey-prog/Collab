# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Collab — an ephemeral, no-account, real-time collaboration tool. A room lives
for 4h, is joined via a 6-character code (or QR), and self-destructs
(notes, files, everything) on expiry. Built by EXXOLAB.

Three apps in this monorepo:

- `apps/frontend` — SvelteKit (Svelte 4, Vite) web client
- `apps/backend` — Fastify + Socket.io server (the only backend; there is no
  separate API server)
- `apps/desktop` — Tauri wrapper around the frontend for a native
  Windows/Mac/Linux build (no local sidecar — it's cloud-first, points at the
  deployed backend via `VITE_API_URL` exactly like the web build)

## Commands

```bash
# Install everything
npm run install:all

# Run both frontend (:5173) and backend (:3001) together, from repo root
npm run dev

# Or individually
cd apps/backend && npm run dev     # tsx watch src/server.ts
cd apps/frontend && npm run dev    # vite dev --port 5173

# Type-check (svelte-check) — the closest thing to a test suite; there is no
# automated test runner in this repo
npm run check                       # from repo root, or:
cd apps/frontend && npm run check

cd apps/backend && npx tsc --noEmit  # backend has no `check` script, use tsc directly

# Build
npm run build:front                 # frontend static build
cd apps/backend && npm run build    # tsc compile

# Desktop (Tauri)
cd apps/desktop && npm run dev      # tauri dev
cd apps/desktop && npm run build    # tauri build
```

There are no unit/integration tests in this repo. Verification is
type-checking (`npm run check` / `tsc --noEmit`) plus manually driving the
app (dev servers + browser).

## Architecture

### Backend: in-memory, not a database

`apps/backend/src/lib/state.ts` holds all room state in a single
`Map<string, RoomConfig>` — no Redis, no Postgres. This is deliberate: it
matches the "ephemeral" product promise (a server restart wipes everything,
same as the 4h TTL). Files are streamed to disk (`DATA_DIR/uploads`), not
buffered in RAM — see the streaming/quota-reservation logic in
`routes/files.ts`. A `startJanitor()` interval (in `state.ts`) sweeps expired
rooms/files every 60s.

Route/module layout mirrors the doc comment at the top of `server.ts`:
- `lib/state` — rooms map, TTL janitor, size/participant limits
- `lib/cors` — origin allowlist
- `lib/auth` — admin-cookie check (`collab_admin=<roomId>:<adminToken>`,
  centralized here because it used to be duplicated across 4 handlers)
- `routes/rooms` — create/preview/close (REST)
- `routes/files` — upload (multipart AND a raw-stream branch, see below) +
  download
- `routes/admin` — stats
- `sockets/handlers` — join, Y.js sync, awareness, Q&A, file events

**Two upload paths on the same `/room/:id/upload` route**: normal file
uploads go through `@fastify/multipart`; folder uploads are zipped
client-side and streamed via `fetch(..., duplex: 'half')` with
`Content-Type: application/zip` — Fastify routes that content type through a
dedicated `addContentTypeParser` in `server.ts` that hands back the raw
stream instead of buffering it. Both paths share the same TOCTOU-safe quota
reservation (`reserve`/`release` in `routes/files.ts`) since concurrent
uploads on one room must not race past `MAX_ROOM_BYTES`.

Cross-origin trust: frontend (Vercel) and backend (separate VPS domain) are
different origins, so the admin cookie needs `SameSite=None; Secure` in
production (see the prod/dev split in `routes/rooms.ts`) — `SameSite=Lax`
would silently never be sent cross-site.

### Frontend: Y.js CRDT over a custom Socket.io protocol (not y-socket.io)

`apps/frontend/src/lib/yjs.ts` wires a Y.Doc to Socket.io by hand — event
names and payload shapes are documented in the file header
(`yjs:sync`/`yjs:update`/`yjs:state`, `awareness:update`). Two things worth
knowing before touching this file:

- **Join-race buffering**: local Y.js updates emitted before the server has
  confirmed `room:joined` are silently dropped by the server if sent too
  early, so `createRoomDoc()` buffers them (`pendingLocal`) and flushes on
  `room:joined`.
- **Line ownership / attribution** lives in `lib/notes/sections.ts`, not in
  Y.js itself: each contributor's text is delimited in the shared Y.Text by
  invisible marker lines using Unicode Private Use Area characters
  (`MARK_OPEN`/`MARK_CLOSE` — deliberately outside the typable keyboard
  range, so users can't forge a marker by typing it). A CodeMirror
  `transactionFilter` (`ownershipFilter`) enforces that a user can only edit
  inside their own section, redirecting other edits to a new section at the
  end of the doc. Decorations that color-code each line by author
  (`sectionDecorations`) are restricted to `view.visibleRanges`, not the
  whole document — decorating every line on every keystroke made the editor
  freeze on large pastes.

Backend URL resolution is layered: `lib/api/http.ts#apiUrl()` uses
`VITE_API_URL` when set (prod), else `/api` (dev, proxied by
`vite.config.ts`); `lib/transport.ts#initTransport()` does the same for
Socket.io. `lib/tauri.ts#isTauri()` feature-detects the desktop shell via
`window.__TAURI__`/`__TAURI_INTERNALS__` for the rare desktop-only branch —
otherwise web and desktop run identical code.

**`window.fetch` is patched by SvelteKit** (for hydration/load tracking),
and that wrapped version breaks `fetch()` calls with a streaming
(`ReadableStream`) body. `app.html` captures the pristine native fetch into
`window.__nativeFetch` via an inline `<script>` before SvelteKit's bundle
loads; `FilesModule.svelte`'s streaming upload uses that reference instead
of the global `fetch`. Streaming uploads also require HTTP/2 in Chrome
(`duplex: 'half'` fails with `ERR_ALPN_NEGOTIATION_FAILED` over plain
HTTP/1.1, e.g. local dev) — the upload path detects that failure and falls
back to the older zip-then-upload sequential flow automatically.

Offline support: `lib/offline/outbox.ts` queues actions in IndexedDB while
disconnected (never `localStorage`) and flushes on reconnect, preserving
`createdAt` for audit purposes.

### Deployment

Despite `README.md` describing a 3-branch (`main`/`front`/`back`) workflow
targeting Nginx/Redis/R2, the actual current setup (see `apps/backend/DEPLOY.md`
and `docker-compose.yml`) is simpler and all recent work happens on `main`:
frontend on Vercel (`vercel.json` — single catch-all rewrite to
`index.html`, required because it's an SPA with client-side routing), backend
as a Docker container on Coolify/Traefik (`FRONT_ORIGIN` env var controls
CORS). `VITE_API_URL` is baked in at frontend build time, not read at
runtime — changing it requires a rebuild/redeploy, not just an env var
change on the running instance.
