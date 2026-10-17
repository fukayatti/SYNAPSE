import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminUserAccount } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Users, Shield, Lock, Unlock, UserX, UserCheck, Search, ChevronDown } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "システム管理者",
  event_manager: "イベント管理者",
  circle_manager: "サークルオーナー",
  circle_admin: "サークル管理者",
  circle_staff: "スタッフ",
};

const SCOPE_LABELS: Record<string, string> = {
  system: "システム",
  event: "イベント",
  circle: "サークル",
};

export function AccountsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const {
    data: users,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: () => adminApi.listUsers(),
  });

  const { data: lockouts } = useQuery({
    queryKey: ["adminLockouts"],
    queryFn: () => adminApi.listLockouts(),
  });

  const updateMembership = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { role?: string; isActive?: boolean } }) =>
      adminApi.updateMembership(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      toast.success("メンバーシップを更新しました");
    },
    onError: (e: Error) => toast.error(e.message || "更新に失敗しました"),
  });

  const clearLockout = useMutation({
    mutationFn: (id: string) => adminApi.clearLockout(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminLockouts"] });
      toast.success("ロックを解除しました");
    },
    onError: (e: Error) => toast.error(e.message || "解除に失敗しました"),
  });

  const filteredUsers = (users ?? []).filter((user) => {
    const query = search.trim().toLocaleLowerCase();
    if (query && !`${user.name} ${user.email} ${user.memberships.map((m) => m.scopeName).join(" ")}`.toLocaleLowerCase().includes(query)) return false;
    const memberships = user.memberships.filter((m) =>
      (scopeFilter === "all" || m.scope === scopeFilter) &&
      (statusFilter === "all" || m.isActive === (statusFilter === "active"))
    );
    return memberships.length > 0;
  });

  return (
    <div className="space-y-6">
      {/* ロックアウト中のアカウント */}
      {lockouts && lockouts.length > 0 && (
        <details className="border-thick border-destructive bg-destructive/5 p-4 space-y-3">
          <summary className="cursor-pointer text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-destructive">
            <Lock className="h-4 w-4" />
            ロック中 ({lockouts.length})
          </summary>
          <div className="space-y-3 pt-3">
            <div className="space-y-2">
              {lockouts.map((lk) => (
                <div
                  key={lk.id}
                  className="flex items-center justify-between gap-2 border-thick border-border bg-background p-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{lk.key}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {lk.scope} / 失敗 {lk.failedCount} 回
                      {lk.lockedUntil &&
                        ` / 解除予定 ${new Date(lk.lockedUntil).toLocaleTimeString("ja-JP")}`}
                    </div>
                  </div>
                  <Button
                    onClick={() => clearLockout.mutate(lk.id)}
                    disabled={clearLockout.isPending}
                    className="rounded-none border-thick border-border h-8 text-[10px] uppercase font-bold shrink-0 px-3 bg-background text-foreground hover:bg-primary hover:text-primary-foreground"
                  >
                    <Unlock className="mr-1 h-3.5 w-3.5" />
                    解除
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* アカウント一覧 */}
      <div className="flex items-center gap-2 border-b-thick border-border pb-3">
        <Users className="h-4 w-4" />
        <h2 className="text-sm font-bold uppercase tracking-wider">
          アカウント一覧 {users ? `(${filteredUsers.length} / ${users.length})` : ""}
        </h2>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="アカウントを検索" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="氏名・メール・所属先で検索" className="h-10 w-full border-thick border-border bg-background pl-9 pr-3 text-sm" />
        </label>
        <select aria-label="所属先で絞り込み" value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="h-10 border-thick border-border bg-background px-3 text-xs font-bold">
          <option value="all">すべての所属</option>
          <option value="system">システム</option>
          <option value="event">イベント</option>
          <option value="circle">サークル</option>
        </select>
        <select aria-label="状態で絞り込み" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 border-thick border-border bg-background px-3 text-xs font-bold">
          <option value="all">有効・無効すべて</option>
          <option value="active">有効のみ</option>
          <option value="inactive">無効のみ</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : filteredUsers.length > 0 ? (
        <div className="divide-y divide-border border-y border-border">
          {filteredUsers.map((user) => (
            <AccountRow
              key={user.email}
              user={user}
              onRoleChange={(id, role) => updateMembership.mutate({ id, data: { role } })}
              onToggleActive={(id, isActive) =>
                updateMembership.mutate({ id, data: { isActive } })
              }
              isPending={updateMembership.isPending}
              scopeFilter={scopeFilter}
              statusFilter={statusFilter}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={Users} message="アカウントがありません" />
      )}
    </div>
  );
}

function AccountRow({
  user,
  onRoleChange,
  onToggleActive,
  isPending,
  scopeFilter,
  statusFilter,
}: {
  user: AdminUserAccount;
  onRoleChange: (membershipId: string, role: string) => void;
  onToggleActive: (membershipId: string, isActive: boolean) => void;
  isPending: boolean;
  scopeFilter: string;
  statusFilter: string;
}) {
  const visibleMemberships = user.memberships.filter((m) =>
    (scopeFilter === "all" || m.scope === scopeFilter) &&
    (statusFilter === "all" || m.isActive === (statusFilter === "active"))
  );
  // 2026-10-16: アカウント単位で所属を折りたたみ、一覧が縦に伸び続けないようにする。
  return (
    <details className="bg-background">
      <summary className="group flex cursor-pointer list-none items-center justify-between gap-3 p-3 hover:bg-muted/50">
        <div className="flex min-w-0 items-center gap-2">
          {user.isSuperAdmin && <Shield className="h-4 w-4 text-primary shrink-0" />}
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{user.name}</div>
            <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-[10px] font-mono text-muted-foreground">
          {visibleMemberships.length} 所属
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="space-y-2 border-t border-border px-3 pb-3 pt-2">
        {visibleMemberships.map((m) => (
          <div
            key={m.id}
            className={`flex items-center justify-between gap-2 border-thick p-2 ${
              m.isActive ? "border-border" : "border-border/40 opacity-60"
            }`}
          >
            <div className="min-w-0 flex items-center gap-2">
              <span className="bg-muted px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider shrink-0">
                {SCOPE_LABELS[m.scope] || m.scope}
              </span>
              <span className="text-[11px] font-bold truncate">{m.scopeName}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={m.role}
                onChange={(e) => onRoleChange(m.id, e.target.value)}
                disabled={isPending}
                className="border-thick border-border rounded-none h-7 text-[10px] bg-background px-1 focus-visible:outline-none font-mono"
              >
                {[...new Set([...(m.scope === "system" ? ["super_admin"] : m.scope === "event" ? ["event_manager"] : ["circle_manager", "circle_admin", "circle_staff"]), m.role])].map((value) => (
                  <option key={value} value={value}>{ROLE_LABELS[value] ?? `未定義 (${value})`}</option>
                ))}
              </select>
              <Button
                onClick={() => onToggleActive(m.id, !m.isActive)}
                disabled={isPending}
                title={m.isActive ? "無効化 (権限剥奪)" : "有効化"}
                className={`rounded-none border-thick border-border h-7 text-[9px] uppercase font-bold px-2 shrink-0 ${
                  m.isActive
                    ? "bg-background text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    : "bg-background text-foreground hover:bg-primary hover:text-primary-foreground"
                }`}
              >
                {m.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
