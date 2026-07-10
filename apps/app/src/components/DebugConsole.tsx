
// 2026-07-10: スマホでのデバッグ用コンソール (eruda) をスーパー管理者向けに提供するコンポーネント。
// 条件: role === "super_admin" かつ ?debug=true がクエリに含まれる場合のみ有効。
// ページ遷移後もデバッグモードが維持されるよう sessionStorage で debug フラグを保持する。
// eruda は CDN から動的に import するため、通常ビルドのバンドルには含まれない。
//
// [URL の扱い] 2026-07-10 修正:
// 以前は navigate() で ?debug=true を即座に除去していたが、ブラウザからのフルリロードと
// 組み合わさると「消えた」ように見えるため、URLの書き換えは行わないようにした。
// ?debug=true は URL に残り続け、sessionStorage にも保存されるため
// SPA 内の遷移でクエリが外れても eruda は継続して動作する。

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getAuthInfo } from "@/hooks/useCircleAuth";

const DEBUG_SESSION_KEY = "fesflow_debug";

/**
 * ?debug=true が URL にあれば sessionStorage に記憶する。
 * - URL に付いていれば記憶して true を返す
 * - URL に付いていなくても sessionStorage に記憶があれば true を返す
 * - これにより SPA 内ページ遷移でクエリが外れても eruda は維持される
 */
function syncDebugFlag(search: string): boolean {
  const params = new URLSearchParams(search);
  if (params.get("debug") === "true") {
    sessionStorage.setItem(DEBUG_SESSION_KEY, "1");
    return true;
  }
  return sessionStorage.getItem(DEBUG_SESSION_KEY) === "1";
}

/** スマートフォンかどうかの簡易判定 */
function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function DebugConsole() {
  const location = useLocation();
  const erudaLoadedRef = useRef(false);

  useEffect(() => {
    const authInfo = getAuthInfo();
    const isSuperAdmin = authInfo?.role === "super_admin";
    const debugEnabled = syncDebugFlag(location.search);

    if (!isSuperAdmin || !debugEnabled || !isMobile()) return;
    if (erudaLoadedRef.current) return;

    erudaLoadedRef.current = true;

    // eruda を動的ロード。バンドルに含めずCDNから取得する。
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/eruda";
    script.onload = () => {
      // @ts-ignore — eruda はグローバル変数として inject される
      if (typeof eruda !== "undefined") {
        // @ts-ignore
        eruda.init();
      }
    };
    script.onerror = () => {
      console.warn("[DebugConsole] eruda の読み込みに失敗しました");
    };
    document.head.appendChild(script);
    // location.search が変わるたびに syncDebugFlag を再実行してフラグを更新する
  }, [location.search]);

  // このコンポーネント自体は何も描画しない
  return null;
}
