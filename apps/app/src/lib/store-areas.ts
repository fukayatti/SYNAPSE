import type { EventStoreArea as StoreArea } from "@/lib/api";

export function parseStoreAreas(raw?: string | null): StoreArea[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((area): area is StoreArea =>
      !!area && typeof area.id === "string" && typeof area.name === "string"
    );
  } catch {
    return [];
  }
}

export function parseCircleStoreAreaId(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const settings: unknown = JSON.parse(raw);
    if (!settings || typeof settings !== "object") return null;
    const id = (settings as Record<string, unknown>).storeAreaId;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export interface StoreAreaCircle {
  settings?: string | null;
}

/** Keep configured order and retain circles whose saved area is missing or no longer known. */
export function groupCirclesByStoreArea<T extends StoreAreaCircle>(
  circles: T[],
  rawAreas?: string | null,
): { area: StoreArea | null; circles: T[] }[] {
  const areas = parseStoreAreas(rawAreas);
  const groups: { area: StoreArea | null; circles: T[] }[] = areas.map((area) => ({ area, circles: [] }));
  const groupById = new Map(groups.map((group) => [group.area!.id, group]));
  const unassigned: T[] = [];

  for (const circle of circles) {
    const group = groupById.get(parseCircleStoreAreaId(circle.settings) ?? "");
    if (group) group.circles.push(circle);
    else unassigned.push(circle);
  }

  if (unassigned.length > 0) groups.push({ area: null, circles: unassigned });
  return groups;
}
