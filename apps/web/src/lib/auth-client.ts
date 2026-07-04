import type { auth } from "@fesflow/auth";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: typeof window !== "undefined" ? undefined : (process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001"),
});
