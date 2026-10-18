import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { circleApi, eventApi, reviewApi, type Circle, type ManagedReview } from "@/lib/api";
import { useAuth, PermissionGuard } from "@/hooks/useCircleAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormSelect } from "@/components/ui/FormField";
import { Star } from "lucide-react";
import { groupCirclesByStoreArea } from "@/lib/store-areas";

type StoreAreaGroup = ReturnType<typeof groupCirclesByStoreArea<Circle>>[number];

function ReviewRows({ rows, isLoading, isError, error, retry, showCircle, areaGroups = [] }: {
  rows?: ManagedReview[]; isLoading: boolean; isError: boolean; error: unknown; retry: () => void; showCircle: boolean;
  areaGroups?: StoreAreaGroup[];
}) {
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedCircleId, setSelectedCircleId] = useState("all");
  const reviewCount = rows?.length ?? 0;
  const averageRating = reviewCount > 0
    ? rows!.reduce((sum, row) => sum + row.rating, 0) / reviewCount
    : null;
  const circlesInArea = useMemo(() => {
    if (selectedArea === "all") return areaGroups.flatMap((group) => group.circles);
    const group = areaGroups.find(({ area }) => (area ? `area:${area.id}` === selectedArea : selectedArea === "unassigned"));
    return group?.circles ?? [];
  }, [areaGroups, selectedArea]);
  const filteredRows = (rows ?? []).filter((row) =>
    (selectedRating === null || row.rating === selectedRating)
    && (!showCircle || selectedCircleId === "all" || row.circleId === selectedCircleId)
    && (!showCircle || selectedArea === "all" || circlesInArea.some((circle) => circle.id === row.circleId))
  );

  const selectArea = (areaId: string) => {
    setSelectedArea(areaId);
    setSelectedCircleId("all");
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 border-b-thick border-border pb-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">来場者の声</p>
          <h2 className="flex items-center gap-3 font-headline text-2xl uppercase">
            <Star className="h-6 w-6" /> レビュー
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">投稿された評価とコメントを確認できます。</p>
        </div>
        <div className="grid grid-cols-2 gap-6 md:min-w-64">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">レビュー数</p>
            <p className="mt-1 font-headline text-2xl tabular-nums">{isLoading || isError ? "—" : reviewCount}件</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">平均評価</p>
            <p className="mt-1 flex items-center gap-1 font-headline text-2xl tabular-nums">
              {isLoading || isError ? "—" : averageRating == null ? "—" : <><Star className="h-5 w-5 fill-current text-warning" />{averageRating.toFixed(1)}</>}
            </p>
          </div>
        </div>
      </header>

      <section aria-label="レビュー一覧" className="space-y-4">
        <div className="flex items-center justify-between border-b-thin border-border pb-3">
          <h3 className="font-mono text-xs font-bold uppercase tracking-widest">レビュー一覧</h3>
          {!isLoading && !isError && <span aria-live="polite" className="font-mono text-xs text-muted-foreground">{filteredRows.length}件 / {reviewCount}件</span>}
        </div>
        {!isLoading && !isError && reviewCount > 0 && (
          <div className="space-y-4 border-b-thin border-border pb-4">
            {showCircle && areaGroups.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-bold">場所</legend>
                <div className="flex flex-wrap gap-2" role="group" aria-label="場所で絞り込み">
                  <button type="button" aria-pressed={selectedArea === "all"} onClick={() => selectArea("all")} className={`min-h-10 border-thick px-3 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-info ${selectedArea === "all" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>すべて</button>
                  {areaGroups.map(({ area, circles }) => {
                    const areaId = area ? `area:${area.id}` : "unassigned";
                    return <button key={areaId} type="button" aria-pressed={selectedArea === areaId} onClick={() => selectArea(areaId)} className={`min-h-10 border-thick px-3 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-info ${selectedArea === areaId ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                      {area?.name ?? "場所未設定"}<span className="ml-1 font-mono">{circles.length}</span>
                    </button>;
                  })}
                </div>
              </fieldset>
            )}
            {showCircle && (
              <FormSelect id="event-review-store-filter" label="店舗" value={selectedCircleId} onChange={(event) => setSelectedCircleId(event.target.value)}>
                <option value="all">選択中の場所のすべての店舗</option>
                {circlesInArea.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
              </FormSelect>
            )}
            <fieldset className="space-y-2">
              <legend className="text-xs font-bold">評価</legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label="星の数で絞り込み">
                <button type="button" aria-pressed={selectedRating === null} onClick={() => setSelectedRating(null)} className={`min-h-10 border-thick px-3 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-info ${selectedRating === null ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>すべて</button>
                {[5, 4, 3, 2, 1].map((rating) => <button key={rating} type="button" aria-pressed={selectedRating === rating} onClick={() => setSelectedRating(rating)} className={`inline-flex min-h-10 items-center gap-1 border-thick px-3 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-info ${selectedRating === rating ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                  {rating}<Star aria-hidden="true" className="h-3.5 w-3.5 fill-current text-warning" />
                </button>)}
              </div>
            </fieldset>
          </div>
        )}
        {isLoading ? (
          <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : isError ? (
          <ErrorState error={error} onRetry={retry} />
        ) : !reviewCount ? (
          <div className="space-y-3 py-4">
            <EmptyState icon={Star} message="レビューはまだありません" />
            <p className="text-center font-mono text-xs text-muted-foreground">評価やコメントが投稿されると、ここに表示されます。</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState icon={Star} message="条件に一致するレビューはありません" />
        ) : (
          <div className="divide-y-thin divide-border">
            {filteredRows.map((row, index) => (
              <article key={`${row.circleId ?? "circle"}-${row.displayId}-${index}`} className="space-y-3 py-6">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {showCircle && <strong className="text-sm">{row.circleName}</strong>}
                  <span className="font-mono text-xs font-bold">来場者 {String(row.displayId).padStart(2, "0")}</span>
                  <span className="flex items-center text-warning" aria-label={`${row.rating}つ星`}>
                    {Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-4 w-4 ${i < row.rating ? "fill-current" : "text-muted-foreground"}`} />)}
                    <span className="ml-2 font-mono text-xs text-foreground">{row.rating}/5</span>
                  </span>
                  <time className="font-mono text-[10px] text-muted-foreground">{new Date(row.createdAt).toLocaleString("ja-JP")}</time>
                </div>
                <p className="max-w-4xl whitespace-pre-wrap break-words text-sm leading-relaxed">{row.comment || "（コメントなし）"}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function CircleReviewsPage() {
  const { circleId, circleName } = useAuth();
  const query = useQuery({ queryKey: ["circle-reviews", circleId], queryFn: () => reviewApi.circle(circleId!), enabled: !!circleId });
  return <PermissionGuard permission="sales:read"><DashboardLayout title={circleName || "サークルレビュー"} subtitle="来場者の評価・感想" type="circle">
    <ReviewRows rows={query.data} isLoading={query.isLoading} isError={query.isError} error={query.error} retry={() => query.refetch()} showCircle={false} />
  </DashboardLayout></PermissionGuard>;
}

// 2026-09-27: 管理側レビュー本文は既存の売上閲覧権限を持つサークル担当者だけに表示する。
export default CircleReviewsPage;

export function EventReviewsTab({ eventId }: { eventId: string }) {
  const query = useQuery({ queryKey: ["event-reviews", eventId], queryFn: () => reviewApi.event(eventId), enabled: !!eventId });
  const eventQuery = useQuery({ queryKey: ["event-review-event", eventId], queryFn: () => eventApi.get(eventId), enabled: !!eventId });
  const circlesQuery = useQuery({ queryKey: ["event-review-circles", eventId], queryFn: () => circleApi.list(eventId), enabled: !!eventId });
  const areaGroups = useMemo(
    () => groupCirclesByStoreArea(circlesQuery.data ?? [], eventQuery.data?.storeAreas),
    [circlesQuery.data, eventQuery.data?.storeAreas],
  );
  return <ReviewRows rows={query.data} isLoading={query.isLoading} isError={query.isError} error={query.error} retry={() => query.refetch()} showCircle areaGroups={areaGroups} />;
}
