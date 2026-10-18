import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { eventApi, type EventAnalytics } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Coins,
  Download,
  Receipt,
  RefreshCw,
  Users,
  type LucideIcon,
} from "lucide-react";

// 2026-10-16: 全期間の要約から時間帯・年代・注文・回遊へ掘り下げられる構成にし、集計単位も画面内で説明する。
// 2026-10-18: 開催後の振り返り専用にし、開催中の自動更新は運営画面へ集約する。

type TrendMetric = "visitors" | "orders" | "revenue";

const trendMetrics: { key: TrendMetric; label: string }[] = [
  { key: "visitors", label: "アカウント作成" },
  { key: "orders", label: "注文数" },
  { key: "revenue", label: "売上" },
];

function yen(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function integer(value: number): string {
  return value.toLocaleString("ja-JP");
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}時`;
}

function metricValue(value: number, metric: TrendMetric): string {
  return metric === "revenue" ? yen(value) : `${integer(value)}${metric === "visitors" ? "アカウント" : "件"}`;
}

function getPeak<T extends { hour: number }>(
  rows: T[],
  valueFor: (row: T) => number,
): T | undefined {
  return rows.reduce<T | undefined>(
    (peak, row) => (!peak || valueFor(row) > valueFor(peak) ? row : peak),
    undefined,
  );
}

// CSVの1セルをエスケープする (カンマ/改行/ダブルクオート対応)。
function csvCell(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// 画面と同じ集計単位で、概要・時間帯・年代・サークル・注文内訳を書き出す。
function downloadCsv(eventLabel: string, analytics: EventAnalytics) {
  const totals = analytics.totals;
  const ageTotal = analytics.ageBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const ageRows = analytics.ageBuckets.map((bucket) => [
    bucket.label,
    bucket.count,
    ageTotal ? `${Math.round((bucket.count / ageTotal) * 100)}%` : "0%",
  ]);
  const lines: (string | number | null)[][] = [
    ["イベント統計サマリ"],
    ["来場アカウント数", "登録プロフィール数", "受付完了アカウント数", "受付完了率", "売上", "注文数", "注文完了率", "注文記録上の延べ人数"],
    [
      totals.visitors,
      totals.visitorProfiles,
      totals.onboarded,
      `${totals.onboardedRate}%`,
      totals.revenue,
      totals.orders,
      `${totals.completedRate}%`,
      totals.customers,
    ],
    [],
    ["時間帯別 (日本時間・全開催日の合算)"],
    ["時刻", "アカウント作成数", "注文数", "売上"],
    ...analytics.byHour.map((row) => [hourLabel(row.hour), row.visitors, row.orders, row.revenue]),
    [],
    ["年代構成 (リストバンド/プロフィール単位)"],
    ["年齢回答ありプロフィール", ageTotal, "未回答プロフィール", Math.max(0, totals.visitorProfiles - ageTotal)],
    ["年代", "年齢登録プロフィール数", "回答者内の構成比"],
    ...ageRows,
    [],
    ["サークル別売上"],
    ["サークル名", "売上", "注文数", "レビュー数", "平均評価"],
    ...analytics.circleRanking.map((circle) => [
      circle.name,
      circle.revenue,
      circle.orders,
      circle.reviews,
      circle.avgRating ?? "",
    ]),
    [],
    ["人気メニュー"],
    ["メニュー", "販売個数", "売上"],
    ...analytics.menuRanking.map((menu) => [menu.menuName, menu.quantity, menu.revenue]),
    [],
    ["支払い方法"],
    ["支払い方法", "注文数", "売上"],
    ...analytics.paymentBreakdown.map((payment) => [payment.method, payment.orders, payment.revenue]),
  ];
  const csv = lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${eventLabel || "event"}_統計_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div className={`min-w-0 border-t-thick pt-3 ${accent ? "border-accent" : "border-border"}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="truncate font-mono text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <p className="mt-2 break-words font-headline text-[clamp(1rem,5vw,1.875rem)] leading-none tabular-nums">{value}</p>
      <p className="mt-2 min-h-4 text-[10px] leading-4 text-muted-foreground">{note}</p>
    </div>
  );
}

function SectionTitle({ id, label, note }: { id?: string; label: string; note?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-thin border-border pb-2">
      <h3 id={id} className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest">
        {label}
      </h3>
      {note && <p className="text-[10px] text-muted-foreground">{note}</p>}
    </div>
  );
}

