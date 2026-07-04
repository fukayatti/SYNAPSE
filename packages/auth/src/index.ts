import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@fesflow/db";
import * as schema from "@fesflow/db/schema/auth";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "sqlite",

		schema: schema,
	}),
	trustedOrigins: [
		process.env.CORS_ORIGIN || "",
		"http://localhost:3000",
		"http://127.0.0.1:3000",
		"http://172.20.10.3:3000",
	],
	emailAndPassword: {
		enabled: true,
	},
	advanced: {
		defaultCookieAttributes: {
			sameSite: "none",
			secure: true,
			httpOnly: true,
		},
	},
});
