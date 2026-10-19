import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CircleCheck, Gift, RefreshCw, Search, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { stampRallyApi, type StampRallyUsageStore } from "@/lib/api";

type ViewMode = "overview" | "stores";
type StoreSort = "visitors" | "orders" | "sales" | "name";

function formatCount(value: number) {
  return value.toLocaleString("ja-JP");
}

function formatYen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function formatPercent(value: number, denominator: number) {
  return denominator > 0 ? `${Math.round((value / denominator) * 100)}%` : "—";
}

function formatDate(value: string | null) {
  if (!value) return "実績なし";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// 2026-10-16: 設定の直下で、参加・達成・交換を同じアカウント単位で追えるようにする。
export function StampRallyUsageDashboard({ eventId }: { eventId: string }) {
  const [view, setView] = useState<ViewMode>("overview");
  const [storeQuery, setStoreQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [storeSort, setStoreSort] = useState<StoreSort>("visitors");
  const [storePage, setStorePage] = useState(1);
  const [selectedStore, setSelectedStore] = useState<StampRallyUsageStore | null>(null);
  const [visitorSearch, setVisitorSearch] = useState("");
  const [appliedVisitorSearch, setAppliedVisitorSearch] = useState("");
  const [visitorPage, setVisitorPage] = useState(1);
  const summaryQuery = useQuery({
    queryKey: ["stamp-rally-usage", eventId],
    queryFn: () => stampRallyApi.usage(eventId),
    enabled: !!eventId,
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => setAppliedVisitorSearch(visitorSearch.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [visitorSearch]);
  useEffect(() => setVisitorPage(1), [selectedStore?.circleId, appliedVisitorSearch]);

  const visitorQuery = useQuery({
    queryKey: ["stamp-rally-store-visitors", eventId, selectedStore?.circleId, visitorPage, appliedVisitorSearch],
    queryFn: () => stampRallyApi.storeVisitors(eventId, selectedStore!.circleId, visitorPage, appliedVisitorSearch),
    enabled: !!selectedStore,
  });

  const stores = summaryQuery.data?.stores ?? [];
  const storeAreas = useMemo(() => [...new Map(
    stores.flatMap((store) => store.storeAreaId && store.storeAreaName
      ? [[store.storeAreaId, store.storeAreaName] as const]
      : []),
  )], [stores]);
  const filteredStores = useMemo(() => {
    const query = storeQuery.trim().toLocaleLowerCase();
    const filtered = stores.filter((store) => {
      const matchesQuery = !query || `${store.name} ${store.storeAreaName ?? ""}`.toLocaleLowerCase().includes(query);
      const matchesArea = areaFilter === "all" || areaFilter === "targets"
        ? areaFilter === "all" || store.isStampTarget
        : areaFilter === "other"
          ? !store.isStampTarget
          : store.storeAreaId === areaFilter;
      return matchesQuery && matchesArea;
    });
    return filtered.sort((left, right) => {
      if (storeSort === "orders") return right.completedOrderCount - left.completedOrderCount || left.name.localeCompare(right.name, "ja");
      if (storeSort === "sales") return right.orderTotal - left.orderTotal || left.name.localeCompare(right.name, "ja");
      if (storeSort === "name") return left.name.localeCompare(right.name, "ja");
      return right.visitorAccountCount - left.visitorAccountCount || left.name.localeCompare(right.name, "ja");
    });
  }, [stores, storeQuery, areaFilter, storeSort]);
  useEffect(() => setStorePage(1), [storeQuery, areaFilter, storeSort]);

  const pageSize = 12;
  const totalStorePages = Math.max(1, Math.ceil(filteredStores.length / pageSize));
  const pagedStores = filteredStores.slice((storePage - 1) * pageSize, storePage * pageSize);
  const summary = summaryQuery.data;
  const participantCount = summary?.participantAccountCount ?? 0;
  const qualifiedCount = summary?.qualifiedAccountCount ?? 0;
  const exchangeRateCount = summary?.qualifiedRedeemedAccountCount ?? 0;
  const qualification = summary?.qualification;
  const qualificationDescription = summary && qualification
    ? [
        qualification.minQualifiedAreaCount !== null
          ? `対象${summary.targetAreaIds.length}エリアのうち${qualification.minQualifiedAreaCount}エリア以上（各エリア${qualification.minDistinctCirclesPerArea.default}店舗以上）`
          : null,
        // 2026-10-19: エリア条件を無効にした場合、保存されている個別値は達成条件として表示しない。
        ...(qualification.minQualifiedAreaCount === null ? [] : Object.entries(qualification.minDistinctCirclesPerArea.byArea)
          .filter(([areaId]) => summary.targetAreaIds.includes(areaId))
          .map(([areaId, count]) => `${storeAreas.find(([id]) => id === areaId)?.[1] ?? "対象エリア"} ${count}店舗以上`)),
        qualification.requiredAreaIds.length > 0
          ? `必須エリア: ${qualification.requiredAreaIds.map((areaId) => storeAreas.find(([id]) => id === areaId)?.[1] ?? "対象エリア").join("・")}`
          : null,
        qualification.minTotalDistinctCircles !== null
          ? `合計${qualification.minTotalDistinctCircles}店舗以上`
          : null,
      ].filter(Boolean).join(" / ")
    : "達成条件を設定してください";

  if (summaryQuery.isLoading) {
    return (
      <section className="space-y-4" aria-label="スタンプラリー実績を読み込み中">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-24" />)}
        </div>
        <Skeleton className="h-56" />
      </section>
    );
  }

  if (summaryQuery.isError || !summary) {
    return (
      <section className="space-y-3" aria-labelledby="stamp-rally-usage-title">
        <h3 id="stamp-rally-usage-title" className="flex items-center gap-2 text-sm font-bold"><BarChart3 className="h-4 w-4" />実績ダッシュボード</h3>
        <p className="text-xs text-error" role="alert">実績を読み込めませんでした。権限または通信状態を確認してください。</p>
        <Button type="button" variant="outline" size="sm" onClick={() => summaryQuery.refetch()}>再読み込み</Button>
      </section>
    );
  }

  const metrics = [
    { label: "利用アカウント", value: formatCount(participantCount), sub: "対象店舗で注文完了", icon: Users },
    { label: "条件達成", value: formatCount(qualifiedCount), sub: `達成率 ${formatPercent(qualifiedCount, participantCount)}`, icon: CircleCheck },
    { label: "交換アカウント", value: formatCount(summary.redeemedAccountCount), sub: `${formatCount(summary.redeemedQuantity)}個を交換`, icon: Gift },
    { label: "達成者の交換率", value: formatPercent(exchangeRateCount, qualifiedCount), sub: `${formatCount(exchangeRateCount)} / ${formatCount(qualifiedCount)} アカウント`, icon: BarChart3 },
    { label: "登録店舗", value: formatCount(summary.stores.length), sub: `うち対象 ${formatCount(summary.targetStoreCount)} 店舗`, icon: Store },
  ];

  return (
    <section className="space-y-4" aria-labelledby="stamp-rally-usage-title">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-thick border-border pb-3">
        <div className="space-y-1">
          <h3 id="stamp-rally-usage-title" className="flex items-center gap-2 text-sm font-bold"><BarChart3 className="h-4 w-4" />実績ダッシュボード</h3>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            完了注文を集計。人数はリストバンド本数ではなくアカウント単位です。注文数にはアカウントに紐付かない注文も含まれます。
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={summaryQuery.isFetching} onClick={() => summaryQuery.refetch()}>
          <RefreshCw className={`h-4 w-4 ${summaryQuery.isFetching ? "animate-spin" : ""}`} />更新
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {metrics.map(({ label, value, sub, icon: Icon }) => (
          <Card key={label} className="bg-background">
            <CardContent className="space-y-2 p-4">
              <p className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</p>
              <p className="font-headline text-2xl tabular-nums">{value}</p>
              <p className="text-[10px] text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" aria-label="実績の表示切り替え">
        <Button type="button" size="sm" variant={view === "overview" ? "default" : "outline"} aria-pressed={view === "overview"} onClick={() => setView("overview")}>全体・景品</Button>
        <Button type="button" size="sm" variant={view === "stores" ? "default" : "outline"} aria-pressed={view === "stores"} onClick={() => setView("stores")}>店舗利用管理</Button>
      </div>

      {view === "overview" ? (
        <div className="space-y-5">
          <section className="space-y-3" aria-labelledby="stamp-rally-funnel-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 id="stamp-rally-funnel-title" className="text-xs font-bold">参加から交換まで</h4>
              <span className="text-[10px] text-muted-foreground">
                条件: {qualificationDescription}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { label: "参加", value: participantCount, note: "対象店舗で1回以上利用" },
                { label: "達成", value: qualifiedCount, note: `参加者の${formatPercent(qualifiedCount, participantCount)}` },
                { label: "達成後に交換", value: exchangeRateCount, note: `達成者の${formatPercent(exchangeRateCount, qualifiedCount)}` },
              ].map((step, index) => (
                <div key={step.label} className="flex min-h-20 items-center justify-between gap-3 border-l-heavy border-border bg-muted p-3">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground">0{index + 1} / {step.label}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{step.note}</p>
                  </div>
                  <p className="font-headline text-2xl tabular-nums">{formatCount(step.value)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="stamp-rally-stock-title">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-thin border-border pb-2">
              <h4 id="stamp-rally-stock-title" className="flex items-center gap-2 text-xs font-bold"><Gift className="h-4 w-4" />景品の交換・在庫</h4>
              <span className="text-[10px] text-muted-foreground">交換 {formatCount(summary.redeemedQuantity)} 個</span>
            </div>
            {summary.rewards.length === 0 ? (
              <p className="text-xs text-muted-foreground">景品はまだ設定されていません。</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                {summary.rewards.map((reward) => (
                  <div key={reward.id} className="flex min-w-0 items-center justify-between gap-3 border-b-thin border-border py-3">
                    <span className="truncate text-xs font-bold">{reward.name}</span>
                    <span className="shrink-0 text-right text-[10px] tabular-nums">
                      {formatCount(reward.redeemedQuantity)}個交換
                      <span className="block text-muted-foreground">{reward.remainingQuantity === null ? "在庫上限なし" : `残り ${formatCount(reward.remainingQuantity)}個`}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="space-y-4" aria-labelledby="stamp-rally-stores-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h4 id="stamp-rally-stores-title" className="flex items-center gap-2 text-xs font-bold"><Store className="h-4 w-4" />店舗利用管理</h4>
              <p className="mt-1 text-[10px] text-muted-foreground">店舗を選ぶと利用アカウントと注文実績を確認できます。</p>
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">{filteredStores.length}店舗</span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(12rem,1fr)_minmax(10rem,14rem)_minmax(10rem,14rem)]">
            <label className="relative block">
              <span className="sr-only">店舗を検索</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" type="search" value={storeQuery} onChange={(event) => setStoreQuery(event.target.value)} placeholder="店舗名で検索" />
            </label>
            <FormSelect id="stamp-rally-store-filter" label="表示する店舗" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
              <option value="all">すべての店舗</option>
              <option value="targets">スタンプ対象のみ</option>
              <option value="other">対象外の店舗</option>
              {storeAreas.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </FormSelect>
            <FormSelect id="stamp-rally-store-sort" label="並び順" value={storeSort} onChange={(event) => setStoreSort(event.target.value as StoreSort)}>
              <option value="visitors">利用アカウント数</option>
              <option value="orders">完了注文数</option>
              <option value="sales">注文合計</option>
              <option value="name">店舗名</option>
            </FormSelect>
          </div>

          {pagedStores.length === 0 ? (
            <p className="border-b-thin border-border py-8 text-center text-xs text-muted-foreground">条件に合う店舗がありません。検索条件を変更してください。</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {pagedStores.map((store) => (
                <button
                  key={store.circleId}
                  type="button"
                  onClick={() => { setSelectedStore(store); setVisitorSearch(""); setAppliedVisitorSearch(""); setVisitorPage(1); }}
                  className="border-thick border-border bg-background p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:border-heavy"
                  aria-label={`${store.name}の利用実績を開く`}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{store.name}</span>
                      <span className="mt-1 block truncate text-[10px] text-muted-foreground">{store.storeAreaName || "エリア未設定"}</span>
                    </span>
                    <span className={`shrink-0 border-thin px-2 py-1 text-[10px] font-bold ${store.isStampTarget ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                      {store.isStampTarget ? "スタンプ対象" : "対象外"}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t-thin border-border pt-3 sm:grid-cols-4">
                    <span><span className="block text-[10px] text-muted-foreground">利用アカウント</span><strong className="mt-1 block text-sm tabular-nums">{formatCount(store.visitorAccountCount)}</strong></span>
                    <span><span className="block text-[10px] text-muted-foreground">完了注文</span><strong className="mt-1 block text-sm tabular-nums">{formatCount(store.completedOrderCount)}</strong></span>
                    <span><span className="block text-[10px] text-muted-foreground">注文合計</span><strong className="mt-1 block text-sm tabular-nums">{formatYen(store.orderTotal)}</strong></span>
                    <span><span className="block text-[10px] text-muted-foreground">最終利用</span><strong className="mt-1 block text-[11px] tabular-nums">{formatDate(store.lastUsedAt)}</strong></span>
                  </div>
                  {store.unlinkedOrderCount > 0 && <span className="mt-3 block text-[10px] text-muted-foreground">アカウント未連携の完了注文 {formatCount(store.unlinkedOrderCount)} 件</span>}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t-thin border-border pt-3">
            <Button type="button" variant="outline" size="sm" disabled={storePage <= 1} onClick={() => setStorePage((page) => page - 1)}>前へ</Button>
            <span className="text-[10px] tabular-nums">{storePage} / {totalStorePages} ページ</span>
            <Button type="button" variant="outline" size="sm" disabled={storePage >= totalStorePages} onClick={() => setStorePage((page) => page + 1)}>次へ</Button>
          </div>
        </section>
      )}

      <Modal
        isOpen={!!selectedStore}
        onClose={() => setSelectedStore(null)}
        title={selectedStore?.name ?? "店舗利用実績"}
        subtitle="アカウントに紐付く完了注文を来場者ごとにまとめています。"
        maxWidth="xl"
      >
        <div className="space-y-4">
          {selectedStore && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["利用アカウント", formatCount(selectedStore.visitorAccountCount)],
                ["完了注文", formatCount(selectedStore.completedOrderCount)],
                ["注文合計", formatYen(selectedStore.orderTotal)],
                ["アカウント未連携", `${formatCount(selectedStore.unlinkedOrderCount)}件`],
              ].map(([label, value]) => (
                <div key={label} className="border-b-thin border-border py-2">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="mt-1 text-sm font-bold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          )}
          <label className="relative block">
            <span className="sr-only">来場者を検索</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" type="search" value={visitorSearch} onChange={(event) => setVisitorSearch(event.target.value)} placeholder="ニックネーム・来場者番号で検索" />
          </label>

          {visitorQuery.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          ) : visitorQuery.isError ? (
            <div className="space-y-2" role="alert">
              <p className="text-xs text-error">来場者の利用実績を読み込めませんでした。</p>
              <Button type="button" size="sm" variant="outline" onClick={() => visitorQuery.refetch()}>再読み込み</Button>
            </div>
          ) : visitorQuery.data?.visitors.length ? (
            <div className="divide-y divide-border border-y-thin border-border">
              {visitorQuery.data.visitors.map((visitor) => (
                <div key={visitor.displayId} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">{visitor.nickname?.trim() || `来場者 ${visitor.displayId}`}</p>
                    <p className="text-[10px] text-muted-foreground">来場者番号 {visitor.displayId}</p>
                  </div>
                  <p className="text-[10px] tabular-nums">{formatCount(visitor.orderCount)}注文 / {formatYen(visitor.orderTotal)}</p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">最終利用 {formatDate(visitor.lastUsedAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">該当するアカウント利用実績はありません。</p>
          )}

          {visitorQuery.data && visitorQuery.data.total > visitorQuery.data.pageSize && (
            <div className="flex items-center justify-between border-t-thin border-border pt-3">
              <Button type="button" size="sm" variant="outline" disabled={visitorPage <= 1 || visitorQuery.isFetching} onClick={() => setVisitorPage((page) => page - 1)}>前へ</Button>
              <span className="text-[10px] tabular-nums">{visitorQuery.data.page} / {Math.max(1, Math.ceil(visitorQuery.data.total / visitorQuery.data.pageSize))} ページ ・ {formatCount(visitorQuery.data.total)}人</span>
              <Button type="button" size="sm" variant="outline" disabled={visitorQuery.data.page >= Math.ceil(visitorQuery.data.total / visitorQuery.data.pageSize) || visitorQuery.isFetching} onClick={() => setVisitorPage((page) => page + 1)}>次へ</Button>
            </div>
          )}
        </div>
      </Modal>
    </section>
  );
}
