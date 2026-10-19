import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Loader2, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { QrScannerModal } from "@/components/pos/qr-scanner-modal";
import { type WristbandLookupResult, wristbandApi } from "@/lib/api";
import { extractIdFromCode } from "@/lib/utils";

const PAGE_SIZE = 50;

type PhysicalReplacementTarget = {
  user: WristbandLookupResult["user"];
  wristband: WristbandLookupResult["familyWristbands"][number];
};

export function LostWristbandsTab({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [replacementCodes, setReplacementCodes] = useState<Record<string, string>>({});
  const [scannerTarget, setScannerTarget] = useState<PhysicalReplacementTarget | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const wristbandQuery = useQuery({
    queryKey: ["wristbandReplacementSearch", eventId, searchQuery, offset],
    // 2026-10-20: 紛失フラグは交換対象の特定に使わず、通常一覧の有効な物理バンドを検索する。
    queryFn: () => wristbandApi.search(eventId, searchQuery, {
      bandType: "physical",
      accountStatus: "all",
      profileStatus: "all",
    }, { offset, limit: PAGE_SIZE }, { sortBy: "displayId", sortDirection: "asc" }),
  });

  const replaceMutation = useMutation({
    mutationFn: ({ item, code }: { item: PhysicalReplacementTarget; code: string }) =>
      wristbandApi.register(item.user.id, extractIdFromCode(code), item.wristband.id),
    onSuccess: async (_, { item }) => {
      toast.success(`来場者 #${item.user.displayId} に新しいリストバンドを紐付けました`);
      setReplacementCodes((current) => ({ ...current, [item.wristband.id]: "" }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wristbandReplacementSearch", eventId] }),
        queryClient.invalidateQueries({ queryKey: ["eventVisitors", eventId] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "再発行に失敗しました"),
  });

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setOffset(0);
    setSearchQuery(searchInput.trim());
  };

  const visitors = wristbandQuery.data?.items ?? [];
  const items: PhysicalReplacementTarget[] = visitors.flatMap((visitor) =>
    visitor.familyWristbands
      .filter((band) => band.status === "active")
      .map((wristband) => ({ user: visitor.user, wristband }))
  );
  const total = wristbandQuery.data?.total ?? 0;
  const canGoBack = offset > 0;
  const canGoForward = offset + PAGE_SIZE < total;

  return (
    <section className="space-y-5 font-mono text-foreground" aria-labelledby="lost-wristbands-title">
      <header className="flex flex-col gap-3 border-b-thick border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Button type="button" variant="ghost" className="-ml-3 h-9 px-3 text-xs" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />リストバンド管理に戻る
          </Button>
          <h2 id="lost-wristbands-title" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
            <ShieldAlert className="h-4 w-4 text-error" aria-hidden="true" />物理リストバンドID交換
          </h2>
          <p className="text-[10px] text-muted-foreground">通常のリストバンド一覧から交換対象を検索します。選んだ物理バンドIDだけを新しいIDに交換し、来場者情報や他のバンドはそのままです。</p>
        </div>
        <span className="w-fit border-thick border-border px-3 py-2 text-xs font-bold">該当来場者 {total.toLocaleString("ja-JP")} 人</span>
      </header>

      <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="呼出ID・名前・物理バンドIDで検索"
          aria-label="来場者・物理リストバンドを検索"
          className="h-10 rounded-none border-thick border-border"
        />
        <Button type="submit" variant="outline" className="h-10 rounded-none border-thick border-border">
          <Search className="mr-1.5 h-4 w-4" aria-hidden="true" />検索
        </Button>
      </form>

      {wristbandQuery.isPending ? (
        <div className="space-y-3" aria-label="物理リストバンドを読み込み中">
          <Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" />
        </div>
      ) : wristbandQuery.isError ? (
        <ErrorState error={wristbandQuery.error} onRetry={() => void wristbandQuery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={ShieldAlert} message={searchQuery ? "条件に一致する物理リストバンドはありません" : "交換できる物理リストバンドはありません"} />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const code = replacementCodes[item.wristband.id] ?? "";
            const isPending = replaceMutation.isPending && replaceMutation.variables?.item.wristband.id === item.wristband.id;
            return (
              <li key={item.wristband.id} className="space-y-3 border-thick border-border bg-background p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-bold">来場者 #{item.user.displayId} · {item.wristband.nickname || item.user.nickname || "名前未設定"}</p>
                    <p className="break-all text-xs">交換対象の物理バンド: <span className="font-bold">{item.wristband.id}</span></p>
                    <p className="text-[10px] text-muted-foreground">発行: {item.wristband.assignedAt ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(new Date(item.wristband.assignedAt)) : "日時不明"}</p>
                    {item.user.status === "banned" && <p className="text-[10px] font-bold text-error">来場者アカウントは利用停止中です</p>}
                  </div>
                  <span className="w-fit border-thick border-border px-2 py-1 text-[10px] font-bold">物理バンド</span>
                </div>
                <div className="grid gap-2 border-t-thin border-border pt-3 sm:grid-cols-[1fr_auto_auto]">
                  <Input
                    value={code}
                    onChange={(event) => setReplacementCodes((current) => ({ ...current, [item.wristband.id]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (code.trim()) replaceMutation.mutate({ item, code });
                      }
                    }}
                    placeholder="発行済みの新しい物理バンドID"
                    aria-label={`来場者 ${item.user.displayId} の再発行バンドID`}
                    className="h-10 rounded-none border-thick border-border"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-none border-thick border-border"
                    onClick={() => { setScannerTarget(item); setIsScannerOpen(true); }}
                  >
                    <Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />QRを読み取る
                  </Button>
                  <Button
                    type="button"
                    disabled={!code.trim() || replaceMutation.isPending}
                    className="h-10 rounded-none border-thick border-primary"
                    onClick={() => replaceMutation.mutate({ item, code })}
                  >
                    {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                    IDだけを交換
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t-thin border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10px] text-muted-foreground">交換先には、先に発行済みの未使用な物理バンドIDを指定してください。</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={!canGoBack || wristbandQuery.isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>前へ</Button>
          <Button type="button" variant="outline" disabled={!canGoForward || wristbandQuery.isFetching} onClick={() => setOffset(offset + PAGE_SIZE)}>次へ</Button>
        </div>
      </div>

      <QrScannerModal
        circleId="wristband-replacement"
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        mode="customer"
        onCustomerScanned={(_, wristbandId, _familyBandCount, _allergies, wristbandStatus) => {
          if (!scannerTarget || !wristbandId || wristbandStatus !== "active") {
            toast.error("発行済み物理リストバンドのQRを読み取ってください");
            return;
          }
          setReplacementCodes((current) => ({ ...current, [scannerTarget.wristband.id]: wristbandId }));
          setIsScannerOpen(false);
        }}
      />
    </section>
  );
}
