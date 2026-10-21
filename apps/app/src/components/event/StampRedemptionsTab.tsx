import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Gift, Minus, Package, Plus, Search, Ticket, Users } from "lucide-react";
import { stampRallyApi, type StaffStampRallyLookup, type StampRallyReward } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Modal } from "@/components/ui/Modal";
import { QrScannerModal } from "@/components/pos/qr-scanner-modal";
import { extractIdFromCode } from "@/lib/utils";
import { toast } from "sonner";

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日時不明" : new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// 2026-10-16: 交換履歴をモーダル内に閉じ、レジ形式の景品選択と世帯ごとの残数確認を優先する。
export function StampRedemptionsTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<StaffStampRallyLookup | null>(null);
  const [selectedRewardId, setSelectedRewardId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const history = useQuery({
    queryKey: ["stamp-rally-redemptions", eventId],
    queryFn: () => stampRallyApi.redemptions(eventId),
    enabled: !!eventId,
  });

  const visitorLookup = useMutation({
    mutationFn: (value: string) => stampRallyApi.lookup(eventId, value),
    onSuccess: (data) => {
      setLookup(data);
      setQuantity(1);
      const availableReward = data.progress.rewards.find((reward) => {
        const redeemed = history.data?.summary.find((item) => item.rewardId === reward.id)?.quantity ?? 0;
        return reward.stockQuantity === null || redeemed < reward.stockQuantity;
      });
      setSelectedRewardId(availableReward?.id ?? data.progress.rewards[0]?.id ?? "");
      setIsCheckoutOpen(true);
    },
    onError: (error: any) => {
      setLookup(null);
      setIsCheckoutOpen(false);
      toast.error(error?.message || "来場者を照会できませんでした");
    },
  });
  const redeem = useMutation({
    mutationFn: (input: { visitorId: string; rewardId: string; quantity: number }) =>
      stampRallyApi.redeem(eventId, { code: input.visitorId, rewardId: input.rewardId, quantity: input.quantity }),
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

  const totalQuantity = history.data?.totalQuantity ?? 0;
  const rewards = useMemo(() => {
    const configured = history.data?.rewards ?? [];
    const configuredIds = new Set(configured.map((reward) => reward.id));
    const historical = (history.data?.summary ?? [])
      .filter((item) => !configuredIds.has(item.rewardId))
      .map((item) => ({ id: item.rewardId, name: item.rewardName, stockQuantity: null } satisfies StampRallyReward));
    return [...configured, ...historical];
  }, [history.data]);

  const selectedReward = lookup?.progress.rewards.find((reward) => reward.id === selectedRewardId);
  const selectedRewardExchanged = history.data?.summary.find((item) => item.rewardId === selectedRewardId)?.quantity ?? 0;
  const selectedRewardRemainingStock = selectedReward?.stockQuantity === null || !selectedReward
    ? Number.POSITIVE_INFINITY
    : Math.max(0, selectedReward.stockQuantity - selectedRewardExchanged);
  const maxExchangeQuantity = lookup
    ? Math.min(lookup.progress.remainingCount, selectedRewardRemainingStock)
    : 0;

  return (
    <div className="space-y-4 font-mono">
      <header className="flex flex-col gap-3 border-b-thick border-border pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider"><Gift className="h-4 w-4" />景品交換</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">QRを読み取り、家族の残り交換数を確認して景品を選びます。</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setIsHistoryOpen(true)} className="w-full sm:w-auto">
          <Package className="h-4 w-4" />交換履歴・在庫を見る
        </Button>
      </header>

      <section aria-label="景品交換サマリー" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Card className="bg-background"><CardContent className="p-3">
          <p className="text-[10px] font-bold text-muted-foreground">交換済み</p>
          <p className="mt-1 text-xl font-black tabular-nums">{totalQuantity.toLocaleString("ja-JP")}<span className="ml-1 text-[10px]">個</span></p>
        </CardContent></Card>
        <Card className="bg-background"><CardContent className="p-3">
          <p className="text-[10px] font-bold text-muted-foreground">登録景品</p>
          <p className="mt-1 text-xl font-black tabular-nums">{history.data?.rewards.length ?? 0}<span className="ml-1 text-[10px]">種類</span></p>
        </CardContent></Card>
        <Card className="col-span-2 bg-background sm:col-span-1"><CardContent className="p-3">
          <p className="text-[10px] font-bold text-muted-foreground">在庫管理</p>
          <p className="mt-1 text-xs font-bold">景品別の交換数を履歴で確認</p>
        </CardContent></Card>
      </section>

      <Card className="bg-background">
        <CardContent className="space-y-3 p-4">
          <label htmlFor="stamp-visitor-code" className="block text-xs font-bold">来場者QR / リストバンドを読み取る</label>
          <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); submitLookup(); }}>
            <div className="min-w-0 basis-full sm:flex-1">
              <Input
                id="stamp-visitor-code"
                value={code}
                disabled={visitorLookup.isPending}
                onChange={(event) => { setCode(event.target.value); setLookup(null); setIsCheckoutOpen(false); }}
                placeholder="IDまたはQRの内容を入力"
                autoComplete="off"
              />
            </div>
            <Button type="submit" variant="outline" disabled={!code.trim() || visitorLookup.isPending}>
              <Search className="h-4 w-4" />照会
            </Button>
            <Button type="button" variant="outline" aria-label="QRコードを読み取る" onClick={() => setIsScannerOpen(true)} disabled={visitorLookup.isPending}>
              <Camera className="h-4 w-4" />QR読取
            </Button>
          </form>
          {visitorLookup.isPending && <Skeleton className="h-12 w-full" />}
          {visitorLookup.isError && <ErrorState error={visitorLookup.error} onRetry={() => submitLookup()} />}
        </CardContent>
      </Card>

      <Modal
        isOpen={isCheckoutOpen && !!lookup}
        onClose={() => setIsCheckoutOpen(false)}
        title="[景品を交換]"
        subtitle="家族の交換枠と景品在庫を確認して記録します。"
        maxWidth="lg"
      >
        {lookup && (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <section className="grid grid-cols-2 gap-2" aria-label="来場者の交換状況">
              <div className="border-thick border-border p-3">
                <p className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><Users className="h-3.5 w-3.5" />家族の人数</p>
                <p className="mt-1 text-2xl font-black tabular-nums">{lookup.progress.familyMemberCount}<span className="ml-1 text-xs">人</span></p>
              </div>
              <div className="border-thick border-border bg-muted/30 p-3" aria-live="polite">
                <p className="text-[10px] font-bold text-muted-foreground">{lookup.progress.eventEnded ? "未使用枠" : "あと交換できる数"}</p>
                <p className="mt-1 text-2xl font-black tabular-nums">{lookup.progress.remainingCount}<span className="ml-1 text-xs">個</span></p>
                <p className="text-[10px] text-muted-foreground">交換済み {lookup.progress.redeemedCount} 個</p>
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2 border-b-thin border-border pb-2">
              <p className="text-sm font-black">#{lookup.visitor.displayId} {lookup.visitor.nickname || "ニックネーム未設定"}</p>
              <p className={`text-xs font-bold ${lookup.progress.eventEnded ? "text-error" : lookup.progress.eligible ? "text-success" : "text-muted-foreground"}`}>
                {lookup.progress.eventEnded
                  ? "開催終了・景品交換終了"
                  : lookup.progress.remainingCount === 0 ? "交換枠を利用済み" : lookup.progress.eligible ? "交換条件達成" : "条件未達成"}
              </p>
            </div>
            <p className="text-xs">
              {lookup.progress.qualification.minQualifiedAreaCount !== null
                ? `達成エリア ${lookup.progress.qualification.qualifiedAreaCount} / ${lookup.progress.qualification.minQualifiedAreaCount} エリア`
                : `利用店舗 ${lookup.progress.stampedCount} / ${lookup.progress.qualification.minTotalDistinctCircles ?? 0} 店舗`}
            </p>

            {lookup.progress.eventEnded ? (
              <div className="border-heavy border-error bg-error/10 p-3 text-xs font-bold" role="status">
                開催終了後のため、景品交換は記録できません。スタンプと交換状況の確認のみできます。
              </div>
            ) : lookup.progress.remainingCount > 0 && lookup.progress.eligible ? (
              <>
                <section className="space-y-2" aria-labelledby="stamp-reward-choice-title">
                  <h3 id="stamp-reward-choice-title" className="text-xs font-bold">交換する景品</h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {lookup.progress.rewards.map((reward) => {
                      const exchanged = history.data?.summary.find((item) => item.rewardId === reward.id)?.quantity ?? 0;
                      const stockRemaining = reward.stockQuantity === null ? null : Math.max(0, reward.stockQuantity - exchanged);
                      const soldOut = stockRemaining === 0;
                      return (
                        <button
                          key={reward.id}
                          type="button"
                          aria-pressed={selectedRewardId === reward.id}
                          disabled={soldOut}
                          onClick={() => { setSelectedRewardId(reward.id); setQuantity(1); }}
                          className={`min-h-16 border-thick border-border p-3 text-left ${selectedRewardId === reward.id ? "bg-primary text-primary-foreground" : "bg-background"} disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          <span className="block text-sm font-bold">{reward.name}</span>
                          <span className="mt-1 block text-[10px]">{stockRemaining === null ? "在庫上限なし" : `残り在庫 ${stockRemaining} 個`}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="flex flex-wrap items-center justify-between gap-3 border-t-thin border-border pt-3">
                  <div>
                    <h3 className="text-xs font-bold">交換数</h3>
                    <p className="mt-1 text-[10px] text-muted-foreground">家族の残り枠と在庫数を超えない範囲で選べます。</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" aria-label="交換数を1減らす" disabled={quantity <= 1} onClick={() => setQuantity((count) => Math.max(1, count - 1))}><Minus className="h-4 w-4" /></Button>
                    <Input
                      type="number"
                      aria-label="交換数"
                      min={1}
                      max={maxExchangeQuantity}
                      value={quantity}
                      onChange={(event) => setQuantity(Math.max(1, Math.min(maxExchangeQuantity, Number(event.target.value) || 1)))}
                      className="w-20 text-center text-lg font-black tabular-nums"
                    />
                    <Button type="button" variant="outline" aria-label="交換数を1増やす" disabled={quantity >= maxExchangeQuantity} onClick={() => setQuantity((count) => Math.min(maxExchangeQuantity, count + 1))}><Plus className="h-4 w-4" /></Button>
                  </div>
                </section>
                <Button
                  type="button"
                  className="w-full"
                  disabled={!selectedReward || quantity > maxExchangeQuantity || redeem.isPending}
                  onClick={() => selectedReward && redeem.mutate({ visitorId: lookup.visitor.id, rewardId: selectedReward.id, quantity })}
                >
                  <Ticket className="h-4 w-4" />{redeem.isPending ? "記録中…" : `${selectedReward?.name ?? "景品"}を ${quantity} 個交換`}
                </Button>
              </>
            ) : (
              <div className="border-thin border-border bg-muted/20 p-3 text-xs" role="status">
                {lookup.progress.remainingCount === 0
                  ? "この家族の交換枠はすべて使用済みです。"
                  : lookup.progress.eligible
                    ? "交換できる景品がありません。運営へ在庫を確認してください。"
                    : "スタンプ条件を達成すると景品を交換できます。"}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        title="[景品交換履歴]"
        subtitle="景品ごとの累計交換数と、直近の受付記録です。"
        maxWidth="lg"
      >
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {history.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          {history.isError ? <ErrorState error={history.error} onRetry={() => history.refetch()} /> : null}
          {!history.isLoading && !history.isError && (
            <>
              <section className="space-y-2" aria-labelledby="redemption-stock-summary-title">
                <div className="flex items-center justify-between gap-2 border-b-thin border-border pb-2">
                  <h3 id="redemption-stock-summary-title" className="flex items-center gap-1.5 text-xs font-bold"><Package className="h-4 w-4" />在庫サマリー</h3>
                  <Button type="button" variant="outline" size="sm" onClick={() => history.refetch()} disabled={history.isFetching}>更新</Button>
                </div>
                {rewards.length === 0 ? (
                  <p className="text-xs text-muted-foreground">景品がまだ登録されていません。</p>
                ) : (
                  <div className="divide-y divide-border">
                    {rewards.map((reward) => {
                      const exchanged = history.data?.summary.filter((item) => item.rewardId === reward.id).reduce((sum, item) => sum + item.quantity, 0) ?? 0;
                      const remaining = reward.stockQuantity === null ? null : Math.max(0, reward.stockQuantity - exchanged);
                      return (
                        <div key={reward.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 text-xs">
                          <span className="truncate font-bold">{reward.name}</span>
                          <span className="text-right tabular-nums">交換 {exchanged} 個{remaining === null ? " / 在庫上限なし" : ` / 残り ${remaining} 個`}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">合計交換数: {totalQuantity.toLocaleString("ja-JP")} 個</p>
              </section>

              <section aria-labelledby="redemption-history-list-title" className="space-y-2">
                <h3 id="redemption-history-list-title" className="border-b-thin border-border pb-2 text-xs font-bold">交換履歴</h3>
                {(history.data?.history.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">このイベントの交換記録はありません。</p>
                ) : (
                  <div className="divide-y divide-border">
                    {history.data?.history.map((row) => (
                      <div key={row.id} className="grid grid-cols-1 gap-x-3 gap-y-1 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto]">
                        <span className="min-w-0 font-bold">#{row.displayId} {row.nickname || "ニックネーム未設定"} · {row.rewardName} ×{row.quantity}
                          <span className="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground">受付: {row.staffId}</span>
                        </span>
                        <time className="text-[10px] text-muted-foreground sm:text-right">{dateLabel(row.createdAt)}</time>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </Modal>

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
