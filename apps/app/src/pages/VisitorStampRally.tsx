import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ExternalLink, MapPin, Ticket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useVisitor } from "@/hooks/useVisitor";
import { stampRallyApi, type StampRallyCircle } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/asset-url";

function safeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function dateLabel(value: string | null): string {
  if (!value) return "受取完了";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "受取完了";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// 2026-10-15 (#123): 対象エリアを切替式にし、店舗ごとの注文詳細と景品案内を短く確認できるようにする。
export default function VisitorStampRallyPage() {
  const navigate = useNavigate();
  const { userId, isLoaded } = useVisitor();
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedCircle, setSelectedCircle] = useState<StampRallyCircle | null>(null);
  const query = useQuery({
    queryKey: ["visitor-stamp-rally", userId],
    queryFn: () => stampRallyApi.visitor(userId!),
    enabled: !!userId,
    // 2026-10-19: 店舗で受取処理が完了した後も来場者が画面を開いたまま確認できるよう、
    // 別端末で追加されたスタンプと交換枠を定期的に取り直す。
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const data = query.data;
  const stampedCount = data?.stampedCount ?? 0;
  const requiredCount = data?.requiredCount ?? 0;
  const areaRequirement = data?.qualification.minQualifiedAreaCount ?? null;
  const areaRequirementActive = areaRequirement !== null;
  const qualifiedAreaCount = data?.qualification.qualifiedAreaCount ?? 0;
  const totalStoreRequirement = data?.qualification.minTotalDistinctCircles ?? (areaRequirementActive ? null : requiredCount);
  const rulesUrl = data?.rulesUrl ? safeHttpUrl(data.rulesUrl) : null;

  if (!isLoaded || query.isLoading) {
    return <div className="max-w-2xl mx-auto p-4 space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-56 w-full" /></div>;
  }

  return (
    <main className="max-w-2xl mx-auto p-4 pb-24 space-y-4">
      <button onClick={() => navigate("/visitor/mypage")} className="min-h-11 inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2 hover:text-info">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />マイQRに戻る
      </button>
      <header className="border-b-thick border-border pb-3">
        <h1 className="text-xl font-black uppercase flex items-center gap-2"><Ticket className="h-5 w-5" aria-hidden="true" />スタンプラリー</h1>
        <p className="text-xs text-muted-foreground mt-1">注文を受け取ると店舗にスタンプが付き、条件を達成すると景品と交換できます。</p>
      </header>

      {query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : null}
      {!query.isError && (!data?.enabled || data.areas.length === 0) ? (
        <EmptyState icon={Ticket} message="このイベントではスタンプラリーを実施していません" />
      ) : null}

      {!query.isError && data?.enabled && data.areas.length > 0 && (
        <>
          <section className={`border-heavy border-border p-3 space-y-2 ${data.eligible && data.remainingCount > 0 ? "bg-primary text-primary-foreground" : "bg-muted"}`} aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-black">
                  {data.familyMemberCount === 0
                    ? "リストバンドを登録してください"
                    : data.remainingCount === 0
                      ? "家族の交換枠を利用済み"
                      : data.eligible
                        ? "景品交換できます"
                        : "景品交換まであと少し"}
                </h2>
                <p className={`text-xs mt-1 ${data.eligible && data.remainingCount > 0 ? "text-primary-foreground/85" : "text-muted-foreground"}`}>
                  {data.legacy
                    ? "エリアごとの条件で達成判定"
                    : areaRequirementActive
                      ? `達成エリア ${qualifiedAreaCount} / ${areaRequirement} エリア`
                      : `利用店舗 ${stampedCount} / ${requiredCount} 店舗`}
                </p>
                {!data.legacy && areaRequirementActive && totalStoreRequirement !== null && (
                  <p className="text-[10px] mt-0.5 text-muted-foreground">合計利用店舗 {stampedCount} / {totalStoreRequirement} 店舗</p>
                )}
              </div>
              <span className="text-xl font-black tabular-nums shrink-0">{data.legacy
                ? (data.eligible ? "達成" : "—")
                : areaRequirementActive
                  ? <>{Math.min(qualifiedAreaCount, areaRequirement)}<span className="text-xs"> / {areaRequirement}</span></>
                  : <>{Math.min(stampedCount, requiredCount)}<span className="text-xs"> / {requiredCount}</span></>}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t-thin border-current/40 pt-2 text-center">
              <div><p className="text-[10px] opacity-80">家族</p><p className="font-black tabular-nums">{data.familyMemberCount}人</p></div>
              <div><p className="text-[10px] opacity-80">交換済み</p><p className="font-black tabular-nums">{data.redeemedCount}個</p></div>
              <div><p className="text-[10px] opacity-80">あと交換できる数</p><p className="font-black tabular-nums">{data.remainingCount}個</p></div>
            </div>
            {data.eligible && data.remainingCount > 0 && (
              <div className="border-t-thin border-current/40 pt-2 space-y-1">
                <p className="font-bold text-sm">交換できる景品</p>
                <p className="text-xs">{data.rewards.map((reward) => reward.name).join("・")}</p>
                {data.redemptionLocation && <p className="text-xs leading-relaxed whitespace-pre-wrap">{data.redemptionLocation}</p>}
                <p className="text-[10px] opacity-80">景品交換所でこの画面を提示してください。</p>
              </div>
            )}
            {data.redeemedAt && <p className="border-t-thin border-current/40 pt-2 text-[10px]">最終交換記録: {dateLabel(data.redeemedAt)}</p>}
            {rulesUrl && (
              <a href={rulesUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] underline underline-offset-2">
                ルールを確認 <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </section>

          {data.areas.length > 1 && (
            <nav className="flex flex-wrap gap-2" aria-label="会場エリアへの移動">
              {data.areas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  aria-controls={`stamp-area-${area.id}`}
                  aria-current={(selectedAreaId ?? data.areas[0]?.id) === area.id ? "location" : undefined}
                  onClick={() => {
                    setSelectedAreaId(area.id);
                    document.getElementById(`stamp-area-${area.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`border-thick border-border px-3 py-2 text-xs font-bold ${(selectedAreaId ?? data.areas[0]?.id) === area.id ? "bg-primary text-primary-foreground" : "bg-background"}`}
                >
                  {area.name} <span className="opacity-75">{area.circles.filter((circle) => circle.stamped).length}/{area.requiredCount ?? area.circles.length}</span>
                </button>
              ))}
            </nav>
          )}

          {/* 2026-10-16: 全エリアを縦に並べ、会場ボタンは一覧内への移動に使う。 */}
          <div className="space-y-4">
            {data.areas.map((area) => (
              <section key={area.id} id={`stamp-area-${area.id}`} className="scroll-mt-4 border-thick border-border p-3 space-y-3" aria-labelledby={`stamp-area-heading-${area.id}`}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 id={`stamp-area-heading-${area.id}`} className="text-base font-black flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden="true" />{area.name}</h2>
                    <p className="text-[10px] text-muted-foreground mt-0.5">スタンプをタップすると注文内容を確認できます。</p>
                  </div>
                  <p className="shrink-0 text-xs font-black tabular-nums">
                    {area.circles.filter((circle) => circle.stamped).length} / {area.requiredCount ?? area.circles.length}
                  </p>
                </div>
                {area.circles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">このエリアに登録された店舗はありません。</p>
                ) : (
                  <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2" aria-label={`${area.name}のスタンプ`}>
                    {area.circles.map((circle) => (
                    <li key={circle.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedCircle(circle)}
                        aria-label={`${circle.name}: ${circle.stamped ? "利用済み。注文内容を確認" : "未利用"}`}
                        className={`w-full text-center ${circle.stamped ? "" : "opacity-50 grayscale"}`}
                      >
                        <span className={`relative aspect-square border-thick border-border bg-background p-1 flex items-center justify-center ${circle.stamped ? "" : "border-dashed"}`}>
                          {circle.iconImagePath ? (
                            <img src={resolveAssetUrl(circle.iconImagePath)} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[10px] font-black break-all">{circle.name}</span>
                          )}
                          {circle.stamped && <CheckCircle2 className="absolute right-0.5 top-0.5 h-4 w-4 bg-background" aria-hidden="true" />}
                        </span>
                        <span className="block mt-1 text-[10px] font-bold leading-tight break-words">{circle.name}</span>
                        <span className="block text-[9px] uppercase text-muted-foreground">{circle.stamped ? "利用済み" : "未利用"}</span>
                      </button>
                    </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}

      <Modal
        isOpen={!!selectedCircle}
        onClose={() => setSelectedCircle(null)}
        title={`「${selectedCircle?.name ?? "店舗"}」の注文履歴`}
        subtitle="受取完了した注文と注文時点の商品名を表示しています。"
        maxWidth="md"
      >
        {selectedCircle?.stamped ? (
          selectedCircle.orders.length > 0 ? (
            <ul className="space-y-3">
              {selectedCircle.orders.map((order) => (
                <li key={`${order.orderNumber}-${order.createdAt}`} className="border-thin border-border p-3 space-y-2">
                  <div className="flex justify-between gap-3 text-[11px]">
                    <span className="font-bold">注文 #{order.orderNumber}</span>
                    <time className="text-muted-foreground text-right">{dateLabel(order.completedAt || order.createdAt)}</time>
                  </div>
                  {order.items.length ? (
                    <ul className="divide-y divide-border">
                      {order.items.map((item, index) => (
                        <li key={`${item.menuName}-${index}`} className="py-1.5 text-xs">
                          <div className="flex justify-between gap-3"><span>{item.menuName}</span><span className="shrink-0">×{item.quantity}</span></div>
                          {item.toppings.length > 0 && <p className="text-[10px] text-muted-foreground mt-0.5">+ {item.toppings.join("、")}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-[11px] text-muted-foreground">注文品の記録はありません。</p>}
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted-foreground">利用履歴の詳細はありません。</p>
        ) : <p className="text-xs text-muted-foreground">この店舗の受取完了注文はまだありません。</p>}
      </Modal>
    </main>
  );
}
