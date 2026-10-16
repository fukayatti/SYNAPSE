import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminApi, type AuditEntry } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/button";
import { ScrollText, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;
const ACTION_LABELS: Record<string, string> = {
  elevate: "管理権限の昇格",
  impersonate_start: "なりすまし開始",
  impersonate_stop: "なりすまし終了",
  impersonated_write: "なりすまし中の変更",
  system_setting_update: "システム設定変更",
  admin_change: "管理画面の変更",
  operator_change: "テナント管理者の変更",
  operator_failure: "失敗した操作",
};
const ROUTE_LABELS: Record<string, string> = {
  "/api/admin/users": "アカウント一覧",
  "/api/admin/events": "イベント契約一覧",
  "/api/admin/overview": "運営ダッシュボード",
  "/api/admin/settings": "システム設定",
  "/api/admin/announcements": "お知らせ一覧",
  "/api/admin/lockouts": "ログインロック一覧",
  "/api/admin/memberships/:id": "アカウント権限の変更",
  "/api/admin/events/:id": "イベント・契約情報の変更",
  "/api/admin/events/:id/payments": "入金の記録",
  "/api/admin/payments/:paymentId": "入金記録の削除",
  "/api/admin/announcements/:id": "お知らせの変更・削除",
  "/api/admin/events/:id/restore": "イベントの復元",
  "/api/admin/lockouts/:id": "ログインロックの解除",
};

function actionLabel(entry: AuditEntry) {
  if (entry.action !== "admin_change" && entry.action !== "admin_view") return ACTION_LABELS[entry.action] || entry.action;
  const label = entry.path ? ROUTE_LABELS[entry.path] : undefined;
  if (entry.action === "admin_view") return label ? `${label} · 参照` : "管理画面の参照";
  const verb = entry.method === "DELETE" ? "削除" : entry.method === "POST" ? "作成・実行" : "更新";
  return label ? `${label} · ${verb}` : `管理画面から${verb}`;
}

export function AuditTab() {
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["adminAudit", offset],
    queryFn: () => adminApi.listAudit({ limit: PAGE_SIZE, offset }),
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  const rows = data?.rows ?? [];
  if (data?.total === 0) return <EmptyState icon={ScrollText} message="監査ログはまだありません" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b-thick border-border pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider"><ScrollText className="h-4 w-4" />監査ログ ({data?.total ?? 0})</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">ログイン利用者の変更操作・失敗した操作と、システム管理者の参照操作を記録します。本文や個人情報を含むURLは保存しません。</p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{offset + 1}–{Math.min(offset + rows.length, data?.total ?? 0)} / {data?.total ?? 0}</span>
      </div>

      {rows.length === 0 ? <EmptyState icon={ScrollText} message="このページにログはありません" /> : (
        <div className="divide-y divide-border border-y border-border">
          {rows.map((a: AuditEntry) => (
            <div key={a.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-bold">{actionLabel(a)}</span>
                  <span className="break-all font-mono text-[11px] text-muted-foreground">{a.actorEmail}</span>
                  {a.asRole && <span className="text-[10px] text-muted-foreground">as {a.asRole}</span>}
                </div>
                {(a.method || a.path) && <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{a.method} {a.path}</div>}
                {a.summary && <div className="mt-1 text-[11px] text-muted-foreground">{a.summary}</div>}
              </div>
              <time className="font-mono text-[10px] text-muted-foreground sm:text-right">{new Date(a.createdAt).toLocaleString("ja-JP")}</time>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}><ChevronLeft className="mr-1 h-4 w-4" />前へ</Button>
        <span className="font-mono text-[10px] text-muted-foreground">{Math.floor(offset / PAGE_SIZE) + 1} / {Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))} ページ</span>
        <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= (data?.total ?? 0)} onClick={() => setOffset(offset + PAGE_SIZE)}>次へ<ChevronRight className="ml-1 h-4 w-4" /></Button>
      </div>
    </div>
  );
}
