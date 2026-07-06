import { Navigate } from "react-router-dom";

// 旧 app/circle-login/page.tsx は redirect("/login") のみ。
// react-router の Navigate で /login へ置換する (2026-07-04)。
export default function CircleLogin() {
	return <Navigate to="/login" replace />;
}
