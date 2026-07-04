import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit 設定 (2026-07-04 D1 対応に変更)
 *
 * - 本番 DB は Cloudflare D1 (SQLite)。マイグレーションの「適用」は
 *   wrangler d1 migrations apply が担うため、ここでは主に
 *   `drizzle-kit generate` によるスキーマ→SQL 生成に使う。
 * - dialect は turso から sqlite へ変更 (D1 も SQLite 方言)。
 * - 生成物 (./src/migrations) は apps/api/wrangler.jsonc の
 *   migrations_dir から参照される。
 */
export default defineConfig({
	schema: "./src/schema",
	out: "./src/migrations",
	dialect: "sqlite",
});
