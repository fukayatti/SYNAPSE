import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPinned, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/ErrorState";
import { circleApi, eventApi, parseStoreAreas, type Circle, type Event, type EventStoreArea } from "@/lib/api";
import { groupCirclesByStoreArea, parseCircleStoreAreaId } from "@/lib/store-areas";

type StoreArea = EventStoreArea;

interface StoreAreasTabProps {
  eventId: string;
  event: Event;
  circles: Circle[] | undefined;
  circlesLoading: boolean;
  circlesError?: boolean;
  circlesErrorObj?: unknown;
  onRetryCircles?: () => void;
}

export function StoreAreasTab({
  eventId,
  event,
  circles,
  circlesLoading,
  circlesError,
  circlesErrorObj,
  onRetryCircles,
}: StoreAreasTabProps) {
  const queryClient = useQueryClient();
  const initialAreas = useMemo(() => parseStoreAreas(event.storeAreas), [event.storeAreas]);
  const [areas, setAreas] = useState<StoreArea[]>(initialAreas);
  const [savedAreas, setSavedAreas] = useState<StoreArea[]>(initialAreas);

  useEffect(() => {
    setAreas(initialAreas);
    setSavedAreas(initialAreas);
  }, [initialAreas]);

  const saveAreas = useMutation({
    mutationFn: (nextAreas: StoreArea[]) => eventApi.setStoreAreas(eventId, nextAreas),
    onSuccess: (_result, nextAreas) => {
      const normalized = nextAreas.map((area) => ({ ...area, name: area.name.trim() }));
      setAreas(normalized);
      setSavedAreas(normalized);
      void queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      toast.success("店舗エリアを保存しました");
    },
    onError: (error: any) => toast.error(error?.message || "店舗エリアを保存できませんでした"),
  });

  const assignmentGroups = useMemo(
    () => groupCirclesByStoreArea(circles ?? [], event.storeAreas),
    [circles, event.storeAreas],
  );
  const activeStampAreaIds = useMemo(() => {
    try {
      const settings = JSON.parse(event.stampRallySettings || "{}") as { enabled?: unknown; targetAreaIds?: unknown };
      return settings.enabled === true && Array.isArray(settings.targetAreaIds)
        ? settings.targetAreaIds.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  }, [event.stampRallySettings]);
  const assignedCounts = new Map(assignmentGroups.flatMap((group) =>
    group.area ? [[group.area.id, group.circles.length] as const] : []
  ));
  const duplicateNames = new Set<string>();
  const seenNames = new Set<string>();
  for (const area of areas) {
    const key = area.name.trim().toLocaleLowerCase("ja-JP");
    if (!key || seenNames.has(key)) duplicateNames.add(area.id);
    seenNames.add(key);
  }
  const hasInvalidAreas = areas.some((area) => duplicateNames.has(area.id));
  const areasChanged = JSON.stringify(areas) !== JSON.stringify(savedAreas);

  const addArea = () => setAreas((current) => [...current, { id: crypto.randomUUID(), name: "" }]);
  const updateAreaName = (id: string, name: string) => {
    setAreas((current) => current.map((area) => area.id === id ? { ...area, name } : area));
  };
  const removeArea = (id: string) => {
    if ((assignedCounts.get(id) ?? 0) > 0) return;
    setAreas((current) => current.filter((area) => area.id !== id));
  };

  return (
    <div className="space-y-6 font-mono text-foreground">
      <header className="space-y-1 border-b-thick border-border pb-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <MapPinned className="h-4 w-4" /> 店舗エリア
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          エリアを登録して各サークルに割り当てます。来場者と運営の出店一覧は、エリアの登録順に表示されます。
        </p>
      </header>

      <Card className="rounded-none bg-background shadow-none">
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center justify-between gap-3 border-b-thin border-border pb-2">
            <div>
              <h3 className="text-xs font-bold">エリアの登録</h3>
              <p className="mt-1 text-[10px] text-muted-foreground">例：本館1階、屋外広場</p>
            </div>
            <Button type="button" variant="outline" disabled={areas.length >= 50} onClick={addArea}>
              <Plus className="mr-1 h-4 w-4" /> エリアを追加
            </Button>
          </div>

          {areas.length === 0 ? (
            <p className="border-thin border-dashed border-border p-4 text-xs text-muted-foreground">
              エリアはまだありません。追加するとサークルを場所ごとに整理できます。
            </p>
          ) : (
            <ol className="space-y-2">
              {areas.map((area, index) => {
                const count = assignedCounts.get(area.id) ?? 0;
                const isStampTarget = activeStampAreaIds.includes(area.id);
                return (
                  <li key={area.id} className="flex items-end gap-2 border-thin border-border p-3">
                    <label className="min-w-0 flex-1 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground">エリア {index + 1}</span>
                      <Input
                        value={area.name}
                        maxLength={60}
                        onChange={(eventChange) => updateAreaName(area.id, eventChange.target.value)}
                        placeholder="エリア名"
                        aria-invalid={duplicateNames.has(area.id)}
                      />
                    </label>
                    <span className="shrink-0 pb-3 text-[10px] text-muted-foreground">{count}サークル</span>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={`${area.name || `エリア${index + 1}`}を削除`}
                      title={count > 0 ? "サークルの割り当てを外してから削除してください" : isStampTarget ? "スタンプラリーの対象から外してから削除してください" : "エリアを削除"}
                      disabled={count > 0 || isStampTarget}
                      onClick={() => removeArea(area.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}

          {hasInvalidAreas && (
            <p role="alert" className="text-xs text-destructive">エリア名を入力してください。重複した名前は使えません。</p>
          )}
          <p className="text-[10px] text-muted-foreground">{areas.length}/50件。エリア名は60文字まで登録できます。</p>
          <div className="flex justify-end border-t-thin border-border pt-3">
            <Button
              type="button"
              disabled={!areasChanged || hasInvalidAreas || saveAreas.isPending}
              onClick={() => saveAreas.mutate(areas)}
            >
              <Save className="mr-1 h-4 w-4" />
              {saveAreas.isPending ? "保存中…" : "エリアを保存"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="circle-area-heading">
        <div className="border-b-thin border-border pb-2">
          <h3 id="circle-area-heading" className="text-xs font-bold">サークルのエリア設定</h3>
          <p className="mt-1 text-[10px] text-muted-foreground">登録したエリアを保存すると選択できるようになります。変更はサークルごとに保存できます。未設定のサークルは一覧の最後に表示されます。</p>
        </div>

        {areas.length === 0 ? (
          <p className="border-thin border-border bg-muted/30 p-4 text-xs text-muted-foreground">先にエリアを登録してください。</p>
        ) : circlesLoading ? (
          <p role="status" className="text-xs text-muted-foreground">サークルを読み込んでいます…</p>
        ) : circlesError ? (
          <ErrorState error={circlesErrorObj} onRetry={onRetryCircles} />
        ) : (circles?.length ?? 0) === 0 ? (
          <p className="border-thin border-border bg-muted/30 p-4 text-xs text-muted-foreground">サークルが登録されると、ここでエリアを設定できます。</p>
        ) : (
          <div className="space-y-4">
            {assignmentGroups.map((group) => (
              <div key={group.area?.id ?? "unassigned"} className="space-y-2">
                <h4 className="flex items-center justify-between text-[11px] font-bold">
                  <span>{group.area?.name ?? "エリア未設定"}</span>
                  <span className="text-muted-foreground">{group.circles.length}サークル</span>
                </h4>
                {group.circles.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {group.circles.map((circle) => (
                      <CircleAreaAssignment key={circle.id} circle={circle} eventId={eventId} areas={parseStoreAreas(event.storeAreas)} />
                    ))}
                  </div>
                ) : (
                  <p className="border-thin border-border p-3 text-[10px] text-muted-foreground">このエリアのサークルはまだありません。</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CircleAreaAssignment({ circle, eventId, areas }: { circle: Circle; eventId: string; areas: StoreArea[] }) {
  const queryClient = useQueryClient();
  const currentAreaId = parseCircleStoreAreaId(circle.settings);
  const [selectedAreaId, setSelectedAreaId] = useState(currentAreaId ?? "");

  useEffect(() => setSelectedAreaId(currentAreaId ?? ""), [currentAreaId]);

  const saveAssignment = useMutation({
    mutationFn: () => circleApi.setStoreArea(circle.id, selectedAreaId || null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["circles", eventId] });
      toast.success(`${circle.name}のエリアを保存しました`);
    },
    onError: (error: any) => toast.error(error?.message || "エリアを保存できませんでした"),
  });

  return (
    <div className="flex flex-wrap items-center gap-2 border-thin border-border bg-background p-3">
      <span className="min-w-0 flex-1 truncate text-xs font-bold" title={circle.name}>{circle.name}</span>
      <label className="sr-only" htmlFor={`circle-area-${circle.id}`}>{circle.name}のエリア</label>
      <select
        id={`circle-area-${circle.id}`}
        value={selectedAreaId}
        onChange={(event) => setSelectedAreaId(event.target.value)}
        className="h-9 min-w-36 border-[2px] border-border bg-background px-2 text-xs"
      >
        <option value="">エリア未設定</option>
        {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
      </select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={selectedAreaId === (currentAreaId ?? "") || saveAssignment.isPending}
        onClick={() => saveAssignment.mutate()}
      >
        {saveAssignment.isPending ? "保存中…" : "保存"}
      </Button>
    </div>
  );
}
