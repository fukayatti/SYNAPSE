import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { lotteryApi, type LotteryData, type LotteryEntryConfig } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PermissionGuard } from "@/hooks/useCircleAuth";
import { Ticket, Gift, Trophy, Trash2, Dices, Save, Check, RotateCcw } from "lucide-react";
import { useUnsavedChanges } from "@/components/UnsavedNavigationGuard";

// イベント単位の抽選管理 (2026-07-12)
// 主催者が景品と口数(当選確率)の重みを設定し、応募者から重み付き抽選する。
// 口数 = base + perStamp*スタンプ数 + perReview*レビュー数。
export function LotteryTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["lottery", eventId] });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["lottery", eventId],
    queryFn: () => lotteryApi.get(eventId),
    enabled: !!eventId,
  });

  const [name, setName] = useState("お楽しみ抽選会");
  const [drawAt, setDrawAt] = useState("");
  const [cfg, setCfg] = useState<LotteryEntryConfig>({ base: 1, perStamp: 0, perReview: 0 });
  const [savedDraft, setSavedDraft] = useState({ name: "お楽しみ抽選会", drawAt: "", cfg: { base: 1, perStamp: 0, perReview: 0 } as LotteryEntryConfig });
  const [prizeName, setPrizeName] = useState("");
  const [prizeQty, setPrizeQty] = useState(1);
  const [showArchivedPrizes, setShowArchivedPrizes] = useState(false);
  const [confirmDraw, setConfirmDraw] = useState(false);

  useEffect(() => {
    if (data?.lottery) {
      const nextDraft = {
        name: data.lottery.name,
        drawAt: data.lottery.drawAt ? String(data.lottery.drawAt).slice(0, 16) : "",
        cfg: data.lottery.entryConfig,
      };
      setName(nextDraft.name);
      setDrawAt(nextDraft.drawAt);
      setCfg(nextDraft.cfg);
      setSavedDraft(nextDraft);
    }
  }, [data?.lottery]);

  const lotteryDraft = { name, drawAt, cfg };
  const settingsDirty = JSON.stringify(lotteryDraft) !== JSON.stringify(savedDraft);
  const save = useMutation({
    mutationFn: (draft: typeof lotteryDraft) =>
      lotteryApi.upsert({ eventId, name: draft.name.trim(), drawAt: draft.drawAt || undefined, entryConfig: draft.cfg }),
    onSuccess: (_result, draft) => { setSavedDraft(draft); toast.success("抽選を保存しました"); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "保存に失敗しました"),
  });
  const lot = data?.lottery;
  const addPrize = useMutation({
    mutationFn: (draft: { lotteryId: string; name: string; quantity: number }) => lotteryApi.addPrize(draft.lotteryId, { name: draft.name, quantity: draft.quantity }),
    onSuccess: () => { toast.success("景品を追加しました"); setPrizeName(""); setPrizeQty(1); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "追加に失敗しました"),
  });
  const delPrize = useMutation({
    mutationFn: (prizeId: string) => lotteryApi.deletePrize(lot!.id, prizeId),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message || "削除に失敗しました"),
  });
  const restorePrize = useMutation({
    mutationFn: (prizeId: string) => lotteryApi.restorePrize(lot!.id, prizeId),
    onSuccess: () => { toast.success("景品を抽選候補に戻しました"); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "復元に失敗しました"),
  });
  const draw = useMutation({
    mutationFn: () => lotteryApi.draw(lot!.id),
    onSuccess: (r) => { toast.success(`抽選を実行しました (${r.drawn}名当選)`); setConfirmDraw(false); invalidate(); },
    onError: (e: any) => { toast.error(e?.message || "抽選に失敗しました"); setConfirmDraw(false); },
  });
  const claim = useMutation({
    mutationFn: (winnerId: string) => lotteryApi.claim(lot!.id, winnerId),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message || "受取記録に失敗しました"),
  });

  const prizeDraftDirty = !!lot && (prizeName !== "" || prizeQty !== 1);
  // 2026-10-16: 抽選条件と景品追加フォームを離脱確認からも保存する。
  useUnsavedChanges({
    isDirty: settingsDirty || prizeDraftDirty,
    onSave: async () => {
      if (settingsDirty) {
        if (!lotteryDraft.name.trim()) throw new Error("抽選名を入力してください。");
        await save.mutateAsync(lotteryDraft);
      }
      if (prizeDraftDirty) {
        if (!prizeName.trim() || prizeQty < 1) throw new Error("景品名と1以上の当選数を入力してください。");
        await addPrize.mutateAsync({ lotteryId: lot!.id, name: prizeName.trim(), quantity: prizeQty });
      }
    },
    onDiscard: () => {
      setName(savedDraft.name);
      setDrawAt(savedDraft.drawAt);
      setCfg(savedDraft.cfg);
      setPrizeName("");
      setPrizeQty(1);
    },
  });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const d: LotteryData = data!;
  const drawn = lot?.status === "drawn";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="border-b-thick border-border pb-3">
        <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider">
          <Ticket className="h-4 w-4" /> 抽選
        </h2>
        <p className="text-[11px] text-muted-foreground font-mono mt-1">
          景品と口数(当選確率)の重みを設定し、応募者から抽選します。口数 = 基本 + スタンプ×係数 + レビュー×係数。
        </p>
      </div>

      {/* 設定 */}
      <section className="space-y-3 border-thick border-border p-3">
        <div className="space-y-1">
          <Label htmlFor="lot-name">抽選名</Label>
          <Input id="lot-name" value={name} onChange={(e) => setName(e.target.value)} disabled={drawn} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lot-draw">当選発表時刻 (任意)</Label>
          <Input id="lot-draw" type="datetime-local" value={drawAt} onChange={(e) => setDrawAt(e.target.value)} disabled={drawn} className="w-56" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label>基本口数</Label>
            <Input type="number" min={0} value={cfg.base} onChange={(e) => setCfg({ ...cfg, base: Number(e.target.value) || 0 })} disabled={drawn} />
          </div>
          <div className="space-y-1">
            <Label>スタンプ係数</Label>
            <Input type="number" min={0} value={cfg.perStamp} onChange={(e) => setCfg({ ...cfg, perStamp: Number(e.target.value) || 0 })} disabled={drawn} />
          </div>
          <div className="space-y-1">
            <Label>レビュー係数</Label>
            <Input type="number" min={0} value={cfg.perReview} onChange={(e) => setCfg({ ...cfg, perReview: Number(e.target.value) || 0 })} disabled={drawn} />
          </div>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          例: 基本1/スタンプ0/レビュー0 = 応募者全員1口の等確率。基本0/スタンプ1 = スタンプ数がそのまま口数。
        </p>
        {!drawn && (
          <Button onClick={() => save.mutate(lotteryDraft)} disabled={save.isPending || !name.trim()}>
            <Save className="h-4 w-4 mr-1.5" /> {lot ? "設定を保存" : "抽選を作成"}
          </Button>
        )}
      </section>

      {lot && (
        <>
          {/* 景品 */}
          <section className="space-y-3">
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Gift className="h-3.5 w-3.5" /> 景品 (応募 {d.entryCount ?? 0} 名)
            </h3>
            <div className="space-y-1">
              {(d.prizes ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between border-thin border-border p-2 font-mono text-[12px]">
                  <span>{p.name} <span className="text-muted-foreground">×{p.quantity}</span></span>
                  {!drawn && <PermissionGuard permission="event:write">
                    <Button variant="outline" size="sm" onClick={() => delPrize.mutate(p.id)} disabled={delPrize.isPending} aria-label={`${p.name}を抽選候補から外す`}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />候補から外す
                    </Button>
                  </PermissionGuard>}
                </div>
              ))}
              {(d.prizes ?? []).length === 0 && <p className="font-mono text-[11px] text-muted-foreground">景品がありません。</p>}
            </div>
            {/* 2026-10-21: 抽選候補から外した景品も、誤操作時に候補へ戻せるよう別枠で管理する。 */}
            {(d.archivedPrizes ?? []).length > 0 && (
              <div className="space-y-2 border-t-thin border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => setShowArchivedPrizes((value) => !value)}>
                  {showArchivedPrizes ? "停止した景品を隠す" : `停止した景品を表示 (${d.archivedPrizes?.length ?? 0})`}
                </Button>
                {showArchivedPrizes && <div className="space-y-1">
                  {(d.archivedPrizes ?? []).map((p) => (
                    <div key={p.id} className="flex min-w-0 items-center justify-between gap-2 border-thin border-border bg-muted p-2 font-mono text-[12px]">
                      <span className="min-w-0 break-words">{p.name} <span className="text-muted-foreground">×{p.quantity} ・ 候補外</span></span>
                      {!drawn && <PermissionGuard permission="event:write">
                        <Button variant="outline" size="sm" onClick={() => restorePrize.mutate(p.id)} disabled={restorePrize.isPending}>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />候補に戻す
                        </Button>
                      </PermissionGuard>}
                    </div>
                  ))}
                </div>}
              </div>
            )}
            {!drawn && (
              <div className="flex gap-2 items-end">
                <div className="space-y-1 flex-1">
                  <Label htmlFor="prize-name">景品名</Label>
                  <Input id="prize-name" value={prizeName} onChange={(e) => setPrizeName(e.target.value)} placeholder="例: 図書カード500円" />
                </div>
                <div className="space-y-1 w-24">
                  <Label htmlFor="prize-qty">当選数</Label>
                  {/* 入力中に 1 未満へ強制クランプすると打ち直しがつっかえるため、
                      編集中は 0/空を許容し、確定は addPrize 側で 1 以上に丸める。 */}
                  <Input id="prize-qty" type="number" min={0} value={prizeQty} onChange={(e) => setPrizeQty(Math.max(0, Math.trunc(Number(e.target.value)) || 0))} />
                </div>
                <Button variant="outline" onClick={() => lot && addPrize.mutate({ lotteryId: lot.id, name: prizeName.trim(), quantity: Math.max(1, prizeQty) })} disabled={addPrize.isPending || !prizeName.trim() || prizeQty < 1}>追加</Button>
              </div>
            )}
          </section>

          {/* 抽選実行 / 当選者 */}
          <section className="space-y-3">
            {!drawn ? (
              <Button
                onClick={() => setConfirmDraw(true)}
                disabled={draw.isPending || (d.prizes ?? []).length === 0 || (d.entryCount ?? 0) === 0}
                className="w-full"
                size="lg"
              >
                <Dices className="h-4 w-4 mr-1.5" /> 抽選を実行する
              </Button>
            ) : (
              <>
                <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5" /> 当選者 ({d.winners?.length ?? 0})
                </h3>
                <div className="space-y-1">
                  {(d.winners ?? []).map((w) => (
                    <div key={w.id} className="flex items-center justify-between border-thin border-border p-2 font-mono text-[12px]">
                      <span>
                        <span className="font-bold">{w.userLabel}</span>
                        <span className="text-muted-foreground"> — {w.prizeName}</span>
                      </span>
                      {w.claimedAt ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Check className="h-3.5 w-3.5" /> 受取済</span>
                      ) : (
                        <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => claim.mutate(w.id)}>受取記録</Button>
                      )}
                    </div>
                  ))}
                  {(d.winners ?? []).length === 0 && <p className="font-mono text-[11px] text-muted-foreground">当選者がいません。</p>}
                </div>
              </>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        isOpen={confirmDraw}
        title="[確認: 抽選の実行]"
        description="抽選を実行すると当選者が確定し、設定・景品は変更できなくなります。よろしいですか？"
        confirmLabel="抽選を実行"
        isPending={draw.isPending}
        onConfirm={() => draw.mutate()}
        onCancel={() => setConfirmDraw(false)}
      />
    </div>
  );
}
