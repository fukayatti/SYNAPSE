import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./App";
import { UnsavedNavigationGuard } from "@/components/UnsavedNavigationGuard";

// 2026-07-07 リファクタリング Phase1: 旧マルチドメイン時代の `?_sw=` (権限スイッチの
// localStorage 持越し) 復元処理を撤去。単一ドメイン化でスペース切替は同一オリジンの
// クライアント遷移になり、この受け口は死にコードになっていた。

const router = createBrowserRouter([
	{
		path: "*",
		element: (
			<UnsavedNavigationGuard>
				<App />
			</UnsavedNavigationGuard>
		),
	},
]);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		{/* 2026-10-21: リンク遷移中も現在の画面を保ち、遅延読込による白抜けを避ける。 */}
		<RouterProvider router={router} useTransitions />
	</StrictMode>,
);
