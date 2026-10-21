const DATABASE_NAME = "fesflow-local-display-media";
const DATABASE_VERSION = 1;
const MEDIA_STORE = "media";

interface LocalDisplayMediaRecord {
  id: string;
  blob: Blob;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("このブラウザーでは端末内メディアを保存できません"));
  }
  if (databasePromise) return databasePromise;

  // 2026-10-21: プロジェクター用ファイルは端末内だけで扱い、サークル設定には識別子だけ保存する。
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MEDIA_STORE)) {
        database.createObjectStore(MEDIA_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("端末内メディアを開けませんでした"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("別のタブが端末内メディアを使用中です。タブを閉じて再試行してください"));
    };
  });
  return databasePromise;
}

export async function saveLocalDisplayMedia(id: string, file: File): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, "readwrite");
    transaction.objectStore(MEDIA_STORE).put({ id, blob: file } satisfies LocalDisplayMediaRecord);
    transaction.oncomplete = () => resolve();
    const getError = (fallback: string) => transaction.error?.name === "QuotaExceededError"
      ? new Error("ブラウザーが許可する端末保存容量を超えました。空き容量を作るか、小さいファイルを選んでください")
      : transaction.error ?? new Error(fallback);
    transaction.onerror = () => reject(getError("端末内メディアを保存できませんでした"));
    transaction.onabort = () => reject(getError("端末内メディアの保存を中止しました"));
  });
}

// 2026-10-21: 端末ごとのブラウザー保存枠を事前表示に使い、固定の小さな動画上限を避ける。
export async function estimateAvailableLocalStorageBytes(): Promise<number | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (typeof quota !== "number" || typeof usage !== "number") return null;
    return Math.max(0, quota - usage);
  } catch {
    return null;
  }
}

export async function getLocalDisplayMedia(id: string): Promise<Blob | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, "readonly");
    const request = transaction.objectStore(MEDIA_STORE).get(id);
    request.onsuccess = () => resolve((request.result as LocalDisplayMediaRecord | undefined)?.blob ?? null);
    request.onerror = () => reject(request.error ?? new Error("端末内メディアを読み込めませんでした"));
  });
}

export async function deleteLocalDisplayMedia(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, "readwrite");
    transaction.objectStore(MEDIA_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("端末内メディアを削除できませんでした"));
    transaction.onabort = () => reject(transaction.error ?? new Error("端末内メディアの削除を中止しました"));
  });
}
