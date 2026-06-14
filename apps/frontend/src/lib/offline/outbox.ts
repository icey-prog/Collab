/**
 * Offline outbox — IndexedDB queue for actions emitted while disconnected.
 * Flushed automatically when network comes back online.
 *
 * Stored fields preserve offline_created_at for audit trail.
 *
 * Fix #5 : singleton dbPromise (no leak of IDB connections).
 * Fix #10: TTL 4h (cleanup of stale items — Collab promesse "éphémère").
 */
import type { Socket } from 'socket.io-client';

const DB_NAME = 'collab-outbox';
const STORE   = 'actions';
const VERSION = 1;

const TTL_MS  = 4 * 60 * 60 * 1000;  // 4h, aligné sur expiration room serveur (Fix #10)

export interface OutboxAction {
  id:          string;
  type:        'qa:add';          // extend as needed
  roomId:      string;
  payload:     Record<string, unknown>;
  createdAt:   number;            // offline_created_at — preserved for audit
}

/* ── DB singleton (Fix #5) ──────────────────────────────── */

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => {
      // If browser closes DB unexpectedly, reset singleton so next call reopens
      req.result.onclose = () => { dbPromise = null; };
      resolve(req.result);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

/* ── Public API ─────────────────────────────────────────── */

export async function outboxAdd(
  type:    OutboxAction['type'],
  roomId:  string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db   = await getDB();
  const item: OutboxAction = {
    id:        crypto.randomUUID(),
    type,
    roomId,
    payload,
    createdAt: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function outboxGetAll(): Promise<OutboxAction[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as OutboxAction[]);
    req.onerror   = () => reject(req.error);
  });
}

async function outboxRemove(id: string): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * Fix #10: removes items older than TTL_MS. Call at mount of any room page.
 * Returns count of items pruned.
 */
export async function outboxPruneStale(): Promise<number> {
  const items = await outboxGetAll();
  const now   = Date.now();
  let pruned  = 0;
  for (const item of items) {
    if (now - item.createdAt > TTL_MS) {
      try { await outboxRemove(item.id); pruned++; } catch { /* leave */ }
    }
  }
  return pruned;
}

/**
 * Flush all pending outbox actions over the socket.
 * Call when network comes back online.
 *
 * Fix #3: in-memory lock prevents two parallel flushes (online event + onMount race)
 * from emitting each queued action twice.
 * Fix #10: prunes stale items before flushing.
 */
let flushing = false;

export async function outboxFlush(socket: Socket): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  try {
    await outboxPruneStale();
    const items = await outboxGetAll();
    let flushed = 0;
    for (const item of items) {
      try {
        if (item.type === 'qa:add') {
          socket.emit('qa:add', {
            ...item.payload,
            offline_created_at: item.createdAt,
            roomId: item.roomId,
          });
        }
        await outboxRemove(item.id);
        flushed++;
      } catch {
        // leave in queue — retry next flush
      }
    }
    return flushed;
  } finally {
    flushing = false;
  }
}

export async function outboxCount(): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
