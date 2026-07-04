import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
	path: path.resolve(__dirname, "../../apps/server/.env"),
});

let databaseUrl = process.env.DATABASE_URL || "";
if (databaseUrl.startsWith("file:")) {
	const relativePath = databaseUrl.replace(/^file:/, "");
	const absolutePath = path.resolve(__dirname, "../../apps/server", relativePath);
	databaseUrl = `file:${absolutePath}`;
}

export default defineConfig({
	schema: "./src/schema",
	out: "./src/migrations",
	dialect: "turso",
	dbCredentials: {
		url: databaseUrl,
	},
});

