/**
 * API Worker エントリ (2026-07-04 Cloudflare Workers 化にリライト)
 *
 * 変更意図:
 * - 旧 apps/server は @hono/node-server の serve() で Node ポートを開き、
 *   アップロードを fs.writeFileSync でローカル public/ に保存していた。
 *   どちらも Workers では動かないため次のように置き換えた:
 *     - serve() → `export default app` (Workers の fetch ハンドラ)
 *     - fs 保存 → @fesflow/storage (本番 R2 / ローカル MinIO)
 * - リクエスト境界で db/auth/env を AsyncLocalStorage に載せ、
 *   既存ルート (db/auth シングルトン参照) を無改修で動かす。
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { trpcServer } from "@hono/trpc-server";
import { nanoid } from "nanoid";

import { createDb, runWithRequest, type WorkerEnv } from "@fesflow/db";
import { createAuth } from "@fesflow/auth";
import { createStorage } from "@fesflow/storage";
import { appRouter } from "@fesflow/api/routers/index";
import { createContext } from "@fesflow/api/context";

// Hono REST ルート
import {
  eventRoutes,
  circleRoutes,
  menuRoutes,
  toppingRoutes,
  staffRoutes,
  orderRoutes,
  membershipRoutes,
  stampRoutes,
  wristbandRoutes,
  preOrderRoutes,
  extensionRoutes,
} from "./routes";

type AppBindings = { Bindings: WorkerEnv };

const app = new Hono<AppBindings>();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie", "Accept"],
    credentials: true,
  }),
);

/**
 * リクエストごとに db/auth/env を生成し、AsyncLocalStorage に載せる。
 * これ以降のハンドラ内での `import { db }` / `import { auth }` は
 * このストアから実体を解決する。
 */
app.use("/*", async (c, next) => {
  const env = c.env as WorkerEnv;
  const db = createDb(env.DB);
  const auth = createAuth(db, env);
  return runWithRequest({ db, auth, env }, () => next());
});

// Better Auth ハンドラ
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const auth = createAuth(createDb(c.env.DB), c.env as WorkerEnv);
  return auth.handler(c.req.raw);
});

// tRPC (web が @fesflow/api の型で参照するエンドポイント)
app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, c) => createContext({ context: c }),
  }),
);

// REST ルート登録
app.route("/api/events", eventRoutes);
app.route("/api/circles", circleRoutes);
app.route("/api/menus", menuRoutes);
app.route("/api/toppings", toppingRoutes);
app.route("/api/staff", staffRoutes);
app.route("/api/orders", orderRoutes);
app.route("/api/memberships", membershipRoutes);
app.route("/api/stamps", stampRoutes);
app.route("/api/wristbands", wristbandRoutes);
app.route("/api/pre-orders", preOrderRoutes);
app.route("/api/extensions", extensionRoutes);

// 画像・フォントアップロード (fs → R2/MinIO)
const ALLOWED_EXTS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "ttf",
  "otf",
  "woff",
  "woff2",
];

app.post("/api/upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || !(file instanceof File)) {
      return c.json({ error: "ファイルがありません" }, 400);
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTS.includes(ext)) {
      return c.json(
        {
          error:
            "許可されていないファイル形式です (画像: jpg, png, webp, svg / フォント: ttf, otf, woff, woff2)",
        },
        400,
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: "ファイルサイズは10MB以下にしてください" }, 400);
    }

    const key = `uploads/${nanoid()}.${ext}`;
    const storage = createStorage(c.env as WorkerEnv);
    await storage.put(key, await file.arrayBuffer(), {
      contentType: file.type || undefined,
      cacheControl: "public, max-age=31536000, immutable",
    });

    return c.json({ path: storage.publicUrl(key), key, ext });
  } catch (error) {
    console.error("Upload error:", error);
    return c.json({ error: "アップロードに失敗しました" }, 500);
  }
});

app.get("/", (c) => c.text("OK"));

export default app;
