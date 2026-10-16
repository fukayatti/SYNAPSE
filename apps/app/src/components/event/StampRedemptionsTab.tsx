import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, Gift, Search, Ticket } from "lucide-react";
import { stampRallyApi, type StaffStampRallyLookup } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { QrScannerModal } from "@/components/pos/qr-scanner-modal";
import { extractIdFromCode } from "@/lib/utils";
import { toast } from "sonner";

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日時不明" : new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// 2026-10-15 (#123): イベントスタッフが来場者の達成状況を照会し、
// イベント内で一度だけ景品交換を記録する受付画面。
export function StampRedemptionsTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<StaffStampRallyLookup | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const history = useQuery({
    queryKey: ["stamp-rally-redemptions", eventId],
    queryFn: () => stampRallyApi.redemptions(eventId),
    enabled: !!eventId,
  });

  const visitorLookup = useMutation({
    mutationFn: (value: string) => stampRallyApi.lookup(eventId, value),
    onSuccess: (data) => setLookup(data),
    onError: (error: any) => {
      setLookup(null);
      toast.error(error?.message || "来場者を照会できませんでした");
    },
  });
  const redeem = useMutation({
    mutationFn: (visitorId: string) => stampRallyApi.redeem(eventId, visitorId),
    onSuccess: () => {
      toast.success("景品交換を記録しました");
      queryClient.invalidateQueries({ queryKey: ["stamp-rally-redemptions", eventId] });
      if (lookup) visitorLookup.mutate(lookup.visitor.id);
    },
    onError: (error: any) => toast.error(error?.message || "景品交換を記録できませんでした"),
  });

  const submitLookup = (value = code) => {
    const normalized = extractIdFromCode(value);
    if (!normalized) return;
    setCode(normalized);
    visitorLookup.mutate(normalized);
  };

  return (
    <div className="max-w-3xl space-y-5">
      <header className="border-b-thick border-border pb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2"><Gift className="h-4 w-4" />景品交換受付</h2>
        <p className="text-[11px] text-muted-foreground mt-1">来場者のQRまたはリストバンドを照会し、条件を確認して交換を記録します。</p>
      </header>

      <Card className="bg-background">
        <CardContent className="pt-5 space-y-3">
          <label htmlFor="stamp-visitor-code" className="block text-xs font-bold">来場者ID / リストバンドID</label>
          <div className="flex gap-2">
            <Input
              id="stamp-visitor-code"
              value={code}
              disabled={visitorLookup.isPending}
              onChange={(event) => { setCode(event.target.value); setLookup(null); }}
              onKeyDown={(event) => { if (event.key === "Enter") submitLookup(); }}
              placeholder="QRコードの内容を入力"
              autoComplete="off"
            />
            <Button type="button" variant="outline" onClick={() => submitLookup()} disabled={!code.trim() || visitorLookup.isPending}>
              <Search className="h-4 w-4" />照会
            </Button>
            <Button type="button" variant="outline" aria-label="QRコードを読み取る" onClick={() => setIsScannerOpen(true)} disabled={visitorLookup.isPending}>
              <Camera className="h-4 w-4" />
            </Button>
          </div>
          {visitorLookup.isPending && <Skeleton className="h-24 w-full" />}
          {lookup && !visitorLookup.isPending && (
            <section className="border-thick border-border p-3 space-y-3" aria-live="polite">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="text-sm font-black">#{lookup.visitor.displayId} {lookup.visitor.nickname || "ニックネーム未設定"}</p>
                <p className={`text-xs font-bold ${lookup.progress.eligible ? "text-success" : "text-muted-foreground"}`}>
                  {lookup.progress.redeemedAt ? "交換済み" : lookup.progress.eligible ? "交換条件達成" : "条件未達成"}
                </p>
              </div>
              <p className="text-xs">利用店舗 {lookup.progress.stampedCount} / {lookup.progress.requiredCount}</p>
              <div className="flex flex-wrap gap-2 text-[10px]">
                {lookup.progress.areas.map((area) => (
                  <span key={area.id} className="border-thin border-border px-2 py-1">{area.name}: {area.circles.filter((circle) => circle.stamped).length}/{area.circles.length}</span>
                ))}
              </div>
              {lookup.progress.redeemedAt ? (
                <p className="text-xs flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />交換済み ({dateLabel(lookup.progress.redeemedAt)})</p>
              ) : (
                <Button
                  type="button"
                  onClick={() => redeem.mutate(lookup.visitor.id)}
                  disabled={!lookup.progress.eligible || redeem.isPending}
                  className="w-full sm:w-auto"
                >
                  <Ticket className="h-4 w-4" />{redeem.isPending ? "記録中…" : "景品交換を記録"}
                </Button>
              )}
            </section>
          )}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider">最近の交換記録</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => history.refetch()} disabled={history.isFetching}>更新</Button>
        </div>
        {history.isLoading ? <Skeleton className="h-20 w-full" /> : null}
        {history.isError ? <ErrorState error={history.error} onRetry={() => history.refetch()} /> : null}
        {!history.isLoading && !history.isError && (history.data?.length ?? 0) === 0 && (
          <p className="border-thin border-border p-3 text-xs text-muted-foreground">このイベントの交換記録はありません。</p>
        )}
        {history.data?.map((row) => (
          <div key={row.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-thin border-border p-2 text-xs">
            <span className="font-bold">#{row.displayId} {row.nickname || "ニックネーム未設定"}<span className="block text-[10px] font-normal text-muted-foreground">受付: {row.staffId}</span></span>
            <time className="text-muted-foreground">{dateLabel(row.createdAt)}</time>
          </div>
        ))}
      </section>

      <QrScannerModal
        circleId="event-stamp-redemption"
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        mode="customer"
        onCustomerScanned={(userId) => submitLookup(userId)}
      />
    </div>
  );
}
