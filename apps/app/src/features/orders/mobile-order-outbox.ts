import type { CreateOrderInput, CreateOrderResult } from "@fesflow/config/order-contract";
import { orderApi } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { getVisitor } from "@/hooks/useVisitor";

export type MobileOrderOutboxEntry = {
  idempotencyKey: string;
  fingerprint: string;
  input: CreateOrderInput;
  circleName: string;
  displayItems?: { menuName: string; quantity: number; unitPrice: number }[];
  createdAt: number;
  attemptCount: number;
  nextAttemptAt: number;
  state: "pending" | "attention" | "confirmed";
  result?: CreateOrderResult;
  errorMessage?: string;
};

const DATABASE_NAME = "fesflow-offline-orders";
const DATABASE_VERSION = 1;
const STORE_NAME = "mobile-order-outbox";
let databasePromise: Promise<IDBDatabase> | null = null;
let syncPromise: Promise<void> | null = null;
const orderLocks = new Map<string, Promise<unknown>>();

async function withOrderLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = orderLocks.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    return locks
      ? locks.request(`fesflow-mobile-order:${key}`, operation)
      : operation();
  });
  orderLocks.set(key, current);
  try {
    return await current as T;
  } finally {
    if (orderLocks.get(key) === current) orderLocks.delete(key);
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("このブラウザーでは注文を端末に保存できません"));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "idempotencyKey" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("注文を端末に保存できません"));
      request.onblocked = () => reject(new Error("別のタブがオフライン注文データを更新中です"));
    });
    void databasePromise.catch(() => { databasePromise = null; });
  }
  return databasePromise;
}

async function readAll(): Promise<MobileOrderOutboxEntry[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as MobileOrderOutboxEntry[]);
    request.onerror = () => reject(request.error ?? new Error("送信待ち注文を読み込めません"));
  });
}

async function writeEntry(entry: MobileOrderOutboxEntry): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("送信待ち注文を保存できません"));
    transaction.onabort = () => reject(transaction.error ?? new Error("送信待ち注文の保存が中断されました"));
  });
  await publishOutboxState();
}

async function deleteEntry(idempotencyKey: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(idempotencyKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("送信済み注文を整理できません"));
  });
  await publishOutboxState();
}

function announce(name: string, detail: unknown) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
}