function RankingBars({
  rows,
  max,
}: {
  rows: { key: string; label: string; value: number; valueLabel: string; detail: string }[];
  max: number;
}) {
  if (rows.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">データがまだありません。</p>;
  }

  const scale = Math.max(1, max);
  return (
    <ol className="space-y-3">
      {rows.map((row, index) => (
        <li key={row.key} className="min-w-0">
          <div className="flex min-w-0 items-baseline justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
              <span className="truncate font-medium">{row.label}</span>
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums">{row.valueLabel}</span>
          </div>
          <div aria-hidden="true" className="mt-1.5 h-2 bg-muted">
            <div className="h-full bg-accent" style={{ width: `${Math.max(row.value > 0 ? 2 : 0, (row.value / scale) * 100)}%` }} />
          </div>
          <p className="mt-1 text-right font-mono text-[10px] text-muted-foreground">{row.detail}</p>
        </li>
      ))}
    </ol>
  );
}

function HourlyTrend({
  rows,
  metric,
  onMetricChange,
}: {
  rows: EventAnalytics["byHour"];
  metric: TrendMetric;
  onMetricChange: (metric: TrendMetric) => void;
}) {
  const valueFor = (row: EventAnalytics["byHour"][number]) => row[metric];
  const values = rows.map(valueFor);
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(1, ...values);
  const peak = getPeak(rows, valueFor);

  const width = 960;
  const height = 220;
  const left = 12;
  const right = width - 12;
  const top = 14;
  const baseline = height - 14;
  const chartHeight = baseline - top;
  const coords = rows.map((row, index) => ({
    ...row,
    x: rows.length <= 1 ? width / 2 : left + (index / (rows.length - 1)) * (right - left),
    y: baseline - (valueFor(row) / max) * chartHeight,
  }));
  const linePath = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const areaPath = coords.length
    ? `${linePath} L${coords[coords.length - 1]!.x.toFixed(1)},${baseline} L${coords[0]!.x.toFixed(1)},${baseline} Z`
    : "";
  const tickX = (hour: number) => left + (hour / 23) * (right - left);
  const metricLabel = trendMetrics.find((entry) => entry.key === metric)!.label;
  const format = (value: number) => metricValue(value, metric);

  return (
    <section aria-labelledby="event-hourly-trend-title" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 id="event-hourly-trend-title" className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest">
          <Activity aria-hidden="true" className="h-4 w-4" />
          時間帯別の動き
        </h3>
        <div role="group" aria-label="グラフで表示する指標" className="flex flex-wrap gap-1">
          {trendMetrics.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={metric === option.key}
              onClick={() => onMetricChange(option.key)}
              className={`min-h-8 border-thin px-2 font-mono text-[10px] font-bold transition-colors focus-visible:border-heavy focus-visible:outline-none ${
                metric === option.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[10px] text-muted-foreground">
        <span>全期間を日本時間で集計 · アカウントは作成時刻、注文と売上は注文時刻</span>
        <span>
          合計 <strong className="font-mono text-foreground">{format(total)}</strong>
          {peak && valueFor(peak) > 0 && (
            <> / ピーク <strong className="font-mono text-foreground">{hourLabel(peak.hour)} · {format(valueFor(peak))}</strong></>
          )}
        </span>
      </p>

      {total === 0 ? (
        <div className="flex h-48 items-center justify-center bg-muted/30 text-xs text-muted-foreground">
          この指標の記録はまだありません。
        </div>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            className="h-48 w-full overflow-visible text-accent sm:h-56"
          >
            {[0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = baseline - ratio * chartHeight;
              return <line key={ratio} x1={left} x2={right} y1={y} y2={y} className="stroke-border" strokeDasharray="3 7" strokeWidth="1" />;
            })}
            <path d={areaPath} fill="currentColor" fillOpacity="0.1" />
            <path d={linePath} fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round" strokeWidth="3" />
            {coords.map((point) => (
              <circle
                key={point.hour}
                cx={point.x}
                cy={point.y}
                r={peak?.hour === point.hour ? 5 : 2.5}
                fill="currentColor"
              >
                <title>{hourLabel(point.hour)}: {format(valueFor(point))}</title>
              </circle>
            ))}
            {[0, 6, 12, 18, 23].map((hour) => (
              <line key={hour} x1={tickX(hour)} x2={tickX(hour)} y1={baseline} y2={baseline + 4} className="stroke-border" strokeWidth="1" />
            ))}
          </svg>
          <div aria-hidden="true" className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
            {[0, 6, 12, 18, 23].map((hour) => <span key={hour}>{hourLabel(hour)}</span>)}
          </div>
        </>
      )}

      <table className="sr-only">
        <caption>時間帯別{metricLabel}。全期間、日本時間で集計。</caption>
        <thead><tr><th scope="col">時刻</th><th scope="col">{metricLabel}</th></tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.hour}><th scope="row">{hourLabel(row.hour)}</th><td>{format(valueFor(row))}</td></tr>)}
        </tbody>
      </table>
    </section>
  );
}

export function AnalyticsTab({ eventId, eventName }: { eventId: string; eventName?: string }) {
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("visitors");
  const analyticsQuery = useQuery({
    queryKey: ["event-analytics", eventId],
    queryFn: () => eventApi.analytics(eventId),
    enabled: !!eventId,
  });
  const behaviorQuery = useQuery({
    queryKey: ["event-behavior", eventId],
    queryFn: () => eventApi.behavior(eventId),
    enabled: !!eventId,
  });

  if (analyticsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24" />)}
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (analyticsQuery.isError) {
    return <ErrorState error={analyticsQuery.error} onRetry={() => analyticsQuery.refetch()} />;
  }
  if (!analyticsQuery.data) {
    return <EmptyState icon={BarChart3} message="統計データがありません" />;
  }

  const analytics = analyticsQuery.data;
  const totals = analytics.totals;
  const behavior = behaviorQuery.data;
  const ageAnswerCount = analytics.ageBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const ageUnansweredCount = Math.max(0, totals.visitorProfiles - ageAnswerCount);
  const ageCoverage = totals.visitorProfiles ? Math.round((ageAnswerCount / totals.visitorProfiles) * 100) : 0;
  const maxAgeCount = Math.max(1, ...analytics.ageBuckets.map((bucket) => bucket.count));
  const topAgeGroup = [...analytics.ageBuckets].sort((a, b) => b.count - a.count)[0];
  const activityPeak = behavior ? getPeak(behavior.byHour, (row) => row.activeUsers) : undefined;
  const salesPeak = getPeak(analytics.byHour, (row) => row.revenue);
  const maxMenuQuantity = Math.max(1, ...analytics.menuRanking.map((menu) => menu.quantity));
  const maxCircleRevenue = Math.max(1, ...analytics.circleRanking.map((circle) => circle.revenue));
  const maxPaymentRevenue = Math.max(1, ...analytics.paymentBreakdown.map((payment) => payment.revenue));
  const averageOrderValue = totals.orders ? Math.round(totals.revenue / totals.orders) : 0;
  const isFetching = analyticsQuery.isFetching || behaviorQuery.isFetching;
  const refreshAll = () => {
    void Promise.all([analyticsQuery.refetch(), behaviorQuery.refetch()]);
  };

  const menuRows = analytics.menuRanking.slice(0, 5).map((menu) => ({
    key: menu.menuName,
    label: menu.menuName,
    value: menu.quantity,
    valueLabel: `${integer(menu.quantity)}個`,
    detail: `売上 ${yen(menu.revenue)}`,
  }));
  const paymentRows = analytics.paymentBreakdown.slice(0, 5).map((payment) => ({
    key: payment.method,
    label: payment.method,
    value: payment.revenue,
    valueLabel: yen(payment.revenue),
    detail: `${integer(payment.orders)}件 · 売上構成 ${totals.revenue ? Math.round((payment.revenue / totals.revenue) * 100) : 0}%`,
  }));
  const circleRows = analytics.circleRanking.slice(0, 6).map((circle) => ({
    key: circle.circleId,
    label: circle.name || "名称未設定",
    value: circle.revenue,
    valueLabel: yen(circle.revenue),
    detail: `${integer(circle.orders)}注文 · ${circle.avgRating == null ? "評価なし" : `★${circle.avgRating} / ${circle.reviews}件`}`,
  }));

  return (
    <div className="space-y-6 text-foreground">
      <header className="flex flex-col gap-4 border-b-thick border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <BarChart3 aria-hidden="true" className="h-4 w-4" />
            AFTER EVENT REVIEW
          </p>
          <h2 className="text-xl font-bold sm:text-2xl">開催後の振り返り</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {eventName ? `${eventName}の` : ""}開催期間全体を集計し、来場・売上・人気メニュー・行動の傾向を振り返る画面です。
          </p>
          <p className="mt-1 max-w-2xl text-[10px] leading-4 text-muted-foreground">
            開催中の混雑やスタッフ配置は「開催中の混雑・人員配置」を確認してください。このレポートは自動更新せず、必要に応じて更新します。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            onClick={() => downloadCsv(eventName || "event", analytics)}
            className="inline-flex min-h-10 items-center justify-center gap-2 border-thick border-border bg-background px-3 font-mono text-[10px] font-bold uppercase tracking-wider hover:bg-muted focus-visible:border-heavy focus-visible:outline-none"
            title="統計データをCSVで書き出す"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            CSV
          </button>
          <button
            type="button"
            onClick={refreshAll}
            disabled={isFetching}
            className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 border-thick border-border bg-background px-3 font-mono text-[10px] font-bold uppercase tracking-wider hover:bg-muted focus-visible:border-heavy focus-visible:outline-none disabled:cursor-wait disabled:opacity-60 sm:col-span-1"
          >
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            更新
          </button>
        </div>
      </header>

      <section aria-label="イベントの主要指標" className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4 lg:gap-x-6">
        <StatCard
          label="登録アカウント"
          value={`${integer(totals.visitors)}件`}
          note={`受付登録完了 ${integer(totals.onboarded)}件 · ${totals.onboardedRate}%`}
          icon={Users}
          accent
        />
        <StatCard
          label="来場プロフィール"
          value={`${integer(totals.visitorProfiles)}件`}
          note="家族を含む · 有効バンド/単独登録プロフィール"
          icon={Users}
        />
        <StatCard
          label="売上"
          value={yen(totals.revenue)}
          note={`キャンセルを除く ${integer(totals.orders)}注文`}
          icon={Coins}
        />
        <StatCard
          label="注文"
          value={`${integer(totals.orders)}件`}
          note={`完了率 ${totals.completedRate}% · 平均注文額 ${yen(averageOrderValue)}`}
          icon={Receipt}
        />
      </section>

      <section aria-label="注目データ" className="grid grid-cols-2 gap-x-4 gap-y-3 border-y-thin border-border py-4 lg:grid-cols-4 lg:gap-6">
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">来場アカウントの行動ピーク</p>
          <p className="mt-1 font-mono text-sm font-bold tabular-nums">
            {activityPeak && activityPeak.activeUsers > 0 ? `${hourLabel(activityPeak.hour)} · ${integer(activityPeak.activeUsers)}アカウント` : behaviorQuery.isLoading ? "読込中" : "記録なし"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">売上のピーク</p>
          <p className="mt-1 font-mono text-sm font-bold tabular-nums">
            {salesPeak && salesPeak.revenue > 0 ? `${hourLabel(salesPeak.hour)} · ${yen(salesPeak.revenue)}` : "記録なし"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">最多の年代</p>
          <p className="mt-1 truncate font-mono text-sm font-bold">
            {topAgeGroup ? `${topAgeGroup.label} · ${integer(topAgeGroup.count)}人` : "年代データなし"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">人気メニュー</p>
          <p className="mt-1 truncate font-mono text-sm font-bold">
            {analytics.menuRanking[0] ? `${analytics.menuRanking[0].menuName} · ${integer(analytics.menuRanking[0].quantity)}個` : "注文データなし"}
          </p>
        </div>
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.85fr)]">
        <HourlyTrend rows={analytics.byHour} metric={trendMetric} onMetricChange={setTrendMetric} />

        <section aria-labelledby="event-age-title" className="min-w-0">
          <SectionTitle
            id="event-age-title"
            label="年代構成"
            note={ageAnswerCount ? `年齢登録あり ${integer(ageAnswerCount)} / ${integer(totals.visitorProfiles)}プロフィール · 回答率 ${ageCoverage}%` : "年齢回答なし"}
          />
          {analytics.ageBuckets.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">年代データがまだありません。</p>
          ) : (
            <div className="space-y-3">
              {analytics.ageBuckets.map((bucket) => {
                const share = ageAnswerCount ? Math.round((bucket.count / ageAnswerCount) * 100) : 0;
                return (
                  <div key={bucket.label} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-bold">{bucket.label}</span>
                      <span className="shrink-0 font-mono tabular-nums">
                        {integer(bucket.count)}人 <span className="text-muted-foreground">({share}%)</span>
                      </span>
                    </div>
                    <div aria-hidden="true" className="mt-1 h-2 bg-muted">
                      <div className="h-full bg-foreground/80" style={{ width: `${(bucket.count / maxAgeCount) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="border-t-thin border-border pt-2 text-[10px] leading-4 text-muted-foreground">
                年代は各有効バンドの申告年齢です。未回答 {integer(ageUnansweredCount)}人。注文・回遊はアカウント単位で家族間共有されるため、年代別には割り振らずイベント全体で表示します。
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <section aria-labelledby="event-order-title" className="min-w-0">
          <SectionTitle
            id="event-order-title"
            label="注文の内訳"
            note={`平均注文額 ${yen(averageOrderValue)} · 注文時の延べ人数 ${integer(totals.customers)}人`}
          />
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">人気メニュー · 個数</h4>
              <RankingBars rows={menuRows} max={maxMenuQuantity} />
            </div>
            <div>
              <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">支払い方法 · 売上</h4>
              <RankingBars rows={paymentRows} max={maxPaymentRevenue} />
            </div>
          </div>
        </section>

        <section aria-labelledby="event-circulation-title" className="min-w-0">
          <SectionTitle id="event-circulation-title" label="回遊とサークル接点" note="来場者の行動記録から集計" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] text-muted-foreground">訪問記録</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums">{integer(totals.circleVisits)}回</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">訪問記録のあるアカウント</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums">{integer(totals.visitingUsers)}件</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">注文アカウント</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums">{behavior ? `${integer(behavior.journey.buyers)}件` : behaviorQuery.isLoading ? "読込中" : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">複数サークル接点率</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums">{behavior ? `${behavior.journey.multiCircleRate}%` : "—"}</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            来場アカウント数はアカウント単位です。平均 {behavior ? behavior.journey.avgCirclesPerVisitor : "—"} サークルに接点（注文・訪問・スタンプの記録）し、回遊の流れは記録された連続訪問の組み合わせです。
          </p>
          <div className="mt-4 border-t-thin border-border pt-3">
            <h4 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">よくある回遊</h4>
            {behaviorQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">行動データを読み込んでいます。</p>
            ) : behaviorQuery.isError ? (
              <p className="text-xs text-muted-foreground">回遊の詳細を取得できませんでした。</p>
            ) : !behavior?.topTransitions.length ? (
              <p className="text-xs text-muted-foreground">2サークル以上を続けて訪れた記録が集まると表示されます。</p>
            ) : (
              <ol className="space-y-2">
                {behavior.topTransitions.slice(0, 5).map((transition, index) => (
                  <li key={`${transition.from}-${transition.to}`} className="flex min-w-0 items-center justify-between gap-3 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="w-4 shrink-0 font-mono text-[10px] text-muted-foreground">{index + 1}.</span>
                      <span className="truncate">{transition.from}</span>
                      <ArrowRight aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{transition.to}</span>
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">{integer(transition.count)}回</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      <section aria-labelledby="event-circle-ranking-title" className="min-w-0">
        <SectionTitle id="event-circle-ranking-title" label="サークル別の実績" note={`売上上位 ${Math.min(6, analytics.circleRanking.length)} / ${integer(totals.circles)}サークル`} />
        {analytics.circleRanking.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">サークルの販売実績がまだありません。</p>
        ) : (
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            {circleRows.map((row, index) => (
              <div key={row.key} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                    <span className="truncate font-medium">{row.label}</span>
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">{row.valueLabel}</span>
                </div>
                <div aria-hidden="true" className="mt-1.5 h-2 bg-muted">
                  <div className="h-full bg-accent" style={{ width: `${Math.max(row.value > 0 ? 2 : 0, (row.value / maxCircleRevenue) * 100)}%` }} />
                </div>
                <p className="mt-1 text-right font-mono text-[10px] text-muted-foreground">{row.detail}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t-thin border-border pt-3 text-[10px] leading-4 text-muted-foreground">
        来場登録数・注文者数・回遊はアカウント単位です。年代は有効なリストバンドごとのプロフィールを家族分も含めて集計し、アカウントにバンドがない場合はアカウントの申告年齢を1件として扱います。家族で注文を共有するため、注文・売上を年代別には配賦しません。売上・注文はキャンセルを除外し、注文完了率は完了済みの注文数から計算しています。時間帯は日本時間で、全開催日の同じ時刻を合算しています。
        {behaviorQuery.isError && (
          <span className="mt-1 block">
            回遊・注文者の補足データを取得できませんでした。{" "}
            <a href="/event/dashboard?tab=behavior" className="underline underline-offset-2 hover:text-foreground">行動分析を開く</a>
          </span>
        )}
      </footer>
    </div>
  );
}
