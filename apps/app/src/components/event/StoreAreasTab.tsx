import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPinned, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/ErrorState";
import { circleApi, eventApi, parseStoreAreas, type Circle, type Event, type EventStoreArea } from "@/lib/api";
import { parseCircleStoreAreaId } from "@/lib/store-areas";
import { useUnsavedChanges } from "@/components/UnsavedNavigationGuard";

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
  const initialAssignments = useMemo(() => Object.fromEntries(
    (circles ?? []).map((circle) => [circle.id, parseCircleStoreAreaId(circle.settings) ?? ""]),
  ), [circles]);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>(initialAssignments);
  const [savedAssignments, setSavedAssignments] = useState<Record<string, string>>(initialAssignments);

  useEffect(() => {
    setAreas(initialAreas);
    setSavedAreas(initialAreas);
  }, [initialAreas]);

  useEffect(() => {
    setSavedAssignments(initialAssignments);
    setAssignmentDrafts((current) => {
      const hadUnsavedChanges = JSON.stringify(current) !== JSON.stringify(savedAssignments);
      return hadUnsavedChanges ? { ...initialAssignments, ...current } : initialAssignments;
    });
    // 2026-10-16: 保存前の手元の割り当てを再取得で失わず、新規サークルだけ補う。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAssignments]);

  const areasChanged = JSON.stringify(areas) !== JSON.stringify(savedAreas);
  const assignmentsChanged = JSON.stringify(assignmentDrafts) !== JSON.stringify(savedAssignments);
  const hasUnsavedChanges = areasChanged || assignmentsChanged;

  const assignmentGroups = useMemo(() => {
    const groups = areas.map((area) => ({ area, circles: [] as Circle[] }));
    const unassigned = { area: null, circles: [] as Circle[] };
    for (const circle of circles ?? []) {
      const areaId = assignmentDrafts[circle.id] ?? parseCircleStoreAreaId(circle.settings) ?? "";
      const group = groups.find((candidate) => candidate.area.id === areaId);
      (group ?? unassigned).circles.push(circle);
    }
    return [...groups, unassigned];
  }, [areas, circles, assignmentDrafts]);

  const saveChanges = useMutation({
    mutationFn: async () => {
      if (hasInvalidAreas) throw new Error("エリア名を入力してください。重複した名前は使えません。");
      const normalizedAreas = areas.map((area) => ({ ...area, name: area.name.trim() }));

      // 2026-10-16: エリアIDの新規登録を先に確定し、その後に割り当てを保存する。
      // APIが別々のため一括保存は段階実行し、失敗分だけ次回保存できるよう成功分の基準値を更新する。
      if (JSON.stringify(normalizedAreas) !== JSON.stringify(savedAreas)) {
        await eventApi.setStoreAreas(eventId, normalizedAreas);
        void queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      }
      // 2026-10-16: 前後の空白だけを直した編集も保存後に下書き表示へ残さない。
      setAreas(normalizedAreas);
      setSavedAreas(normalizedAreas);

      const changedCircles = (circles ?? []).filter((circle) =>
        (assignmentDrafts[circle.id] ?? "") !== (savedAssignments[circle.id] ?? ""),
      );
      const results = await Promise.allSettled(changedCircles.map((circle) =>
        circleApi.setStoreArea(circle.id, assignmentDrafts[circle.id] || null),
      ));
      const succeeded = Object.fromEntries(changedCircles.flatMap((circle, index) =>
        results[index].status === "fulfilled" ? [[circle.id, assignmentDrafts[circle.id] ?? ""]] : [],
      ));
      if (Object.keys(succeeded).length > 0) {
        setSavedAssignments((current) => ({ ...current, ...succeeded }));
      }
      if (results.some((result) => result.status === "rejected")) {
        const failedCount = results.filter((result) => result.status === "rejected").length;
        void queryClient.invalidateQueries({ queryKey: ["circles", eventId] });
        throw new Error(`${failedCount}件のサークル割り当てを保存できませんでした。未保存の項目を確認して再度保存してください。`);
      }

      void queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["circles", eventId] });
    },
    onSuccess: () => toast.success("店舗エリアとサークルの割り当てを保存しました"),
    onError: (error: any) => toast.error(error?.message || "変更を保存できませんでした"),
  });

  // 2026-10-16: エリアと割り当てを同じ保存/破棄単位として遷移ガードへ登録する。
  useUnsavedChanges({
    isDirty: hasUnsavedChanges,
    onSave: () => saveChanges.mutateAsync().then(() => undefined),
    onDiscard: () => {
      setAreas(savedAreas);
      setAssignmentDrafts(savedAssignments);
    },
  });

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
              <p className="mt-1 text-[10px] text-muted-foreground">例：本館1階、屋外広場。エリアとサークルの割り当てはまとめて保存できます。</p>
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
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="circle-area-heading">
        <div className="border-b-thin border-border pb-2">
          <h3 id="circle-area-heading" className="text-xs font-bold">サークルのエリア設定</h3>
          <p className="mt-1 text-[10px] text-muted-foreground">登録したエリアと各サークルの割り当てを編集し、ページ下部のボタンから一度に保存できます。未設定のサークルは一覧の最後に表示されます。</p>
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
                      <CircleAreaAssignment
                        key={circle.id}
                        circle={circle}
                        areas={areas}
                        selectedAreaId={assignmentDrafts[circle.id] ?? parseCircleStoreAreaId(circle.settings) ?? ""}
                        onAreaChange={(areaId) => setAssignmentDrafts((current) => ({ ...current, [circle.id]: areaId }))}
                      />
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

      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 border-thick border-border bg-background p-3 shadow-none">
        <p className="text-[11px] text-muted-foreground" role="status">
          {hasUnsavedChanges ? "未保存の変更があります" : "すべて保存されています"}
        </p>
        <Button
          type="button"
          disabled={!hasUnsavedChanges || hasInvalidAreas || saveChanges.isPending}
          onClick={() => saveChanges.mutate()}
        >
          <Save className="mr-1 h-4 w-4" />
          {saveChanges.isPending ? "保存中…" : "変更を保存"}
        </Button>
      </div>
    </div>
  );
}

function CircleAreaAssignment({
  circle,
  areas,
  selectedAreaId,
  onAreaChange,
}: {
  circle: Circle;
  areas: StoreArea[];
  selectedAreaId: string;
  onAreaChange: (areaId: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-thin border-border bg-background p-3">
      <span className="min-w-0 flex-1 truncate text-xs font-bold" title={circle.name}>{circle.name}</span>
      <label className="sr-only" htmlFor={`circle-area-${circle.id}`}>{circle.name}のエリア</label>
      <select
        id={`circle-area-${circle.id}`}
        value={selectedAreaId}
        onChange={(event) => onAreaChange(event.target.value)}
        className="h-9 min-w-36 border-[2px] border-border bg-background px-2 text-xs"
      >
        <option value="">エリア未設定</option>
        {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
      </select>
    </div>
  );
}
