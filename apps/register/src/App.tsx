import { Routes, Route } from "react-router-dom";
import Providers from "@/components/providers";
import Home from "@/pages/Home";
import Placeholder from "@/pages/Placeholder";

/**
 * register (模擬店向け) SPA のルート。
 * Next.js App Router から React Router へ移行中 (2026-07-04)。
 * 移植済みページのみ実ルートに配線し、未移植は Placeholder に集約する。
 * 移植が進むごとに Route を差し替えていく。
 */
export default function App() {
	return (
		<Providers>
			<div className="grid grid-rows-[auto_1fr] min-h-svh">
				<main>
					<Routes>
						<Route path="/" element={<Home />} />
						{/* 以下は Phase3 で順次移植: /login /circle-login /register
						    /menu /my-order /backyard /dashboard/* /admin など */}
						<Route path="*" element={<Placeholder />} />
					</Routes>
				</main>
			</div>
		</Providers>
	);
}