export async function getMobileOrderOutboxEntries(userId?: string | null): Promise<MobileOrderOutboxEntry[]> {
  const entries = await readAll();
  return entries
    .filter((entry) => !userId || entry.input.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function publishOutboxState(): Promise<void> {
  try {
    const entries = await readAll();
    const byUser: Record<string, { pending: number; attention: number }> = {};
    for (const entry of entries) {
      const counts = byUser[entry.input.userId] ??= { pending: 0, attention: 0 };
      if (entry.state === "pending" || entry.state === "attention") counts[entry.state] += 1;
    }
    announce("fesflow:outbox-change", {
      byUser,
    });
  } catch {
    announce("fesflow:outbox-change", { byUser: {}, storageError: true });
  }
}

// 2026-10-21: 注文だけを永続キューへ保存し、応答消失後も同じ冪等キーで再送できるようにする。
export async function queueMobileOrder(
  input: CreateOrderInput,
  circleName: string,
  displayItems: MobileOrderOutboxEntry["displayItems"],
  idempotencyKey: string = crypto.randomUUID(),
): Promise<MobileOrderOutboxEntry> {
  const fingerprint = JSON.stringify(input);
  const entries = await readAll();
  // 2026-10-21: 応答が消えて受付済みか分からない注文を、新しいキーの注文として重複作成させない。
  const sameUnresolvedOrder = entries.find((entry) => entry.input.userId === input.userId && entry.fingerprint === fingerprint);
  if (sameUnresolvedOrder) return sameUnresolvedOrder;
  const existing = entries.find((entry) => entry.idempotencyKey === idempotencyKey);
  if (existing) return existing;

  const entry: MobileOrderOutboxEntry = {
    idempotencyKey,
    fingerprint,
    input,
    circleName,
    displayItems,
    createdAt: Date.now(),
    attemptCount: 0,
    nextAttemptAt: 0,
    state: "pending",
  };
  await writeEntry(entry);
  return entry;
}

function isRetryable(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "NETWORK" || error.status === 429 || error.status >= 500);
}

function retryDelay(entry: MobileOrderOutboxEntry, error: unknown): number {
  if (error instanceof ApiError && error.status === 429 && error.retryAfterSec) {
    return error.retryAfterSec * 1000;
  }
  const backoff = Math.min(1000 * 2 ** Math.min(entry.attemptCount, 5), 30_000);
  return Math.round(backoff * (0.8 + Math.random() * 0.4));
}

export async function sendMobileOrder(entry: MobileOrderOutboxEntry): Promise<CreateOrderResult> {
  return orderApi.createMobile(entry.input, entry.idempotencyKey);
}

// 2026-10-21: 通信断後の応答消失でも同じキーで照会・再送できるよう、送信前に注文を永続化する。
export async function submitMobileOrder(
  input: CreateOrderInput,
  circleName: string,
  displayItems: MobileOrderOutboxEntry["displayItems"],
  idempotencyKey: string,
): Promise<CreateOrderResult> {
  const entry = await queueMobileOrder(input, circleName, displayItems, idempotencyKey);
  try {
    return await withOrderLock(entry.idempotencyKey, async () => {
      if (getVisitor()?.userId !== entry.input.userId) throw new Error("来場者が切り替わったため、注文は端末に保存されています");
      const current = (await readAll()).find((item) => item.idempotencyKey === entry.idempotencyKey) ?? entry;
      const result = await sendMobileOrder(current);
      // 2026-10-21: API受付後の端末整理失敗を未受付と誤認して再注文させない。
      await writeEntry({ ...current, state: "confirmed", result, errorMessage: undefined });
      try {
        await deleteEntry(current.idempotencyKey);
      } catch {
        // 同じ注文キーで成功応答が保存済みなので、次回表示で受付済みと分かる状態を保つ。
      }
      return result;
    });
  } catch (error) {
    if (getVisitor()?.userId !== entry.input.userId) throw error;
    const retryable = isRetryable(error);
    await writeEntry({
      ...entry,
      attemptCount: entry.attemptCount + 1,
      nextAttemptAt: retryable ? Date.now() + retryDelay(entry, error) : 0,
      state: retryable ? "pending" : "attention",
      errorMessage: error instanceof Error ? error.message : "注文を送信できませんでした",
    });
    throw error;
  }
}

export async function syncMobileOrderOutbox(userId: string | null | undefined): Promise<void> {
  if (!userId || typeof navigator === "undefined" || !navigator.onLine || syncPromise) return syncPromise ?? Promise.resolve();

  syncPromise = (async () => {
    const entries = (await getMobileOrderOutboxEntries(userId)).filter((entry) => entry.state === "pending");
    if (entries.length === 0) return;
    let completed = 0;
    announce("fesflow:sync-progress", { active: true, total: entries.length, completed });
    try {
      for (const entry of entries) {
        if (entry.nextAttemptAt > Date.now() || !navigator.onLine) continue;
        if (getVisitor()?.userId !== entry.input.userId) break;
        try {
          await withOrderLock(entry.idempotencyKey, async () => {
            const current = (await readAll()).find((item) => item.idempotencyKey === entry.idempotencyKey);
            if (!current || current.state !== "pending" || current.nextAttemptAt > Date.now() || getVisitor()?.userId !== entry.input.userId) return;
            const result = await sendMobileOrder(current);
            await writeEntry({ ...current, state: "confirmed", result, errorMessage: undefined });
            try {
              await deleteEntry(current.idempotencyKey);
            } catch {
              // 受付結果は端末に記録済み。同じキーで再送する状態には戻さない。
            }
            completed += 1;
            announce("fesflow:mobile-order-synced", { entry: current, result });
            announce("fesflow:sync-progress", { active: true, total: entries.length, completed });
          });
        } catch (error) {
          if (getVisitor()?.userId !== entry.input.userId) break;
          const retryable = isRetryable(error);
          const nextAttemptAt = retryable ? Date.now() + retryDelay(entry, error) : 0;
          await writeEntry({
            ...entry,
            attemptCount: entry.attemptCount + 1,
            nextAttemptAt,
            state: retryable ? "pending" : "attention",
            errorMessage: error instanceof Error ? error.message : "注文を送信できませんでした",
          });
          if (!retryable) announce("fesflow:mobile-order-attention", { entry, error });
          if (error instanceof ApiError && error.code === "NETWORK") break;
        }
      }
    } finally {
      announce("fesflow:sync-progress", { active: false, total: entries.length, completed });
    }
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

export async function retryMobileOrder(idempotencyKey: string): Promise<void> {
  const entry = (await readAll()).find((item) => item.idempotencyKey === idempotencyKey);
  if (!entry || entry.state === "confirmed") return;
  await writeEntry({ ...entry, state: "pending", nextAttemptAt: 0, errorMessage: undefined });
  await syncMobileOrderOutbox(entry.input.userId);
}

