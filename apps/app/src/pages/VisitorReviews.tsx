import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVisitor } from "@/hooks/useVisitor";
import { reviewApi, type VisitorPublicReview, type VisitorReviewStoreSummary, type VisitorReviewTarget } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowLeft, MessageSquareText, Star, Store } from "lucide-react";
import { useNavigate } from "react-router-dom";

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star key={value} aria-hidden="true" className={`h-4 w-4 ${value <= Math.round(rating) ? "fill-current text-warning" : "text-muted-foreground"}`} />
      ))}
    </span>
  );
}

function formatReviewDate(value: VisitorPublicReview["createdAt"]) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(date);
}

function reviewDateTime(value: VisitorPublicReview["createdAt"]) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function ReviewEditorModal({ target, userId, onClose }: { target: VisitorReviewTarget; userId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(target.review?.rating ?? 0);
  const [comment, setComment] = useState(target.review?.comment ?? "");
  const mutation = useMutation({
    mutationFn: () => reviewApi.submit(userId, { circleId: target.circleId, rating, comment }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["visitor-reviews", userId] }),
        queryClient.invalidateQueries({ queryKey: ["visitor-review-stores", userId] }),
        queryClient.invalidateQueries({ queryKey: ["visitor-store-reviews", userId, target.circleId] }),
      ]);
    },
  });
  const dirty = rating !== (target.review?.rating ?? 0) || comment !== (target.review?.comment ?? "");

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={target.review ? "[レビューの編集]" : "[レビューの投稿]"}
      subtitle={target.circleName}
      maxWidth="md"
    >
      <fieldset className="space-y-2">
        <legend className="text-xs font-bold uppercase">評価（必須）</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${target.circleName}の評価`}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value}つ星`}
              aria-pressed={rating === value}
              onClick={() => setRating(value)}
              className="min-h-11 min-w-11 border-thick border-border p-2 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-info"
            >
              <Star aria-hidden="true" className={`mx-auto h-5 w-5 ${value <= rating ? "fill-current text-warning" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase" htmlFor={`review-comment-${target.circleId}`}>感想（任意）</label>
        <textarea
          id={`review-comment-${target.circleId}`}
          maxLength={1000}
          rows={5}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="よかった点や気づいたことを書いてください"
          className="w-full border-thick border-border bg-input p-3 text-sm font-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-info"
        />
        <p className="text-right text-[10px] text-muted-foreground">{comment.length}/1000文字</p>
      </div>

      {mutation.isError && <p role="alert" className="text-sm text-error">保存できませんでした。通信状況を確認して再度お試しください。</p>}
      {mutation.isSuccess && <p role="status" className="text-sm text-success">レビューを保存しました。</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose}>閉じる</Button>
        <Button disabled={!rating || !dirty || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "保存中…" : target.review ? "変更を保存" : "レビューを投稿"}
        </Button>
      </div>
    </Modal>
  );
}

function ReviewEntry({ review }: { review: VisitorPublicReview }) {
  const dateTime = reviewDateTime(review.createdAt);
  return (
    <article className="space-y-2 border-b-thin border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Stars rating={review.rating} label={`${review.rating}つ星`} />
        <time className="text-[10px] text-muted-foreground" dateTime={dateTime}>
          {formatReviewDate(review.createdAt)}
        </time>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {review.comment?.trim() || <span className="text-muted-foreground">コメントなし</span>}
      </p>
    </article>
  );
}

export default function VisitorReviewsPage() {
  const navigate = useNavigate();
  const { userId, isLoaded } = useVisitor();
  const [editingTarget, setEditingTarget] = useState<VisitorReviewTarget | null>(null);
  const [selectedStore, setSelectedStore] = useState<VisitorReviewStoreSummary | null>(null);
  const targetsQuery = useQuery({
    queryKey: ["visitor-reviews", userId],
    queryFn: () => reviewApi.mine(userId!),
    enabled: !!userId,
  });
  const storesQuery = useQuery({
    queryKey: ["visitor-review-stores", userId],
    queryFn: () => reviewApi.stores(userId!),
    enabled: !!userId,
  });
  const storeReviewsQuery = useQuery({
    queryKey: ["visitor-store-reviews", userId, selectedStore?.circleId],
    queryFn: () => reviewApi.storeReviews(userId!, selectedStore!.circleId),
    enabled: !!userId && !!selectedStore,
  });

  if (!isLoaded || (userId && (targetsQuery.isLoading || storesQuery.isLoading))) {
    return <div className="mx-auto max-w-2xl space-y-4 p-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-44 w-full" /></div>;
  }

  if (!userId) {
    return <main className="mx-auto max-w-2xl p-4"><EmptyState icon={Star} message="来場登録後にレビューを確認できます" /></main>;
  }

  const targets = targetsQuery.data ?? [];
  const stores = storesQuery.data ?? [];
  const selectedTarget = selectedStore ? targets.find((target) => target.circleId === selectedStore.circleId) : undefined;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-3 pb-24 sm:p-4 sm:pb-24">
      <button onClick={() => navigate("/visitor/orders")} className="inline-flex min-h-11 items-center gap-1 text-xs font-bold uppercase underline underline-offset-2 hover:text-info">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />注文履歴に戻る
      </button>

      <header className="border-b-thick border-border pb-4">
        <h1 className="flex items-center gap-2 text-2xl font-black uppercase"><Star aria-hidden="true" className="h-6 w-6" />[レビュー]</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          体験した店舗のレビューを編集できます。店舗ごとの平均評価とレビューは、来場者には匿名で表示されます。
        </p>
      </header>

      <section aria-labelledby="my-reviews-title" className="space-y-3">
        <div className="flex items-end justify-between gap-3 border-b-thick border-border pb-2">
          <div>
            <h2 id="my-reviews-title" className="text-base font-black">[レビューの編集]</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">利用履歴のある店舗の評価を投稿・編集できます</p>
          </div>
          <span className="shrink-0 text-xs font-bold tabular-nums">{targets.length}件</span>
        </div>
        {targetsQuery.isError ? <ErrorState error={targetsQuery.error} onRetry={() => targetsQuery.refetch()} /> : null}
        {!targetsQuery.isError && targets.length === 0 ? <EmptyState icon={MessageSquareText} message="レビューできる体験履歴はありません" /> : null}
        {!targetsQuery.isError && targets.length > 0 ? (
          <ul className="space-y-2">
            {targets.map((target) => (
              <li key={target.circleId} className="flex min-w-0 items-center justify-between gap-3 border-thick border-border p-3">
                <div className="min-w-0 space-y-1">
                  <h3 className="truncate text-sm font-bold">{target.circleName}</h3>
                  {target.review ? (
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <Stars rating={target.review.rating} label={`${target.review.rating}つ星`} />
                      <span>投稿済み</span>
                    </div>
                  ) : <p className="text-[10px] text-muted-foreground">レビュー未投稿</p>}
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => setEditingTarget(target)}>
                  {target.review ? "編集" : "レビューする"}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* 2026-10-16: 編集候補と店舗評価を分け、投稿フォームや長いレビュー本文で一覧が縦に膨らまないよう詳細はポップアップに集約する。 */}
      <section aria-labelledby="store-ratings-title" className="space-y-3">
        <div className="flex items-end justify-between gap-3 border-b-thick border-border pb-2">
          <div>
            <h2 id="store-ratings-title" className="text-base font-black">[店舗ごとの評価]</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">店舗を選ぶとレビューの内容を確認できます</p>
          </div>
          <span className="shrink-0 text-xs font-bold tabular-nums">{stores.length}店舗</span>
        </div>
        {storesQuery.isError ? <ErrorState error={storesQuery.error} onRetry={() => storesQuery.refetch()} /> : null}
        {!storesQuery.isError && stores.length === 0 ? <EmptyState icon={Store} message="店舗情報はありません" /> : null}
        {!storesQuery.isError && stores.length > 0 ? (
          <ul className="space-y-2">
            {stores.map((store) => (
              <li key={store.circleId}>
                <button
                  type="button"
                  onClick={() => setSelectedStore(store)}
                  className="flex min-h-16 w-full items-center justify-between gap-3 border-thick border-border p-3 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-info"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Store aria-hidden="true" className="h-5 w-5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{store.circleName}</span>
                      <span className="block text-[10px] text-muted-foreground">{store.reviewCount}件のレビュー</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {store.averageRating === null ? (
                      <span className="text-xs text-muted-foreground">未評価</span>
                    ) : (
                      <>
                        <span className="font-mono text-sm font-bold tabular-nums">{store.averageRating.toFixed(1)}</span>
                        <Stars rating={store.averageRating} label={`平均${store.averageRating.toFixed(1)}つ星`} />
                      </>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {editingTarget ? (
        <ReviewEditorModal key={editingTarget.circleId} target={editingTarget} userId={userId} onClose={() => setEditingTarget(null)} />
      ) : null}

      {selectedStore ? (
        <Modal
          isOpen
          onClose={() => setSelectedStore(null)}
          title={`[${selectedStore.circleName}のレビュー]`}
          subtitle="来場者のレビューを匿名で表示しています"
          maxWidth="lg"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-thin border-border pb-3">
            <div>
              {selectedStore.averageRating === null ? (
                <p className="text-sm text-muted-foreground">まだ評価はありません</p>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tabular-nums">{selectedStore.averageRating.toFixed(1)}</span>
                  <Stars rating={selectedStore.averageRating} label={`平均${selectedStore.averageRating.toFixed(1)}つ星`} />
                </div>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">{selectedStore.reviewCount}件のレビュー</p>
            </div>
            {selectedTarget ? (
              <Button variant="outline" size="sm" onClick={() => { setSelectedStore(null); setEditingTarget(selectedTarget); }}>
                {selectedTarget.review ? "自分のレビューを編集" : "レビューを書く"}
              </Button>
            ) : null}
          </div>

          {storeReviewsQuery.isLoading ? <Skeleton className="h-32 w-full" /> : null}
          {storeReviewsQuery.isError ? <ErrorState error={storeReviewsQuery.error} onRetry={() => storeReviewsQuery.refetch()} /> : null}
          {!storeReviewsQuery.isLoading && !storeReviewsQuery.isError && storeReviewsQuery.data?.length === 0 ? (
            <EmptyState icon={MessageSquareText} message="この店舗のレビューはまだありません" />
          ) : null}
          {!storeReviewsQuery.isLoading && !storeReviewsQuery.isError && storeReviewsQuery.data?.length ? (
            <div>
              {storeReviewsQuery.data.map((review, index) => <ReviewEntry key={`${selectedStore.circleId}-${index}`} review={review} />)}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </main>
  );
}
