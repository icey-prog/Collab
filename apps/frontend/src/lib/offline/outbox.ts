/**
 * Offline outbox — IndexedDB queue for actions emitted while disconnected.
 * Flushed automatically when network comes back online.
 *
 * Stored fields preserve offline_created_at for audit trail.
 */
import type { Socket } from 'socket.io-client';

const DB_NAME = 'collab-outbox';
const STORE   = 'actions';
const VERSION = 1;

export interface OutboxAction {
  id:          string;
  type:        'qa:add';          // extend as needed
  roomId:      string;
  payload:     Record<string, unknown>;
  createdAt:   number;            // offline_created_at — preserved for audit
}

/* ── DB helpers ─────────────────────────────────────────── */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/* ── Public API ─────────────────────────────────────────── */

export async function outboxAdd(
  type:    OutboxAction['type'],
  roomId:  string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db   = await openDB();
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
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as OutboxAction[]);
    req.onerror   = () => reject(req.error);
  });
}

async function outboxRemove(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * Flush all pending outbox actions over the socket.
 * Call when network comes back online.
 */
export async function outboxFlush(socket: Socket): Promise<number> {
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
}

export async function outboxCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
