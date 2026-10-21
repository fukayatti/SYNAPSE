import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

function readSessionValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** 2026-10-21: SPAで画面を移って戻っても、同じタブの作業状態をサークル別に復元する。 */
export function useSessionState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const initialRef = useRef(initialValue);
  const [values, setValues] = useState(() => new Map<string, T>([[key, readSessionValue(key, initialValue)]]));
  const value = values.has(key) ? values.get(key)! : readSessionValue(key, initialRef.current);

  useEffect(() => {
    if (values.has(key)) return;
    setValues((previous) => {
      if (previous.has(key)) return previous;
      const next = new Map(previous);
      next.set(key, readSessionValue(key, initialRef.current));
      return next;
    });
  }, [key, values]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 2026-10-21: プライベートブラウズなどで保存できない場合は通常の画面状態で続ける。
    }
  }, [key, value]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    setValues((previous) => {
      const current = previous.has(key) ? previous.get(key)! : readSessionValue(key, initialRef.current);
      const nextValue = typeof action === "function" ? (action as (previous: T) => T)(current) : action;
      const next = new Map(previous);
      next.set(key, nextValue);
      return next;
    });
  }, [key]);

  return [value, setValue];
}
