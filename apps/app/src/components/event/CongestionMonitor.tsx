import { useMemo, useState } from "react";
import { Circle, Clock3, Gauge, RadioTower, Store } from "lucide-react";
import { activeWaitTimeReport, recentWaitTimeReports, type Circle as CircleRecord, type WaitTimeReport } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";

type RangeKey = "30m" | "2h" | "6h" | "24h" | "all";
type ReportPoint = WaitTimeReport & { timestamp: number };
type TrendBucket = { start: number; reports: ReportPoint[]; average: number; maximum: number };

const RANGE_OPTIONS: { key: RangeKey; label: string; durationMs: number | null }[] = [
  { key: "30m", label: "30分", durationMs: 30 * 60_000 },
  { key: "2h", label: "2時間", durationMs: 2 * 60 * 60_000 },
  { key: "6h", label: "6時間", durationMs: 6 * 60 * 60_000 },
  { key: "24h", label: "24時間", durationMs: 24 * 60 * 60_000 },
  { key: "all", label: "全履歴", durationMs: null },
];

function formatTime(timestamp: number, withDate = false) {
  return new Intl.DateTimeFormat("ja-JP", withDate
    ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function formatAge(minutesAgo: number) {
  return minutesAgo < 1 ? "たった今" : `${minutesAgo}分前`;
}

function pathFor(values: TrendBucket[], field: "average" | "maximum", start: number, end: number, top: number, bottom: number, scale: number) {
  let segments: TrendBucket[][] = [];
  for (const bucket of values) {
    if (bucket.reports.length === 0) {
      if (segments.at(-1)?.length === 0) continue;
      segments.push([]);
    } else {
      if (!segments.length || segments.at(-1)!.length === 0) segments.push([]);
      segments.at(-1)!.push(bucket);
    }
  }
  return segments.filter((segment) => segment.length > 0).map((segment) => {
    const points = segment.map((bucket) => {
      const index = values.indexOf(bucket);
      const x = start + (index / Math.max(1, values.length - 1)) * (end - start);
      const y = bottom - (bucket[field] / scale) * (bottom - top);
      return `${x},${y}`;
    });
    return { d: points.map((point, index) => `${index === 0 ? "M" : "L"}${point}`).join(" ") };
  });
}

export function CongestionMonitor({
  circles,
  isLoading,
  isError,
  error,
  onRetry,
}: {
  circles?: CircleRecord[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const [range, setRange] = useState<RangeKey>("2h");
  const [showAllCircles, setShowAllCircles] = useState(false);

  const now = Date.now();
  const circleReports = useMemo(() => (circles ?? []).map((circle) => {
    const active = activeWaitTimeReport(circle.settings);
    const current = active && active.minutes >= 0 && active.minutes <= 240 ? active : null;
    return {
      id: circle.id,
      name: circle.name,
      current,
      history: recentWaitTimeReports(circle.settings, 500).map((report) => ({
        ...report,
        timestamp: Date.parse(report.reportedAt),
      })),
    };
  }), [circles]);

  const allReports = circleReports.flatMap((circle) => circle.history);
  const rangeDuration = RANGE_OPTIONS.find((option) => option.key === range)?.durationMs ?? null;
  const firstHistoryAt = allReports.reduce((first, report) => Math.min(first, report.timestamp), now);
  const rangeStart = rangeDuration === null ? firstHistoryAt : now - rangeDuration;
  // 2026-10-16: 過去の待ち時間は継続値ではなく報告時点のサンプルとして扱い、空白区間を線で補間しない。
  const selectedReports = allReports.filter((report) => report.timestamp >= rangeStart && report.timestamp <= now);
  const trend = useMemo<TrendBucket[]>(() => {
    const bucketCount = 12;
    const duration = Math.max(1, now - rangeStart);
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({
      start: rangeStart + (duration * index) / bucketCount,
      reports: [] as ReportPoint[],
      average: 0,
      maximum: 0,
    }));
    for (const report of selectedReports) {
      const index = Math.min(bucketCount - 1, Math.floor(((report.timestamp - rangeStart) / duration) * bucketCount));
      buckets[index].reports.push(report);
    }
    for (const bucket of buckets) {
      if (bucket.reports.length === 0) continue;
      bucket.average = Math.round(bucket.reports.reduce((sum, report) => sum + report.minutes, 0) / bucket.reports.length);
      bucket.maximum = bucket.reports.reduce((maximum, report) => Math.max(maximum, report.minutes), 0);
    }
    return buckets;
  }, [now, rangeStart, selectedReports]);

  const activeCircles = circleReports
    .filter((circle) => circle.current)
    .sort((a, b) => b.current!.minutes - a.current!.minutes || a.name.localeCompare(b.name, "ja"));
  const currentAverage = activeCircles.length > 0
    ? Math.round(activeCircles.reduce((sum, circle) => sum + circle.current!.minutes, 0) / activeCircles.length)
    : null;
  const currentMaximum = activeCircles.reduce<number | null>((maximum, circle) =>
    maximum === null ? circle.current!.minutes : Math.max(maximum, circle.current!.minutes), null);
  const chartScale = Math.max(10, Math.ceil(Math.max(0, ...trend.map((bucket) => bucket.maximum)) / 10) * 10);
  const averagePaths = pathFor(trend, "average", 60, 880, 22, 216, chartScale);
  const maximumPaths = pathFor(trend, "maximum", 60, 880, 22, 216, chartScale);
  const historySpanMs = Math.max(0, now - rangeStart);
  const withDate = historySpanMs >= 24 * 60 * 60_000;
  const sortedCircles = circleReports.slice().sort((a, b) =>
    (b.current?.minutes ?? -1) - (a.current?.minutes ?? -1) || a.name.localeCompare(b.name, "ja"));
  const topCircles = showAllCircles ? sortedCircles : sortedCircles.slice(0, 6);

  return (
    <section className="space-y-4 border-b-thick border-border pb-6" aria-labelledby="congestion-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Crowd overview</p>
          <h2 id="congestion-title" className="mt-1 flex items-center gap-2 text-lg font-bold">
            <Gauge className="h-5 w-5" /> 混雑モニター
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            店舗から報告された待ち時間を集計しています。30分以内の報告を現在値として表示します。
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">報告推移の期間</p>
          <div className="flex flex-wrap gap-1" role="group" aria-label="待ち時間報告の表示期間">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.key}
                type="button"
                size="sm"
                variant={range === option.key ? "default" : "outline"}
                aria-pressed={range === option.key}
                onClick={() => setRange(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : isLoading ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y-thin border-border py-4 xl:grid-cols-4">
            <SummaryMetric icon={RadioTower} label="現在報告中" value={`${activeCircles.length} / ${circles?.length ?? 0}`} unit="店舗" detail="30分以内に報告" />
            <SummaryMetric icon={Clock3} label="平均待ち時間" value={currentAverage === null ? "—" : `約${currentAverage}`} unit={currentAverage === null ? "" : "分"} detail="報告中の店舗" />
            <SummaryMetric
              icon={Store}
              label="最長待ち時間"
              value={currentMaximum === null ? "—" : `約${currentMaximum}`}
              unit={currentMaximum === null ? "" : "分"}
              detail={activeCircles.find((circle) => circle.current?.minutes === currentMaximum)?.name ?? "現在値なし"}
            />
            <SummaryMetric icon={Circle} label="期間内報告" value={selectedReports.length.toLocaleString("ja-JP")} unit="件" detail={RANGE_OPTIONS.find((option) => option.key === range)?.label ?? ""} />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
            <section aria-labelledby="wait-trend-title" className="min-w-0">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 id="wait-trend-title" className="text-sm font-bold">待ち時間の推移</h3>
                  <p className="text-[10px] text-muted-foreground">報告があった時間帯の平均と最大値</p>
                </div>
                <div className="flex gap-3 font-mono text-[10px]" aria-label="グラフの凡例">
                  <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-info" />平均</span>
                  <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-foreground/50" />最大</span>
                </div>
              </div>
              {selectedReports.length === 0 ? (
                <EmptyState icon={Clock3} message="選択期間の待ち時間報告はありません" />
              ) : (
                <div className="border-t-thin border-border pt-2">
                  <svg viewBox="0 0 920 260" preserveAspectRatio="none" className="h-52 w-full sm:h-64" role="img" aria-label={`待ち時間推移。平均 ${selectedReports.length} 件の報告を集計。期間 ${RANGE_OPTIONS.find((option) => option.key === range)?.label}`}>
                    {[0, 1, 2, 3, 4].map((step) => {
                      const y = 22 + (194 * step) / 4;
                      const minutes = Math.round(chartScale * (4 - step) / 4);
                      return (
                        <g key={step}>
                          <line x1="60" x2="880" y1={y} y2={y} className="stroke-border/30" strokeDasharray={step === 4 ? undefined : "3 5"} />
                          <text x="52" y={y + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{minutes}</text>
                        </g>
                      );
                    })}
                    {averagePaths.map((path, index) => <path key={`avg-${index}`} d={path.d} fill="none" className="stroke-info" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}
                    {maximumPaths.map((path, index) => <path key={`max-${index}`} d={path.d} fill="none" className="stroke-foreground/50" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />)}
                    {trend.map((bucket, index) => {
                      if (bucket.reports.length === 0) return null;
                      const x = 60 + (index / Math.max(1, trend.length - 1)) * 820;
                      const avgY = 216 - (bucket.average / chartScale) * 194;
                      const maxY = 216 - (bucket.maximum / chartScale) * 194;
                      const sampleLabel = `${formatTime(bucket.start, withDate)} · ${bucket.reports.length}件 · 平均${bucket.average}分 · 最大${bucket.maximum}分`;
                      return (
                        <g key={bucket.start}>
                          <circle cx={x} cy={maxY} r="4" className="fill-background stroke-foreground/60" strokeWidth="2"><title>{sampleLabel}</title></circle>
                          <circle cx={x} cy={avgY} r="4.5" className="fill-info stroke-background" strokeWidth="2"><title>{sampleLabel}</title></circle>
                        </g>
                      );
                    })}
                    <text x="60" y="246" textAnchor="start" className="fill-muted-foreground font-mono text-[10px]">{formatTime(rangeStart, withDate)}</text>
                    <text x="880" y="246" textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{formatTime(now, withDate)}</text>
                    <text x="14" y="120" textAnchor="middle" transform="rotate(-90 14 120)" className="fill-muted-foreground font-mono text-[10px]">待ち時間（分）</text>
                  </svg>
                  <p className="text-[10px] text-muted-foreground">各点は報告値の集計です。報告がない時間帯は線でつないでいません。</p>
                </div>
              )}
            </section>

            <section aria-labelledby="current-wait-title" className="min-w-0">
              <div className="mb-2 flex items-end justify-between gap-2">
                <div>
                  <h3 id="current-wait-title" className="text-sm font-bold">店舗別の現在値</h3>
                  <p className="text-[10px] text-muted-foreground">待ち時間の長い順 · 30分以内の報告</p>
                </div>
                {circleReports.length > 6 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAllCircles((value) => !value)}>
                    {showAllCircles ? "上位6件" : `全店舗 ${circleReports.length}`}
                  </Button>
                )}
              </div>
              {circleReports.length === 0 ? (
                <EmptyState icon={Store} message="登録店舗がありません" />
              ) : (
                <div className="divide-y divide-border border-y-thin border-border">
                  {topCircles.map((circle) => (
                    <div key={circle.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate text-xs font-semibold" title={circle.name}>{circle.name}</span>
                      {circle.current ? (
                        <span className="shrink-0 text-right">
                          <span className="block font-mono text-sm font-bold tabular-nums">約{circle.current.minutes}分</span>
                          <span className="block font-mono text-[9px] text-muted-foreground">{formatAge(circle.current.minutesAgo)}</span>
                        </span>
                      ) : (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">未報告</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          <p className="text-[10px] text-muted-foreground">
            「全履歴」は各店舗の直近500件までです。現在値は30分を過ぎると集計から外れます。
          </p>
        </>
      )}
    </section>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  unit,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  unit: string;
  detail: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-mono text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-1 font-headline text-[25px] leading-none tabular-nums">{value}<span className="ml-1 font-body text-xs font-normal">{unit}</span></div>
      <div className="mt-1 truncate font-mono text-[9px] text-muted-foreground" title={detail}>{detail}</div>
    </div>
  );
}
