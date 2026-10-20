import type { RegisterDisplaySnapshot } from "@fesflow/config/register-display-contract";

export interface RegisterDisplayConnection {
  id: string;
  token: string;
  revision: number;
  expiresAt: number;
  circleId: string;
  url: string;
  localOnly: boolean;
  snapshot: RegisterDisplaySnapshot;
}

export const REGISTER_DISPLAY_ACTIVE_KEY = "fesflow-register-display-active";

export function readRegisterDisplayConnection(circleId?: string): RegisterDisplayConnection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(REGISTER_DISPLAY_ACTIVE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as RegisterDisplayConnection;
    if (!value.id || !value.circleId || !value.snapshot || (circleId && value.circleId !== circleId)) return null;
    return value;
  } catch {
    return null;
  }
}

// 2026-10-21: レジ画面が unmount しても Providers が同じタブの表示同期を継続できるように保存する。
export function saveRegisterDisplayConnection(value: RegisterDisplayConnection): void {
  try {
    // 2026-10-21: レジが古いrevisionで再描画されても、全体Providerが送信した新しい連番を巻き戻さない。
    const current = readRegisterDisplayConnection();
    const next = current?.id === value.id
      ? { ...value, revision: Math.max(value.revision, current.revision) }
      : value;
    window.sessionStorage.setItem(REGISTER_DISPLAY_ACTIVE_KEY, JSON.stringify(next));
    window.sessionStorage.setItem("fesflow-register-display:" + next.circleId, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("fesflow:register-display-updated"));
  } catch {
    window.dispatchEvent(new CustomEvent("fesflow:register-display-updated", { detail: value }));
  }
}

export function clearRegisterDisplayConnection(circleId: string, id: string): void {
  const current = readRegisterDisplayConnection();
  if (current?.circleId === circleId && current.id === id) {
    try {
      window.sessionStorage.removeItem(REGISTER_DISPLAY_ACTIVE_KEY);
      window.sessionStorage.removeItem("fesflow-register-display:" + circleId);
    } catch {
      // 共有終了操作自体は続ける。
    }
  }
  window.dispatchEvent(new CustomEvent("fesflow:register-display-updated"));
}
