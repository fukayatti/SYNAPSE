import "dotenv/config";
import { auth } from "@fesflow/auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";

// Hono REST APIルート
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


const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie", "Accept"],
    credentials: true,
  })
);

// Better Auth
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// REST APIルートを登録
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


// 画像・フォントファイルアップロードエンドポイント
app.post("/api/upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || !(file instanceof File)) {
      return c.json({ error: "ファイルがありません" }, 400);
    }

    // 拡張子チェック
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const allowedExts = [
      "jpg", "jpeg", "png", "gif", "webp", "svg",
      "ttf", "otf", "woff", "woff2"
    ];
    if (!allowedExts.includes(ext)) {
      return c.json({ error: "許可されていないファイル形式です (画像: jpg, png, webp, svg / フォント: ttf, otf, woff, woff2)" }, 400);
    }

    // ファイルサイズチェック (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: "ファイルサイズは10MB以下にしてください" }, 400);
    }

    // ファイル名生成
    const fileName = `${nanoid()}.${ext}`;

    // 保存先ディレクトリ
    const uploadDir = path.join(process.cwd(), "../web/public/uploads");

    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // ファイル保存
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(path.join(uploadDir, fileName), buffer);

    // 公開パスを返す
    const publicPath = `/uploads/${fileName}`;

    return c.json({ path: publicPath, fileName, ext });
  } catch (error) {
    console.error("Upload error:", error);
    return c.json({ error: "アップロードに失敗しました" }, 500);
  }
});


app.get("/", (c) => {
  return c.text("OK");
});

import { serve } from "@hono/node-server";

serve(
  {
    fetch: app.fetch,
    port: 3001,
    hostname: "0.0.0.0",
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
