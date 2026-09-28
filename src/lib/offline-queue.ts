export type PendingTransaction = {
  clientId: string;
  date: string;
  occurredAt: string; // ISO
  description: string;
  categoryId: string;
  type: "expense" | "income";
  amount: number;
  createdAt: string;
};

const DB_NAME = "ledger-offline";
const STORE = "pending-transactions";
const VERSION = 2;

let syncInFlight: Promise<{ synced: number; failed: number }> | null = null;
const claimedIds = new Set<string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueTransaction(
  tx: Omit<PendingTransaction, "clientId" | "createdAt" | "occurredAt"> & {
    clientId?: string;
    occurredAt?: string;
  },
): Promise<PendingTransaction> {
  const occurredAt = tx.occurredAt ?? new Date().toISOString();
  const pending: PendingTransaction = {
    clientId: tx.clientId ?? crypto.randomUUID(),
    date: tx.date || occurredAt.slice(0, 10),
    occurredAt,
    description: tx.description,
    categoryId: tx.categoryId,
    type: tx.type,
    amount: tx.amount,
    createdAt: new Date().toISOString(),
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    const req = store.put(pending);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
  return pending;
}

export async function listPendingTransactions(): Promise<PendingTransaction[]> {
  const db = await openDb();
  const rows = await new Promise<PendingTransaction[]>((resolve, reject) => {
    const store = db.transaction(STORE, "readonly").objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as PendingTransaction[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export async function removePendingTransaction(clientId: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    const req = store.delete(clientId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

/**
 * Sync offline queue once. Concurrent callers share the same in-flight promise
 * so Providers + TransactionForm don't double-insert.
 */
export async function syncPendingTransactions(): Promise<{
  synced: number;
  failed: number;
}> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const pending = await listPendingTransactions();
    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      if (claimedIds.has(item.clientId)) continue;
      claimedIds.add(item.clientId);

      try {
        // Remove from queue first so a parallel sync won't re-send the same item
        await removePendingTransaction(item.clientId);

        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });

        if (!res.ok) {
          // Put back so user can retry
          await queueTransaction(item);
          failed += 1;
          claimedIds.delete(item.clientId);
          continue;
        }

        synced += 1;
        claimedIds.delete(item.clientId);
      } catch {
        try {
          await queueTransaction(item);
        } catch {
          /* ignore */
        }
        failed += 1;
        claimedIds.delete(item.clientId);
      }
    }

    return { synced, failed };
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}
