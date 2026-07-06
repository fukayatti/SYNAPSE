/**
 * DB エントリ (2026-07-04 Cloudflare Worker 対応にリライト)
 *
 * 変更意図:
 * - 旧実装はモジュール読み込み時に dotenv で DATABASE_URL を読み、
 *   libsql の `db` シングルトンを生成していた。Cloudflare Workers では
 *   D1 バインディングが「リクエストごとの env」経由でしか得られず、
 *   グローバルな DB を持てないため、この設計は動かない。
 * - そこで DB を per-request 化する。Workers 公式が推奨する
 *   AsyncLocalStorage (node:async_hooks / nodejs_compat) を使い、
 *   リクエスト境界で { db, auth, env } を保持する。
 * - 既存ルートは `import { db } from "@fesflow/db"` を大量に使うため、
 *   `db` を ALS から実体を解決する Proxy として公開し、呼び出し側の
 *   書き換えを最小化する (db.select()... はそのまま動く)。
 * - スクリプト/テスト用に libsql ファクトリも残す。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { D1Database } from "@cloudflare/workers-types";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as authSchema from "./schema/auth";
import * as festivalSchema from "./schema/festival";

const schema = { ...authSchema, ...festivalSchema };
export type Schema = typeof schema;

/** Worker の env バインディング。secrets/vars/D1/R2 をまとめて表す。 */
export interface WorkerEnv {
  DB: D1Database;
  BUCKET?: unknown;
  R2_PUBLIC_URL?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  CORS_ORIGIN?: string;
  INITIAL_SUPER_ADMIN_EMAIL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PRODUCT_NAME?: string;
  // MinIO/S3 フォールバック
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_REGION?: string;
  S3_PUBLIC_URL?: string;
  [key: string]: unknown;
}

/** D1 バインディングから drizzle インスタンスを生成する (本番 Worker 経路)。 */
export function createDb(d1: D1Database) {
  return drizzleD1(d1, { schema });
}
export type DB = ReturnType<typeof createDb>;

/** libsql URL から drizzle を生成する (drizzle-kit/スクリプト/Node ローカル用)。 */
export function createLibsqlDb(url: string, authToken?: string): DB {
  const client = createClient({ url, authToken });
  return drizzleLibsql({ client, schema }) as unknown as DB;
}

/** リクエスト境界で保持する依存。auth は循環 import を避けるため unknown。 */
export interface RequestStore {
  db: DB;
  auth: unknown;
  env: WorkerEnv;
}

const requestContext = new AsyncLocalStorage<RequestStore>();

/** ミドルウェアから呼び、以降の処理を ALS コンテキスト内で実行する。 */
export function runWithRequest<T>(store: RequestStore, fn: () => T): T {
  return requestContext.run(store, fn);
}

/** 現在のリクエストストアを取得する。範囲外なら例外。 */
export function getRequestStore(): RequestStore {
  const store = requestContext.getStore();
  if (!store) {
    throw new Error(
      "[db] リクエストスコープ外でストアにアクセスしました。runWithRequest 内で実行してください。",
    );
  }
  return store;
}

/** 現在のリクエストの env を取得する (旧 process.env の置き換え)。 */
export function getEnv(): WorkerEnv {
  return getRequestStore().env;
}

/**
 * ALS から実体を解決する db Proxy。
 * drizzle のクエリビルダは this 依存があるため、関数は実体に bind して返す。
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop, _receiver) {
    const real = getRequestStore().db as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
}) as DB;

export * from "./schema/auth";
export * from "./schema/festival";
