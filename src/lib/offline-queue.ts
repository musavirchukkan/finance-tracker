export type PendingTransaction = {
  clientId: string;
  date: string;
  description: string;
  categoryId: string;
  type: "expense" | "income";
  amount: number;
  createdAt: string;
};

const DB_NAME = "ledger-offline";
const STORE = "pending-transactions";
const VERSION = 1;

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
  tx: Omit<PendingTransaction, "clientId" | "createdAt"> & {
    clientId?: string;
  },
): Promise<PendingTransaction> {
  const pending: PendingTransaction = {
    clientId: tx.clientId ?? crypto.randomUUID(),
    date: tx.date,
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
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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

export async function syncPendingTransactions(): Promise<{
  synced: number;
  failed: number;
}> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  const pending = await listPendingTransactions();
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) {
        failed += 1;
        continue;
      }
      await removePendingTransaction(item.clientId);
      synced += 1;
    } catch {
      failed += 1;
    }
  }

  return { synced, failed };
}
