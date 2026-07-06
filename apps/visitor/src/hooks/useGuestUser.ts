import { useEffect, useState } from "react";
import { getVisitor } from "./useVisitor";

/**
 * 旧 register の useGuestUser 互換シム (2026-07-04)。
 *
 * 来場者アプリでは「ゲストID」= 入場済みの eventUser.id (来場者セッション)。
 * 移植した Menu/MyPage は useGuestUser().userId を参照するため、ここで
 * useVisitor のセッションIDを返して互換を保つ。未入場でメニューだけ見る場合の
 * フォールバックとして一時的なランダム閲覧IDを生成する (事前注文時は要入場)。
 */
function generateBrowseId() {
  return "guest_" + Math.random().toString(36).slice(2, 11);
}

export function useGuestUser() {
  const [userId, setUserId] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const v = getVisitor();
    if (v?.userId) {
      setUserId(v.userId);
    } else {
      let browse = localStorage.getItem("fes_browse_id");
      if (!browse) {
        browse = generateBrowseId();
        localStorage.setItem("fes_browse_id", browse);
      }
      setUserId(browse);
    }
    setIsLoaded(true);

    const onChange = () => {
      const cur = getVisitor();
      if (cur?.userId) setUserId(cur.userId);
    };
    window.addEventListener("visitorChange", onChange);
    return () => window.removeEventListener("visitorChange", onChange);
  }, []);

  return { userId, isLoaded };
}
