// 2026-10-21: 来場者画面は運営の終了状態と終了日時のどちらでも同じ終了後導線へ切り替える。
export function isEventEnded(event: {
  lifecycleStatus?: "upcoming" | "live" | "ended" | "archived" | null;
  endDate?: string | Date | null;
} | null | undefined, now = Date.now()): boolean {
  if (!event) return false;
  if (event.lifecycleStatus === "ended" || event.lifecycleStatus === "archived") return true;
  if (!event.endDate) return false;
  const endTime = event.endDate instanceof Date ? event.endDate.getTime() : Date.parse(event.endDate);
  return Number.isFinite(endTime) && endTime <= now;
}
