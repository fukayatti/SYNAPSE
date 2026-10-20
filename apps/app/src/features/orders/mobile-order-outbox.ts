import type { CreateOrderInput, CreateOrderResult } from "@fesflow/config/order-contract";
import { orderApi } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { getVisitor } from "@/hooks/useVisitor";
import { orderFingerprint } from "./submission";

export type MobileOrderOutboxEntry = {
  idempotencyKey: string;
  fingerprint: string;
  input: CreateOrderInput;
  circleName: string;
  displayItems?: { menuName: string; quantity: number; unitPrice: number; toppings?: string[] }[];
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
const syncPromises = new Map<string, Promise<void>>();
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

async function readEntry(idempotencyKey: string): Promise<MobileOrderOutboxEntry | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(idempotencyKey);
    request.onsuccess = () => resolve((request.result as MobileOrderOutboxEntry | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("送信待ち注文を読み込めません"));
  });
}

// 2026-10-21: 古いリクエストの失敗が別タブで確定した注文を未受付へ戻さないよう、状態更新をIDB transaction内で行う。
async function updateEntry(
  idempotencyKey: string,
  update: (entry: MobileOrderOutboxEntry) => MobileOrderOutboxEntry,
): Promise<MobileOrderOutboxEntry | null> {
  const database = await openDatabase();
  const updated = await new Promise<MobileOrderOutboxEntry | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(idempotencyKey);
    let result: MobileOrderOutboxEntry | null = null;
    request.onsuccess = () => {
      const current = request.result as MobileOrderOutboxEntry | undefined;
      if (!current) return;
      result = update(current);
      if (result !== current) store.put(result);
    };
    request.onerror = () => reject(request.error ?? new Error("送信待ち注文を更新できません"));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? new Error("送信待ち注文を更新できません"));
    transaction.onabort = () => reject(transaction.error ?? new Error("送信待ち注文の更新が中断されました"));
  });
  if (updated) await publishOutboxState();
  return updated;
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
  const fingerprint = orderFingerprint(input);

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
  // 2026-10-21: 同時に開いたタブでも同じ未解決注文を1件だけ保存するため、探索と追加を同一IDB transactionで行う。
  const database = await openDatabase();
  const queued = await new Promise<MobileOrderOutboxEntry>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    let selected: MobileOrderOutboxEntry | null = null;
    request.onsuccess = () => {
      const existingEntries = request.result as MobileOrderOutboxEntry[];
      const sameKey = existingEntries.find((candidate) => candidate.idempotencyKey === idempotencyKey);
      const sameUnresolvedOrder = existingEntries.find((candidate) =>
        candidate.state !== "confirmed"
        && candidate.input.userId === input.userId
        && (candidate.fingerprint === fingerprint || orderFingerprint(candidate.input) === fingerprint),
      );
      selected = sameKey ?? sameUnresolvedOrder ?? null;
      if (!selected) {
        selected = entry;
        store.add(entry);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("送信待ち注文を保存できません"));
    transaction.oncomplete = () => resolve(selected ?? entry);
    transaction.onerror = () => reject(transaction.error ?? new Error("送信待ち注文を保存できません"));
    transaction.onabort = () => reject(transaction.error ?? new Error("送信待ち注文の保存が中断されました"));
  });
  await publishOutboxState();
  return queued;
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

