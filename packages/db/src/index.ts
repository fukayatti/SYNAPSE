import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../../apps/server/.env"),
});

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as authSchema from "./schema/auth";
import * as festivalSchema from "./schema/festival";

let databaseUrl = process.env.DATABASE_URL || "";
if (databaseUrl.startsWith("file:")) {
  const relativePath = databaseUrl.replace(/^file:/, "");
  const absolutePath = path.resolve(__dirname, "../../../apps/server", relativePath);
  databaseUrl = `file:${absolutePath}`;
}

const client = createClient({
  url: databaseUrl,
});

export const db = drizzle({
  client,
  schema: { ...authSchema, ...festivalSchema },
});

export * from "./schema/auth";
export * from "./schema/festival";

