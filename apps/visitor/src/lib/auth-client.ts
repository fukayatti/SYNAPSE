import { createAuthClient } from "better-auth/react";

// better-auth のハンドラは API Worker (apps/api) の /api/auth/* に居る。
export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_API_URL || "http://localhost:8787",
});
