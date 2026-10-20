import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBlocker } from "react-router-dom";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";

interface UnsavedChangeEntry {
  isDirty: () => boolean;
  save: () => Promise<void> | void;
  discard?: () => void;
}

interface UnsavedNavigationContextValue {
  register: (id: string, entry: UnsavedChangeEntry) => () => void;
  requestNavigation: (action: () => void) => void;
}

const UnsavedNavigationContext = createContext<UnsavedNavigationContextValue | null>(null);

/** 2026-10-16: 管理画面の下書きを集約し、離脱前に保存・破棄を選べるようにする。 */
export function UnsavedNavigationGuard({ children }: { children: ReactNode }) {
  const entriesRef = useRef(new Map<string, UnsavedChangeEntry>());
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const savingRef = useRef(false);
  const bypassBlockerRef = useRef(false);

  const register = useCallback((id: string, entry: UnsavedChangeEntry) => {
    entriesRef.current.set(id, entry);
    return () => {
      entriesRef.current.delete(id);
    };
  }, []);

  const hasUnsavedChanges = useCallback(() => {
    for (const entry of entriesRef.current.values()) {
      if (entry.isDirty()) return true;
    }
    return false;
  }, []);

  const requestNavigation = useCallback((action: () => void) => {
    if (hasUnsavedChanges()) {
      setSaveError(null);
      setPendingAction(() => action);
      return;
    }
    action();
  }, [hasUnsavedChanges]);

  const shouldBlockNavigation = useCallback(() => {
    if (bypassBlockerRef.current) {
      bypassBlockerRef.current = false;
      return false;
    }
    return hasUnsavedChanges();
  }, [hasUnsavedChanges]);

  // 2026-10-16: React Router のデータルーターでURL変更、リンク、戻る/進むを共通して捕捉する。
  const blocker = useBlocker(shouldBlockNavigation);

  const runPendingAction = () => {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    bypassBlockerRef.current = true;
    try {
      action();
    } finally {
      // React Router の navigate は同期で blocker predicate を評価する。状態だけ変えるタブもあるため、
      // ナビゲーションが発生しなかった場合は次のイベントまで迂回フラグを残さない。
      queueMicrotask(() => { bypassBlockerRef.current = false; });
    }
  };

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      // 2026-10-16: ブラウザ終了時は標準確認を使い、保存選択肢はSPA遷移時に表示する。
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (blocker.state === "blocked") setSaveError(null);
  }, [blocker.state]);

  const saveAndContinue = async () => {
    // 2026-10-20: URL遷移はblocker、画面内切替はpendingActionに保持されるため両方を保存対象にする。
    if (savingRef.current || (blocker.state !== "blocked" && !pendingAction)) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      // 画面ごとの複数フォームも、登録順に成功を確認してから遷移する。
      const dirtyEntries = [...entriesRef.current.values()].filter((entry) => entry.isDirty());
      for (const entry of dirtyEntries) await entry.save();
      if (blocker.state === "blocked") blocker.proceed();
      else runPendingAction();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存に失敗しました。内容を確認してもう一度お試しください。");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const discardAndContinue = () => {
    if (isSaving || (blocker.state !== "blocked" && !pendingAction)) return;
    for (const entry of entriesRef.current.values()) {
      if (entry.isDirty()) entry.discard?.();
    }
    if (blocker.state === "blocked") blocker.proceed();
    else runPendingAction();
  };

  const contextValue = useMemo(() => ({ register, requestNavigation }), [register, requestNavigation]);

  return (
    <UnsavedNavigationContext.Provider value={contextValue}>
      {children}
      <UnsavedChangesDialog
        isOpen={blocker.state === "blocked" || !!pendingAction}
        title="未保存の変更があります"
        description="このページを離れる前に、変更を保存するか破棄してください。"
        confirmLabel={isSaving ? "保存中…" : "保存して移動"}
        discardLabel="保存せずに移動"
        cancelLabel="編集を続ける"
        isPending={isSaving}
        errorMessage={saveError}
        onConfirm={() => void saveAndContinue()}
        onDiscard={discardAndContinue}
        onCancel={() => {
          if (isSaving) return;
          setSaveError(null);
          if (blocker.state === "blocked") blocker.reset();
          setPendingAction(null);
        }}
      />
    </UnsavedNavigationContext.Provider>
  );
}

/** 2026-10-16: URL変更を使わないタブ/画面切り替えも共通の未保存確認へ通す。 */
export function useGuardedNavigation() {
  const context = useContext(UnsavedNavigationContext);
  if (!context) throw new Error("useGuardedNavigation must be used inside UnsavedNavigationGuard");
  return context.requestNavigation;
}

/** 2026-10-16: 下書きを持つ画面・モーダルから保存/破棄処理を共通ガードへ登録する。 */
export function useUnsavedChanges({
  isDirty,
  onSave,
  onDiscard,
}: {
  isDirty: boolean | (() => boolean);
  onSave: () => Promise<void> | void;
  onDiscard?: () => void;
}) {
  const context = useContext(UnsavedNavigationContext);
  if (!context) throw new Error("useUnsavedChanges must be used inside UnsavedNavigationGuard");
  const id = useId();
  const latest = useRef({ isDirty, onSave, onDiscard });
  latest.current = { isDirty, onSave, onDiscard };

  useLayoutEffect(
    () => context.register(id, {
      isDirty: () => typeof latest.current.isDirty === "function"
        ? latest.current.isDirty()
        : latest.current.isDirty,
      save: () => latest.current.onSave(),
      discard: () => latest.current.onDiscard?.(),
    }),
    [context, id],
  );
}
