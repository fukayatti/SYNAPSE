// 2026-10-22: 開催前は終了日時よりライフサイクル状態を優先し、誤って終了扱いしない。
export function isEventEnded(event: {
  lifecycleStatus?: "upcoming" | "live" | "ended" | "archived" | null;
  endDate?: string | Date | null;
} | null | undefined, now = Date.now()): boolean {
  if (!event) return false;
  if (event.lifecycleStatus === "ended" || event.lifecycleStatus === "archived") return true;
  if (event.lifecycleStatus === "upcoming") return false;
  if (!event.endDate) return false;
  const endTime = event.endDate instanceof Date ? event.endDate.getTime() : Date.parse(event.endDate);
  return Number.isFinite(endTime) && endTime <= now;
}
