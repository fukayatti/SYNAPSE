import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { eventApi, type DailyClose } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarCheck, Download } from "lucide-react";

// 2026-10-22: 入金日と返金日を分けて記録し、締め時に会計総額・返金・純売上を照合する。
function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}
function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function DailyCloseTab({ eventId, eventName }: { eventId: string; eventName?: string }) {
  const [date, setDate] = useState(todayJst());
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["daily-close", eventId, date],
    queryFn: () => eventApi.dailyClose(eventId, date),
    enabled: !!eventId,
  });

  const exportCsv = (d: DailyClose) => {
    const lines: (string | number)[][] = [
      [`日次締め ${d.date}`],
      ["会計件数", "会計売上", "返金件数", "返金額", "純売上", "客数"],
      [d.totals.orders, d.totals.grossRevenue, d.totals.refundOrders, d.totals.refundAmount, d.totals.revenue, d.totals.customers],
      [],
      ["支払い方法別"],
      ["方法", "件数", "売上"],
      ...d.paymentBreakdown.map((p) => [p.method, p.orders, p.revenue]),
      [],
      ["返金（元の支払い方法別）"],
      ["元の支払い方法", "件数", "返金額"],
      ...d.refundBreakdown.map((p) => [p.method, p.orders, p.amount]),
      [],
      ["サークル別"],
      ["サークル", "会計件数", "会計売上", "返金件数", "返金額", "純売上"],
      ...d.circleBreakdown.map((c) => [c.name, c.orders, c.grossRevenue, c.refundedOrders, c.refundAmount, c.revenue]),
    ];
    const csv = lines.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${eventName || "event"}_日次締め_${d.date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // 2026-10-08: Blob URLの即時解放によるダウンロード開始前の失効を防ぐ。
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-thick border-border pb-3">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider">
            <CalendarCheck className="h-4 w-4" /> 日次締め
          </h2>
          <p className="text-[11px] text-muted-foreground font-mono mt-1">指定日(JST)の会計売上と返金を分けて照合します。純売上は会計売上から返金額を差し引きます。</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="close-date">対象日</Label>
            <Input id="close-date" type="date" value={date} max={todayJst()} onChange={(e) => setDate(e.target.value)} className="w-40" />
          </div>
          {data && (
            <button
              type="button"
              onClick={() => exportCsv(data)}
              className="flex items-center gap-1 font-mono text-[11px] uppercase border-thick border-border px-2 py-2 hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data ? (
        <div className="space-y-6">
          {/* 2026-10-22: 会計売上と返金を並べ、純売上へ至る計算を締め画面上で追えるようにする。 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="border-thick border-border p-3">
              <div className="font-mono text-[10px] uppercase text-muted-foreground">会計売上</div>
              <div className="font-headline text-[22px]">{yen(data.totals.grossRevenue)}</div>
            </div>
            <div className="border-thick border-border p-3">
              <div className="font-mono text-[10px] uppercase text-muted-foreground">返金</div>
              <div className="font-headline text-[22px]">−{yen(data.totals.refundAmount)}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{data.totals.refundOrders}件</div>
            </div>
            <div className="border-thick border-primary bg-primary p-3 text-primary-foreground">
              <div className="font-mono text-[10px] uppercase text-primary-foreground/75">純売上</div>
              <div className="font-headline text-[22px]">{yen(data.totals.revenue)}</div>
            </div>
            <div className="border-thick border-border p-3">
              <div className="font-mono text-[10px] uppercase text-muted-foreground">会計件数</div>
              <div className="font-headline text-[22px]">{data.totals.orders}</div>
            </div>
            <div className="border-thick border-border p-3">
              <div className="font-mono text-[10px] uppercase text-muted-foreground">客数</div>
              <div className="font-headline text-[22px]">{data.totals.customers}</div>
            </div>
          </div>

          <section className="space-y-2">
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">支払い方法別</h3>
            {data.paymentBreakdown.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">この日の売上はありません。</p>
            ) : (
              data.paymentBreakdown.map((p) => (
                <div key={p.method} className="flex justify-between font-mono text-[12px] border-b border-border py-1">
                  <span>{p.method}</span>
                  <span className="tabular-nums">{p.orders}件 / {yen(p.revenue)}</span>
                </div>
              ))
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">返金（元の支払い方法別）</h3>
            {data.refundBreakdown.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">この日の返金記録はありません。</p>
            ) : (
              data.refundBreakdown.map((p) => (
                <div key={p.method} className="flex justify-between font-mono text-[12px] border-b border-border py-1">
                  <span>{p.method}</span>
                  <span className="tabular-nums">{p.orders}件 / −{yen(p.amount)}</span>
                </div>
              ))
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">サークル別</h3>
            {data.circleBreakdown.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">この日の売上はありません。</p>
            ) : (
              data.circleBreakdown.map((c) => (
                <div key={c.circleId} className="flex flex-wrap justify-between gap-x-3 gap-y-1 font-mono text-[12px] border-b border-border py-1">
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="max-w-full text-right text-[10px] tabular-nums">会計 {c.orders}件 · 返金 −{yen(c.refundAmount)} · 純売上 {yen(c.revenue)}</span>
                </div>
              ))
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