async function sendQueuedMobileOrder(
  idempotencyKey: string,
  options: { retryAttention?: boolean } = {},
): Promise<CreateOrderResult | null> {
  return withOrderLock(idempotencyKey, async () => {
    const current = await readEntry(idempotencyKey);
    if (!current) return null;
    if (current.state === "confirmed") return current.result ?? null;
    if (current.state === "attention" && !options.retryAttention) return null;
    if (getVisitor()?.userId !== current.input.userId) {
      throw new Error("来場者が切り替わったため、注文は端末に保存されています");
    }

    let result: CreateOrderResult;
    try {
      result = await sendMobileOrder(current);
    } catch (error) {
      if (getVisitor()?.userId !== current.input.userId) throw error;
      const retryable = isRetryable(error);
      let saved: MobileOrderOutboxEntry | null;
      try {
        saved = await updateEntry(idempotencyKey, (latest) => latest.state === "confirmed"
          ? latest
          : {
              ...latest,
              attemptCount: latest.attemptCount + 1,
              nextAttemptAt: retryable ? Date.now() + retryDelay(latest, error) : 0,
              state: retryable ? "pending" : "attention",
              errorMessage: error instanceof Error ? error.message : "注文を送信できませんでした",
            });
      } catch {
        // 2026-10-21: 状態保存に失敗してもAPIの応答種別を保ち、通信不明なら注文履歴へ案内する。
        await publishOutboxState();
        throw error;
      }
      if (saved?.state === "confirmed" && saved.result) return saved.result;
      if (!retryable) announce("fesflow:mobile-order-attention", { entry: saved ?? current, error });
      throw error;
    }

    let confirmed: MobileOrderOutboxEntry | null;
    try {
      confirmed = await updateEntry(idempotencyKey, (latest) => latest.state === "confirmed"
        ? latest
        : { ...latest, state: "confirmed", result, nextAttemptAt: 0, errorMessage: undefined });
    } catch {
      // 2026-10-21: API受付後に端末保存が失敗しても、受付成功を利用者へ返し同じキーの再照合を残す。
      await publishOutboxState();
      return result;
    }
    if (confirmed?.state === "confirmed") {
      try {
        await deleteEntry(idempotencyKey);
      } catch {
        // 受付結果は端末に記録済み。同じキーで再送する状態には戻さない。
      }
      return confirmed.result ?? result;
    }
    return result;
  });
}

// 2026-10-21: 通信断後の応答消失でも同じキーで照会・再送できるよう、送信前に注文を永続化する。
export async function submitMobileOrder(
  input: CreateOrderInput,
  circleName: string,
  displayItems: MobileOrderOutboxEntry["displayItems"],
  idempotencyKey: string,
): Promise<CreateOrderResult> {
  const entry = await queueMobileOrder(input, circleName, displayItems, idempotencyKey);
  const result = await sendQueuedMobileOrder(entry.idempotencyKey, { retryAttention: true });
  if (!result) throw new Error("注文の受付状態を確認できません。注文履歴を確認してください");
  return result;
}

export async function syncMobileOrderOutbox(userId: string | null | undefined): Promise<void> {
  if (!userId || typeof navigator === "undefined" || !navigator.onLine) return;
  const existingSync = syncPromises.get(userId);
  if (existingSync) return existingSync;

  const currentSync = (async () => {
    const entries = (await getMobileOrderOutboxEntries(userId)).filter((entry) => entry.state === "pending");
    if (entries.length === 0) return;
    let completed = 0;
    announce("fesflow:sync-progress", { active: true, total: entries.length, completed });
    try {
      for (const entry of entries) {
        if (entry.nextAttemptAt > Date.now() || !navigator.onLine) continue;
        if (getVisitor()?.userId !== entry.input.userId) break;
        try {
          const result = await sendQueuedMobileOrder(entry.idempotencyKey);
          if (result) {
            completed += 1;
            announce("fesflow:mobile-order-synced", { entry, result });
            announce("fesflow:sync-progress", { active: true, total: entries.length, completed });
          }
        } catch (error) {
          if (getVisitor()?.userId !== entry.input.userId) break;
          if (!(error instanceof ApiError) || error.code === "NETWORK") break;
        }
      }
    } finally {
      announce("fesflow:sync-progress", { active: false, total: entries.length, completed });
    }
  })();
  syncPromises.set(userId, currentSync);
  try {
    await currentSync;
  } finally {
    if (syncPromises.get(userId) === currentSync) syncPromises.delete(userId);
  }
}

export async function retryMobileOrder(idempotencyKey: string): Promise<void> {
  const entry = await readEntry(idempotencyKey);
  if (!entry || entry.state === "confirmed") return;
  if (getVisitor()?.userId !== entry.input.userId) throw new Error("この注文を送信した来場者に切り替えてから再試行してください");
  await withOrderLock(idempotencyKey, async () => {
    await updateEntry(idempotencyKey, (current) => current.state === "confirmed"
      ? current
      : { ...current, state: "pending", nextAttemptAt: 0, errorMessage: undefined });
  });
  await syncMobileOrderOutbox(entry.input.userId);
}

