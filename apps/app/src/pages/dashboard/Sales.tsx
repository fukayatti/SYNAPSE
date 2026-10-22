import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAuthGuard, PermissionGuard, useAuth } from "@/hooks/useCircleAuth";
import { orderApi } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { ErrorState } from "@/components/ui/ErrorState";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSessionState } from "@/hooks/useSessionState";
import { queryCachePolicy } from "@/lib/query-cache-policy";
import { allocateOrderRevenueByItem } from "@/features/orders/sales-allocation";

// ローカルタイムの YYYY-MM-DD キー (日付ごとの集計・切り替えに使用)
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const formatDayLabel = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${m}月${d}日 (${weekday})`;
};

function SalesManagementContent() {
  // 2026-07-16: circleId/circleName を useState+useEffect(mount時一度きり) で
  // localStorage から固定読みしていたため、同一パス上でスペース切り替えをしても
  // 古いサークルの売上のまま表示され続けていた。useAuth() に統一し、
  // authChange イベントで即時反映されるようにする。
  const { circleId: authCircleId, circleName: authCircleName } = useAuth();
  const circleId = authCircleId ?? "";
  const circleName = authCircleName ?? "サークルダッシュボード";
  // 表示対象の日付 (日にちごとに切り替えながら見られるようにする)
  // 2026-10-21: レジ等へ移動して戻っても確認中の日付を保つ。
  const [selectedDate, setSelectedDate] = useSessionState<string>(`fesflow:sales-date:${circleId}`, "");
  // グラフ拡大モーダル用状態
  const [isChartExpanded, setIsChartExpanded] = useState(false);

  const {
    data: orders,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["orders", circleId],
    queryFn: () => orderApi.list(circleId),
    enabled: !!circleId,
    ...queryCachePolicy.live,
  });

  // 2026-10-22: 会計日と返金日を営業日一覧へ含め、別日の返金も照合できるようにする。
  const availableDates = Array.from(
    new Set((orders ?? []).flatMap((order) => [
      order.paidAt ?? order.createdAt,
      order.refund?.refundedAt ?? null,
    ])
      .filter((timestamp): timestamp is Date => timestamp != null)
      .map((timestamp) => dayKey(new Date(timestamp))))
  ).sort((a, b) => (a < b ? 1 : -1));

  // 2026-10-16: スペース切り替え後に前サークルの選択日が残ると、新しい注文があるのに空表示になる。
  // 選択日が現在の注文日一覧に含まれない場合は最新の営業日に戻す。
  useEffect(() => {
    if (availableDates.length === 0) {
      if (selectedDate) setSelectedDate("");
      return;
    }
    if (!availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);

  // 選択日の会計または返金に関係する注文を履歴へ表示する。
  const ordersForDay = (orders ?? []).filter(
    (order) => {
      const settlementDate = order.paidAt ?? order.createdAt;
      const matchesSettlement = settlementDate != null && dayKey(new Date(settlementDate)) === selectedDate;
      const matchesRefund = order.refund?.refundedAt != null && dayKey(new Date(order.refund.refundedAt)) === selectedDate;
      return matchesSettlement || matchesRefund;
    },
  );

  const currentIndex = availableDates.indexOf(selectedDate);
  const goPrevDay = () => {
    // availableDates は新しい順なので「前の日 (古い方)」は index+1
    if (currentIndex >= 0 && currentIndex < availableDates.length - 1) {
      setSelectedDate(availableDates[currentIndex + 1]);
    }
  };
  const goNextDay = () => {
    if (currentIndex > 0) setSelectedDate(availableDates[currentIndex - 1]);
  };

  // 2026-10-22: 入金は会計日、返金は返金日に計上し、純売上を照合可能にする。
  const settledOrders = (orders ?? []).filter((order) => {
    const settlementDate = order.paidAt ?? order.createdAt;
    return (order.paymentStatus === "paid" || order.paymentStatus === "refunded") &&
      settlementDate != null && dayKey(new Date(settlementDate)) === selectedDate;
  });
  const refundOrders = (orders ?? []).filter((order) =>
    order.refund?.refundedAt != null && dayKey(new Date(order.refund.refundedAt)) === selectedDate,
  );
  const recognizedOrders = settledOrders.filter((order) => order.paymentStatus === "paid");
  const grossSales = settledOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
  const refundAmount = refundOrders.reduce((sum, order) => sum + (order.refund?.amount || 0), 0);
  const netSales = grossSales - refundAmount;

  // 時間帯別 (9:00 - 18:00) の売上集計
  const hourlyData = Array.from({ length: 10 }, (_, i) => {
    const hour = i + 9;
    return {
      hour: `${hour}:00`,
      sales: 0,
      count: 0,
    };
  });

  settledOrders.forEach((order) => {
    const settledAt = order.paidAt ?? order.createdAt;
    if (!settledAt) return;
    const hour = new Date(new Date(settledAt).getTime() + 9 * 60 * 60 * 1000).getUTCHours();
    if (hour >= 9 && hour <= 18) {
      hourlyData[hour - 9].sales += order.totalPrice || 0;
      hourlyData[hour - 9].count += 1;
    }
  });

  const maxHourlySales = Math.max(...hourlyData.map((d) => d.sales), 1000);

  // 商品（メニュー）別の売上集計
  const itemSalesMap: Record<string, { name: string; sales: number; count: number }> = {};
  recognizedOrders.forEach((order) => {
    const items = order.items ?? [];
    const allocatedRevenue = allocateOrderRevenueByItem({ totalPrice: order.totalPrice, items });
    items.forEach((item, index) => {
      const menuName = item.menuName || "不明な商品";
      const itemTotalPrice = allocatedRevenue[index] ?? 0;
      if (!itemSalesMap[menuName]) {
        itemSalesMap[menuName] = { name: menuName, sales: 0, count: 0 };
      }
      itemSalesMap[menuName].sales += itemTotalPrice;
      itemSalesMap[menuName].count += item.quantity || 1;
    });
  });

  const menuSalesData = Object.values(itemSalesMap).sort((a, b) => b.sales - a.sales);
  const maxMenuSales = Math.max(...menuSalesData.map((d) => d.sales), 1000);

  // 時間帯別グラフ用 (SVG 座標)
  const svgWidth = 500;
  const svgHeight = 200;
  const padding = 35;
  const chartWidth = svgWidth - padding * 2;
  const chartHeight = svgHeight - padding * 2;

  const points = hourlyData.map((d, i) => {
    const x = padding + (i / (hourlyData.length - 1)) * chartWidth;
    const y = padding + chartHeight - (d.sales / maxHourlySales) * chartHeight;
    return { x, y, ...d };
  });

  const linePath = points.reduce(
    (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
    ""
  );

  if (isLoading) {
    return (
      <DashboardLayout title={circleName} subtitle="売上管理" type="circle">
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-32" />)}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (isError && orders === undefined) {
    return (
      <DashboardLayout title={circleName} subtitle="売上管理" type="circle">
        <ErrorState error={error} onRetry={() => refetch()} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={circleName} subtitle="売上管理" type="circle">
      <div className="space-y-8">
        {isError && <p role="status" className="border-thick border-warning bg-warning/10 p-3 text-xs">最新の注文を取得できません。前回取得した集計を表示しています。</p>}
        {/* 日付切り替えバー (日にちごとに売上を表示) */}
        <Card className="rounded-none shadow-none">
          <CardContent className="flex flex-col justify-between gap-4 p-5 font-mono sm:flex-row sm:items-center">
            <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">[表示する営業日]</span>
            {availableDates.length === 0 ? (
              <span className="text-sm text-muted-foreground">注文データがありません</span>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={goPrevDay}
                  disabled={currentIndex >= availableDates.length - 1}
                  className="h-10 w-10 p-0 border-thick border-border rounded-none"
                  aria-label="前の日"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="h-10 border-thick border-border rounded-none bg-background px-3 text-sm font-bold uppercase font-mono min-w-[160px] text-center"
                >
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {formatDayLabel(d)}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={goNextDay}
                  disabled={currentIndex <= 0}
                  className="h-10 w-10 p-0 border-thick border-border rounded-none"
                  aria-label="次の日"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* サマリーカード */}
        {/* 2026-10-22: 注文日と返金日を区別し、総額・返金額・純売上を同じ日付で照合する。 */}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
          <Card className="rounded-none shadow-none">
            <CardHeader className="pb-1">
              <CardTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground">関連注文</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-headline text-3xl tabular-nums">{ordersForDay.length}<span className="ml-2 text-base">件</span></p>
            </CardContent>
          </Card>

          <Card className="rounded-none shadow-none">
            <CardHeader className="pb-1">
              <CardTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground">会計件数</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-headline text-3xl tabular-nums">{settledOrders.length}<span className="ml-2 text-base">件</span></p>
            </CardContent>
          </Card>

          <Card className="rounded-none shadow-none">
            <CardHeader className="pb-1">
              <CardTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground">会計売上</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-headline text-3xl tabular-nums">¥{grossSales.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card className="rounded-none shadow-none">
            <CardHeader className="pb-1">
              <CardTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground">返金</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-headline text-3xl tabular-nums">−¥{refundAmount.toLocaleString()}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{refundOrders.length}件</p>
            </CardContent>
          </Card>

          <Card className="rounded-none shadow-none bg-primary text-primary-foreground">
            <CardHeader className="pb-1">
              <CardTitle className="font-mono text-xs uppercase tracking-widest text-primary-foreground/75">純売上</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-headline text-3xl tabular-nums">
                ¥{netSales.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* グラフエリア */}
        <div className="grid items-start gap-6 xl:grid-cols-2">
          {/* 時間帯別売上グラフ (SVG) */}
          <Card className="rounded-none shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-bold uppercase tracking-wide">会計時刻別売上推移</CardTitle>
              <CardDescription className="text-xs">9:00 - 18:00 の会計売上（返金前・円）</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              {/* 2026-10-16: グラフ拡大をマウスだけでなくキーボードからも開けるよう共通Buttonにする。 */}
              <Button
                type="button"
                variant="ghost"
                aria-label="時間帯別売上グラフを拡大"
                className="h-auto w-full max-w-[500px] cursor-pointer justify-start p-0 text-foreground no-underline hover:bg-transparent hover:text-foreground active:bg-transparent active:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                onClick={() => setIsChartExpanded(true)}
                title="クリックして拡大"
              >
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible">
                  {/* グリッド・目盛り */}
                  {Array.from({ length: 5 }).map((_, i) => {
                    const y = padding + (i / 4) * chartHeight;
                    const val = Math.round(maxHourlySales * (1 - i / 4));
                    return (
                      <g key={i}>
                        <line
                          x1={padding}
                          y1={y}
                          x2={svgWidth - padding}
                          y2={y}
                          stroke="#E5E5E5"
                          strokeWidth="1"
                          strokeDasharray="2 2"
                        />
                        <text
                          x={padding - 6}
                          y={y + 3}
                          className="font-mono text-[10px] fill-muted-foreground"
                          textAnchor="end"
                        >
                          ¥{val.toLocaleString()}
                        </text>
                      </g>
                    );
                  })}

                  {/* X軸目盛り */}
                  {points.map((p, i) => (
                    <text
                      key={i}
                      x={p.x}
                      y={svgHeight - padding + 15}
                      className="font-mono text-[10px] fill-muted-foreground"
                      textAnchor="middle"
                    >
                      {p.hour}
                    </text>
                  ))}

                  {/* 折れ線 */}
                  <path
                    d={linePath}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-foreground"
                  />

                  {/* データ点 */}
                  {points.map((p, i) => (
                    <g key={i} className="group">
                      <rect
                        x={p.x - 3}
                        y={p.y - 3}
                        width="6"
                        height="6"
                        fill="currentColor"
                        className="text-foreground cursor-pointer hover:scale-150 transition-all"
                      />
                      <title>{`${p.hour}: ¥${p.sales.toLocaleString()} (${p.count}件)`}</title>
                    </g>
                  ))}
                </svg>
              </Button>
            </CardContent>
          </Card>

          {/* メニュー別売上グラフ (HTML棒) */}
          <Card className="rounded-none shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-bold uppercase tracking-wide">メニュー別売上構成</CardTitle>
              <CardDescription className="text-xs">返金済み注文を除く会計商品の売上</CardDescription>
            </CardHeader>
            <CardContent>
              {menuSalesData.length > 0 ? (
                <div className="space-y-4 max-h-[220px] overflow-y-auto pr-2 no-scrollbar">
                  {menuSalesData.map((item, idx) => {
                    const pct = (item.sales / maxMenuSales) * 100;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1 text-xs font-bold uppercase font-mono">
                          <span className="min-w-0 break-words">{item.name} ({item.count}点)</span>
                          <span className="shrink-0 tabular-nums">¥{item.sales.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-4 border-thick border-border bg-muted rounded-none relative">
                          <div
                            style={{ width: `${pct}%` }}
                            className="h-full bg-primary transition-all"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12 uppercase">No menu sales data</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 注文履歴カード */}
        <Card className="rounded-none shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-bold uppercase tracking-wide">注文履歴</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
              {ordersForDay.map((order) => (
                <div
                  key={order.id}
                  className="flex justify-between items-center p-3 border-thick border-border rounded-none text-sm font-mono"
                >
                  <div>
                    <p className="font-bold">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.paymentStatus === "paid" ? "会計" : "注文"}: {(order.paidAt ?? order.createdAt)
                        ? new Date((order.paidAt ?? order.createdAt)!).toLocaleString("ja-JP")
                        : "-"}
                    </p>
                    {/* 2026-07-16: レジ担当者 (cashierId) の閲覧導線。誰が処理したか追跡できるよう表示する。
                        未記録 (cashierId 実装前の注文等) は「-」表示にする。 */}
                    <p className="text-xs text-muted-foreground">
                      担当: {order.cashierId || "-"}
                    </p>
                    {order.refund && (
                      <p className="max-w-[34rem] text-xs font-bold text-destructive">
                        返金記録: {new Date(order.refund.refundedAt).toLocaleString("ja-JP")} · ¥{order.refund.amount.toLocaleString()}
                        · 元の方法 {order.refund.originalPaymentMethod || "未設定"} · 担当 {order.refund.refundedBy || "未記録"}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-black">
                      ¥{(order.totalPrice ?? 0).toLocaleString()}
                    </p>
                    <p className="text-xs uppercase font-bold text-muted-foreground">
                      {order.status} · {order.paymentStatus === "paid" ? "会計済み" : order.paymentStatus === "refunded" ? "返金済み" : "未会計"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal
        isOpen={isChartExpanded}
        onClose={() => setIsChartExpanded(false)}
        title="[時間帯別売上推移]"
        maxWidth="xl"
      >
        <div className="w-full">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible">
            {/* グリッド・目盛り */}
            {Array.from({ length: 5 }).map((_, i) => {
              const y = padding + (i / 4) * chartHeight;
              const val = Math.round(maxHourlySales * (1 - i / 4));
              return (
                <g key={i}>
                  <line
                    x1={padding}
                    y1={y}
                    x2={svgWidth - padding}
                    y2={y}
                    stroke="#E5E5E5"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <text
                    x={padding - 6}
                    y={y + 3}
                    className="font-mono text-[10px] fill-muted-foreground"
                    textAnchor="end"
                  >
                    ¥{val.toLocaleString()}
                  </text>
                </g>
              );
            })}

            {/* X軸目盛り */}
            {points.map((p, i) => (
              <text
                key={i}
                x={p.x}
                y={svgHeight - padding + 15}
                className="font-mono text-[10px] fill-muted-foreground"
                textAnchor="middle"
              >
                {p.hour}
              </text>
            ))}

            {/* 折れ線 */}
            <path
              d={linePath}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-foreground"
            />

            {/* データ点 */}
            {points.map((p, i) => (
              <g key={i} className="group">
                <rect
                  x={p.x - 3}
                  y={p.y - 3}
                  width="6"
                  height="6"
                  fill="currentColor"
                  className="text-foreground cursor-pointer hover:scale-150 transition-all"
                />
                <title>{`${p.hour}: ¥${p.sales.toLocaleString()} (${p.count}件)`}</title>
              </g>
            ))}
          </svg>
        </div>
        <div className="mt-4 text-center">
          <Button onClick={() => setIsChartExpanded(false)} className="px-8 border-thick font-bold uppercase rounded-none">
            閉じる
          </Button>
        </div>
      </Modal>
    </DashboardLayout>
  );
}

export default function SalesManagementPage() {
  return (
    <CircleAuthGuard>
      {/* 権限のないユーザーは API 403 の読み込み失敗ではなく、権限なし画面にする (2026-10-05) */}
      <PermissionGuard permission="sales:read" showDenied>
        <SalesManagementContent />
      </PermissionGuard>
    </CircleAuthGuard>
  );
}
