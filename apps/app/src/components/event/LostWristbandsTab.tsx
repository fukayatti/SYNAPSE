import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Camera, Check, Loader2, Search, ShieldAlert, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { QrScannerModal } from "@/components/pos/qr-scanner-modal";
import { type WristbandLookupResult, wristbandApi } from "@/lib/api";
import { extractIdFromCode } from "@/lib/utils";

const PAGE_SIZE = 50;
type PhysicalWristband = WristbandLookupResult["familyWristbands"][number];
type LossHandlingStep = "account" | "band" | "replacement";

function formatAssignedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日時不明";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(date);
}

export function LostWristbandsTab({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<LossHandlingStep>("account");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState<WristbandLookupResult | null>(null);
  const [selectedBand, setSelectedBand] = useState<PhysicalWristband | null>(null);
  const [replacementCode, setReplacementCode] = useState("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const accountSearch = useQuery({
    queryKey: ["wristbandReplacementSearch", eventId, searchQuery, offset],
    // 2026-10-20: 紛失状態に頼らず、通常一覧の有効な物理バンドからアカウントを検索する。
    queryFn: () => wristbandApi.search(eventId, searchQuery, {
      bandType: "physical",
      accountStatus: "all",
      profileStatus: "all",
    }, { offset, limit: PAGE_SIZE }, { sortBy: "displayId", sortDirection: "asc" }),
    enabled: searchQuery.length > 0,
  });

  const replaceMutation = useMutation({
    mutationFn: () => {
      if (!selectedAccount || !selectedBand) throw new Error("交換対象のアカウントとバンドを選択してください");
      return wristbandApi.register(
        selectedAccount.user.id,
        extractIdFromCode(replacementCode),
        selectedBand.id,
      );
    },
    onSuccess: async () => {
      toast.success("物理リストバンドIDを交換しました");
      setIsConfirmOpen(false);
      setStep("account");
      setSelectedAccount(null);
      setSelectedBand(null);
      setReplacementCode("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wristbandReplacementSearch", eventId] }),
        queryClient.invalidateQueries({ queryKey: ["eventVisitors", eventId] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "ID交換に失敗しました"),
  });

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setOffset(0);
    setSelectedAccount(null);
    setSelectedBand(null);
    setReplacementCode("");
    setStep("account");
    setSearchQuery(searchInput.trim());
  };

  const selectAccount = (account: WristbandLookupResult) => {
    setSelectedAccount(account);
    setSelectedBand(null);
    setReplacementCode("");
    setStep("band");
  };

  const selectLostBand = (band: PhysicalWristband) => {
    setSelectedBand(band);
    setReplacementCode("");
    setStep("replacement");
  };

  const visitors = accountSearch.data?.items ?? [];
  const total = accountSearch.data?.total ?? 0;
  const canGoBack = offset > 0;
  const canGoForward = offset + PAGE_SIZE < total;
  // 2026-10-20: 交換元と同じIDを確定画面へ進めないよう、入力とQR読取の両方を検査する。
  const replacementId = replacementCode.trim() ? extractIdFromCode(replacementCode) : "";
  const replacementIdMatchesSource = Boolean(selectedBand && replacementId === selectedBand.id);

  const stepItems: { key: LossHandlingStep; number: string; title: string }[] = [
    { key: "account", number: "01", title: "アカウントを特定" },
    { key: "band", number: "02", title: "紛失バンドを確認" },
    { key: "replacement", number: "03", title: "新しいIDへ交換" },
  ];

  return (
    <section className="mx-auto max-w-5xl space-y-6 font-mono text-foreground" aria-labelledby="lost-wristbands-title">
      <header className="space-y-3 border-b-thick border-border pb-5">
        <Button type="button" variant="ghost" className="-ml-3 h-9 px-3 text-xs" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />リストバンド管理へ戻る
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 id="lost-wristbands-title" className="flex items-center gap-2 text-base font-bold uppercase tracking-wider">
              <ShieldAlert className="h-5 w-5 text-error" aria-hidden="true" />紛失バンド交換
            </h1>
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              来場者アカウントを検索し、紐づくバンドを確認してから、紛失した物理バンドのIDだけを交換します。
            </p>
          </div>
          <span className="w-fit border-thick border-warning bg-warning/10 px-3 py-2 text-[10px] font-bold">
            紛失状態の記録はありません
          </span>
        </div>
      </header>

      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="紛失バンド交換の手順">
        {stepItems.map((item, index) => {
          const isCurrent = step === item.key;
          const isComplete = stepItems.findIndex((candidate) => candidate.key === step) > index;
          return (
            <li
              key={item.key}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex min-h-14 items-center gap-3 border-thick px-3 py-2 text-xs ${
                isCurrent ? "border-primary bg-primary text-primary-foreground" : isComplete ? "border-success bg-success/10" : "border-border bg-background text-muted-foreground"
              }`}
            >
              <span className="text-sm font-bold">{isComplete ? <Check className="h-4 w-4" aria-hidden="true" /> : item.number}</span>
              <span className="font-bold">{item.title}</span>
            </li>
          );
        })}
      </ol>

      {step === "account" && (
        <section className="space-y-4" aria-labelledby="account-search-title">
          <div className="space-y-1">
            <h2 id="account-search-title" className="text-sm font-bold">1. 来場者アカウントを検索</h2>
            <p className="text-[10px] text-muted-foreground">呼出ID、名前、または現在紐づいている物理バンドIDで検索できます。</p>
          </div>
          <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="呼出ID・名前・物理バンドID"
              aria-label="来場者アカウントを検索"
              className="h-11 rounded-none border-thick border-border"
            />
            <Button type="submit" disabled={!searchInput.trim() || accountSearch.isFetching} className="h-11 shrink-0 border-thick border-primary sm:min-w-32">
              {accountSearch.isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              アカウントを検索
            </Button>
          </form>

          {accountSearch.isError ? (
            <ErrorState error={accountSearch.error} onRetry={() => void accountSearch.refetch()} />
          ) : accountSearch.isFetching && visitors.length === 0 ? (
            <div className="space-y-3" aria-label="来場者を検索中">
              <Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" />
            </div>
          ) : searchQuery && visitors.length === 0 ? (
            <EmptyState icon={Search} message="該当する来場者アカウントがありません" />
          ) : visitors.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b-thin border-border pb-2 text-[10px] text-muted-foreground">
                <span>検索結果 {total.toLocaleString("ja-JP")} 件</span>
                <span>{offset + 1}〜{Math.min(offset + PAGE_SIZE, total)} 件目</span>
              </div>
              <ul className="space-y-2">
                {visitors.map((account) => {
                  const physicalBands = account.familyWristbands.filter((band) => band.status === "active");
                  return (
                    <li key={account.user.id} className="border-thick border-border bg-background p-3 sm:p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-bold">来場者 #{account.user.displayId} · {account.user.nickname || "名前未設定"}</p>
                          <p className="text-[10px] text-muted-foreground">物理バンド {physicalBands.length} 本 · 利用状態: {account.user.status === "available" ? "利用可能" : "利用停止中"}</p>
                          <div className="flex flex-wrap gap-1 pt-1" aria-label="紐づくバンドID">
                            {account.familyWristbands.map((band) => (
                              <span key={band.id} className="break-all border-thin border-border px-2 py-1 text-[9px]">
                                {band.id}{band.status === "smartphone" ? " · スマホQR" : " · 物理"}
                              </span>
                            ))}
                          </div>
                        </div>
                        <Button type="button" variant="outline" className="h-10 shrink-0 border-thick border-border" onClick={() => selectAccount(account)}>
                          このアカウントを確認 <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={!canGoBack || accountSearch.isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>前へ</Button>
                <Button type="button" variant="outline" disabled={!canGoForward || accountSearch.isFetching} onClick={() => setOffset(offset + PAGE_SIZE)}>次へ</Button>
              </div>
            </div>
          ) : (
            <div className="border-thin border-dashed border-border p-5 text-center text-xs text-muted-foreground">
              来場者を検索すると、紐づいているリストバンドを確認できます。
            </div>
          )}
        </section>
      )}

      {step === "band" && selectedAccount && (
        <section className="space-y-4" aria-labelledby="linked-bands-title">
          <div className="flex flex-col gap-3 border-b-thin border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 id="linked-bands-title" className="text-sm font-bold">2. 紛失したバンドを特定</h2>
              <p className="text-xs">来場者 #{selectedAccount.user.displayId} · {selectedAccount.user.nickname || "名前未設定"}</p>
            </div>
            <Button type="button" variant="outline" className="h-9 w-fit border-thick border-border" onClick={() => { setSelectedAccount(null); setStep("account"); }}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />検索結果へ戻る
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground">紐づくバンドのIDを来場者に確認してください。物理バンドを選ぶと、そのIDだけを交換できます。</p>
            <ul className="space-y-2">
              {selectedAccount.familyWristbands.map((band) => {
                const isPhysical = band.status === "active";
                return (
                  <li key={band.id} className={`flex flex-col gap-3 border-thick p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 ${isPhysical ? "border-border bg-background" : "border-border/50 bg-muted/20"}`}>
                    <div className="min-w-0 space-y-1">
                      <p className="break-all text-xs font-bold">{band.id}</p>
                      <p className="text-[10px] text-muted-foreground">{band.nickname || selectedAccount.user.nickname || "名前未設定"} · 発行: {formatAssignedAt(band.assignedAt)}</p>
                    </div>
                    {isPhysical ? (
                      <Button type="button" className="h-10 shrink-0 border-thick border-primary" onClick={() => selectLostBand(band)}>
                        この物理バンドを紛失対象に選択 <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                      </Button>
                    ) : (
                      <span className="flex w-fit items-center gap-1.5 border-thin border-border px-2 py-1 text-[10px] text-muted-foreground">
                        <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />スマホQR・交換対象外
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {step === "replacement" && selectedAccount && selectedBand && (
        <section className="mx-auto max-w-3xl space-y-5" aria-labelledby="replacement-title">
          <div className="flex flex-col gap-3 border-b-thin border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 id="replacement-title" className="text-sm font-bold">3. 交換先の物理バンドIDを指定</h2>
              <p className="text-xs">来場者 #{selectedAccount.user.displayId} · {selectedAccount.user.nickname || "名前未設定"}</p>
            </div>
            <Button type="button" variant="outline" className="h-9 w-fit border-thick border-border" onClick={() => setStep("band")}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />バンド選択へ戻る
            </Button>
          </div>

          <div className="border-heavy border-error bg-error/5 p-4">
            <p className="text-[10px] font-bold uppercase text-error">紛失したと確認したバンド</p>
            <p className="mt-2 break-all text-sm font-bold">{selectedBand.id}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{selectedBand.nickname || selectedAccount.user.nickname || "名前未設定"}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="replacement-wristband-id" className="text-xs font-bold">交換先ID</label>
            <p className="text-[10px] text-muted-foreground">本部で発行済みの新しい物理バンドを入力するか、QRを読み取ります。</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                id="replacement-wristband-id"
                value={replacementCode}
                onChange={(event) => setReplacementCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (replacementId && !replacementIdMatchesSource) setIsConfirmOpen(true);
                  }
                }}
                placeholder="新しい物理バンドID"
                aria-label="交換先の物理リストバンドID"
                className="h-11 rounded-none border-thick border-border"
              />
              <Button type="button" variant="outline" className="h-11 border-thick border-border" onClick={() => setIsScannerOpen(true)}>
                <Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />QRを読み取る
              </Button>
            </div>
          </div>

          {replacementId && (
            <div className="space-y-2 border-t-thin border-border pt-4" aria-live="polite">
              <p className="text-[10px] font-bold uppercase">交換内容</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="min-w-0 border-thin border-error p-3">
                  <p className="text-[9px] text-muted-foreground">現在のID</p>
                  <p className="mt-1 break-all text-xs font-bold">{selectedBand.id}</p>
                </div>
                <ArrowRight className="mx-auto hidden h-5 w-5 sm:block" aria-hidden="true" />
                <div className="min-w-0 border-thin border-success p-3">
                  <p className="text-[9px] text-muted-foreground">交換後のID</p>
                  <p className="mt-1 break-all text-xs font-bold">{replacementId}</p>
                </div>
              </div>
              {replacementIdMatchesSource && <p role="alert" className="text-[10px] font-bold text-error">交換先には、紛失対象とは別のIDを指定してください。</p>}
              <p className="text-[10px] leading-relaxed text-muted-foreground">旧IDは交換済みとして記録され、新IDにこのバンドのプロフィールを引き継ぎます。ほかの家族バンドは変更されません。</p>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t-thin border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="h-11 border-thick border-border" onClick={() => setStep("band")}>
              バンド選択へ戻る
            </Button>
            <Button type="button" disabled={!replacementId || replacementIdMatchesSource} className="h-11 border-thick border-primary" onClick={() => setIsConfirmOpen(true)}>
              ID交換を確認
            </Button>
          </div>
        </section>
      )}

      <QrScannerModal
        circleId="wristband-replacement"
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        mode="customer"
        onCustomerScanned={(_, wristbandId, _familyBandCount, _allergies, wristbandStatus) => {
          if (!wristbandId || wristbandStatus !== "active") {
            toast.error("発行済みの物理リストバンドQRを読み取ってください");
            return;
          }
          setReplacementCode(wristbandId);
          setIsScannerOpen(false);
        }}
      />

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="物理リストバンドIDを交換しますか？"
        description={`来場者 #${selectedAccount?.user.displayId ?? ""} に紐づく「${selectedBand?.id ?? ""}」を「${replacementId}」へ交換します。交換後、旧IDは使えなくなります。`}
        confirmLabel="ID交換を確定"
        cancelLabel="内容を確認する"
        destructive={false}
        isPending={replaceMutation.isPending}
        onConfirm={() => replaceMutation.mutate()}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </section>
  );
}
