import { useEffect } from "react";

// 2026-10-21: iOS Safari では body の overflow:hidden だけでは背面が動くことがある。
// 開いているダイアログ数を共有し、最後の一つが閉じた時だけスクロール位置を戻す。
let lockCount = 0;
let lockedScrollY = 0;
let previousBodyStyles: Pick<CSSStyleDeclaration, "position" | "top" | "left" | "right" | "width"> | null = null;

export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    lockCount += 1;
    if (lockCount === 1) {
      const body = document.body;
      lockedScrollY = window.scrollY;
      previousBodyStyles = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
      };
      body.style.position = "fixed";
      body.style.top = `-${lockedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount !== 0 || !previousBodyStyles) return;

      const body = document.body;
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.left = previousBodyStyles.left;
      body.style.right = previousBodyStyles.right;
      body.style.width = previousBodyStyles.width;
      previousBodyStyles = null;
      window.scrollTo(0, lockedScrollY);
    };
  }, [isLocked]);
}
