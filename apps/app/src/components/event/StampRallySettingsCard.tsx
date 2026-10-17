import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Save, Settings2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { circleApi, eventApi, type Circle, type Event, type StampRallyReward, type StampRallySettings } from "@/lib/api";
import { toast } from "sonner";
import { useUnsavedChanges } from "@/components/UnsavedNavigationGuard";

type StoreArea = { id: string; name: string };
type EventWithStoreAreas = Event & { storeAreas?: string | null };
type ParsedSettings = StampRallySettings & { legacy: boolean; rewards: StampRallyReward[] };

function parseStoreAreas(raw?: string | null): StoreArea[] {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((area): area is StoreArea =>
      !!area && typeof area === "object" && typeof area.id === "string" &&
      typeof area.name === "string" && area.name.trim().length > 0
    );
  } catch {
    return [];
  }
}

function parseSettings(raw?: string | null): ParsedSettings {
  const empty: ParsedSettings = {
    enabled: false,
    targetAreaIds: [],
    requiredCount: 3,
    rewardTitle: "景品交換",
    rewards: [{ id: "default", name: "景品交換", stockQuantity: null }],
    redemptionLocation: "",
    rulesUrl: "",
    legacy: false,
  };
  try {
    const parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
    const legacyAreas = Array.isArray(parsed.areas) ? parsed.areas : [];
    const legacy = legacyAreas.length > 0 && !Array.isArray(parsed.targetAreaIds);
    const firstLegacy = legacyAreas[0] as Record<string, unknown> | undefined;
    const rewardTitle = typeof parsed.rewardTitle === "string"
      ? parsed.rewardTitle
      : (typeof firstLegacy?.rewardTitle === "string" ? firstLegacy.rewardTitle : empty.rewardTitle);
    const rewards = Array.isArray(parsed.rewards)
      ? parsed.rewards.flatMap((reward): StampRallyReward[] => {
          if (!reward || typeof reward !== "object") return [];
          const item = reward as Record<string, unknown>;
          if (typeof item.id !== "string" || typeof item.name !== "string" || !item.name.trim()) return [];
          return [{
            id: item.id,
            name: item.name,
            stockQuantity: item.stockQuantity === null || item.stockQuantity === undefined
              ? null
              : Number.isInteger(item.stockQuantity) && Number(item.stockQuantity) >= 0
                ? Number(item.stockQuantity)
                : null,
          }];
        })
      : [{ id: "default", name: rewardTitle, stockQuantity: null }];
    return {
      enabled: parsed.enabled === true,
      targetAreaIds: Array.isArray(parsed.targetAreaIds)
        ? parsed.targetAreaIds.filter((id): id is string => typeof id === "string")
        : [],
      requiredCount: Number.isInteger(parsed.requiredCount) && Number(parsed.requiredCount) > 0
        ? Number(parsed.requiredCount)
        : (Number.isInteger(firstLegacy?.requiredCount) ? Number(firstLegacy?.requiredCount) : empty.requiredCount),
      rewardTitle,
      rewards: rewards.length ? rewards : [{ id: "default", name: rewardTitle, stockQuantity: null }],
      redemptionLocation: typeof parsed.redemptionLocation === "string"
        ? parsed.redemptionLocation
        : (typeof firstLegacy?.rewardDescription === "string" ? firstLegacy.rewardDescription : ""),
      rulesUrl: typeof parsed.rulesUrl === "string" ? parsed.rulesUrl : "",
      legacy,
    };
  } catch {
    return empty;
  }
}

function getCircleStoreAreaId(circle: Circle): string | null {
  try {
    const settings = JSON.parse(circle.settings || "{}") as { storeAreaId?: unknown };
    return typeof settings.storeAreaId === "string" ? settings.storeAreaId : null;
  } catch {
    return null;
  }
}

// 2026-10-15 (#123): 会場エリアを使う条件設定をモーダルにまとめ、管理画面の縦長化を避ける。
export function StampRallySettingsCard({ eventId, event }: { eventId: string; event: EventWithStoreAreas }) {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<ParsedSettings>(() => parseSettings(event.stampRallySettings));
  const [draftSettings, setDraftSettings] = useState<ParsedSettings>(() => parseSettings(event.stampRallySettings));
  const [requiredCountInput, setRequiredCountInput] = useState(() => String(parseSettings(event.stampRallySettings).requiredCount));
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const storeAreas = useMemo(() => parseStoreAreas(event.storeAreas), [event.storeAreas]);
  const circlesQuery = useQuery({
    queryKey: ["stamp-rally-circles", eventId],
    queryFn: () => circleApi.list(eventId),
  });
  useEffect(() => setSettings(parseSettings(event.stampRallySettings)), [event.stampRallySettings]);

  const circlesInTargets = (circlesQuery.data ?? []).filter((circle) =>
    draftSettings.targetAreaIds.includes(getCircleStoreAreaId(circle) || "")
  );
  const persistedCircleCount = (circlesQuery.data ?? []).filter((circle) =>
    settings.targetAreaIds.includes(getCircleStoreAreaId(circle) || "")
  ).length;
  const parsedRequiredCount = requiredCountInput.trim() === "" ? Number.NaN : Number(requiredCountInput);
  const invalidRequiredCount = !/^\d+$/.test(requiredCountInput) || !Number.isInteger(parsedRequiredCount) || parsedRequiredCount < 1 || parsedRequiredCount > 100;
  const invalidRulesUrl = (() => {
    const raw = draftSettings.rulesUrl.trim();
    if (!raw) return false;
    try {
      const url = new URL(raw);
      return url.protocol !== "http:" && url.protocol !== "https:";
    } catch {
      return true;
    }
  })();
  const invalidRewards = draftSettings.rewards.length === 0 || draftSettings.rewards.length > 20 ||
    draftSettings.rewards.some((reward) => !reward.name.trim() || reward.name.trim().length > 100 ||
      (reward.stockQuantity !== null && (!Number.isInteger(reward.stockQuantity) || reward.stockQuantity < 0 || reward.stockQuantity > 500_000))) ||
    new Set(draftSettings.rewards.map((reward) => reward.id)).size !== draftSettings.rewards.length ||
    new Set(draftSettings.rewards.map((reward) => reward.name.trim().toLocaleLowerCase())).size !== draftSettings.rewards.length;
  const invalidSettings = draftSettings.targetAreaIds.length > 50 ||
    new Set(draftSettings.targetAreaIds).size !== draftSettings.targetAreaIds.length ||
    invalidRequiredCount || invalidRewards ||
    draftSettings.redemptionLocation.trim().length > 500 || draftSettings.rulesUrl.trim().length > 2048 || invalidRulesUrl ||
    (draftSettings.enabled && (
    draftSettings.targetAreaIds.length === 0 ||
    parsedRequiredCount > circlesInTargets.length ||
    !draftSettings.redemptionLocation.trim()
    ));

  const save = useMutation({
    mutationFn: () => {
      const payload: StampRallySettings = {
        enabled: draftSettings.enabled,
        targetAreaIds: draftSettings.targetAreaIds,
        requiredCount: parsedRequiredCount,
        rewardTitle: draftSettings.rewards[0]?.name.trim() || draftSettings.rewardTitle.trim() || "景品交換",
        rewards: draftSettings.rewards.map((reward) => ({ ...reward, name: reward.name.trim() })),
        redemptionLocation: draftSettings.redemptionLocation.trim(),
        rulesUrl: draftSettings.rulesUrl.trim(),
      };
      return eventApi.setStampRallySettings(eventId, payload);
    },
    onSuccess: () => {
      toast.success("スタンプラリーの設定を保存しました");
      const saved = { ...draftSettings, requiredCount: parsedRequiredCount };
      setSettings(saved);
      setDraftSettings(saved);
      setRequiredCountInput(String(parsedRequiredCount));
      setIsEditorOpen(false);
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["stamp-rally-usage", eventId] });
    },
    onError: (error: any) => toast.error(error?.message || "設定を保存できませんでした"),
  });

  const editorDirty = isEditorOpen && (
    JSON.stringify(draftSettings) !== JSON.stringify(settings) ||
    requiredCountInput !== String(settings.requiredCount)
  );
  const discardEditor = () => {
    setDraftSettings(settings);
    setRequiredCountInput(String(settings.requiredCount));
    setIsEditorOpen(false);
  };
  // 2026-10-16: 条件編集ポップアップの下書きを画面遷移ガードへ登録する。
  useUnsavedChanges({
    isDirty: editorDirty,
    onSave: () => save.mutateAsync().then(() => undefined),
    onDiscard: discardEditor,
  });

  const openEditor = () => {
    setDraftSettings(settings);
    setRequiredCountInput(String(settings.requiredCount));
    setIsEditorOpen(true);
  };

  const toggleTargetArea = (areaId: string) => setDraftSettings((current) => ({
    ...current,
    targetAreaIds: current.targetAreaIds.includes(areaId)
      ? current.targetAreaIds.filter((id) => id !== areaId)
      : [...current.targetAreaIds, areaId],
  }));

  return (
    <>
      <Card className="bg-background">
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between gap-3 border-b-thin border-border pb-2">
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">スタンプラリー</h3>
            </div>
            <span className={`text-[10px] font-bold ${settings.enabled ? "text-success" : "text-muted-foreground"}`}>
              {settings.enabled ? "受付中" : "停止中"}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            事前に登録した会場エリアから対象エリアを選び、利用条件と景品交換案内を設定します。
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold">
              <MapPin className="inline h-3.5 w-3.5 mr-1" />
              {settings.targetAreaIds.length
                ? `${settings.targetAreaIds.length}エリア / ${settings.requiredCount}店舗以上`
                : "対象エリア未設定"}
            </p>
            <p className="text-[10px] text-muted-foreground">景品 {settings.rewards.length}種類</p>
            <Button type="button" variant="outline" size="sm" onClick={openEditor}>
              <Settings2 className="h-4 w-4" />条件を設定
            </Button>
          </div>
          {settings.legacy && (
            <p className="text-[10px] leading-relaxed text-warning border-thin border-border p-2" role="status">
              旧スタンプラリー設定を読み込みました。会場エリアとサークルの場所を設定したあと、新しい条件を保存してください。
            </p>
          )}
          {settings.enabled && settings.redemptionLocation.trim().length === 0 && <p className="text-[10px] text-error" role="alert">景品交換場所を入力してください。</p>}
          {settings.enabled && (settings.targetAreaIds.length === 0 || settings.requiredCount > persistedCircleCount) && <p className="text-[10px] text-error" role="alert">対象エリアの店舗数が必要数に足りません。サークルの場所を確認してください。</p>}
        </CardContent>
      </Card>

      <Modal
        isOpen={isEditorOpen}
        onClose={discardEditor}
        title="スタンプラリーの条件"
        subtitle="選択した会場エリア内の異なる店舗を利用するとスタンプが付きます。"
        maxWidth="lg"
      >
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="flex items-center justify-between gap-3 border-b-thin border-border pb-3">
            <div className="space-y-1">
              <p className="text-xs font-bold">スタンプラリーを受付</p>
              <p className="text-[10px] text-muted-foreground">停止中も、ここまでの利用実績は確認できます。</p>
            </div>
            <ToggleSwitch
              checked={draftSettings.enabled}
              onChange={(enabled) => setDraftSettings((current) => ({ ...current, enabled }))}
              label="スタンプラリーの受付"
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold">対象エリア</legend>
            {storeAreas.length === 0 ? (
              <p className="text-xs text-muted-foreground border-thin border-border p-3">
                先にイベント設定で会場エリアを登録してください。
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {storeAreas.map((area) => {
                  const selected = draftSettings.targetAreaIds.includes(area.id);
                  const count = (circlesQuery.data ?? []).filter((circle) => getCircleStoreAreaId(circle) === area.id).length;
                  return (
                    <button
                      key={area.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleTargetArea(area.id)}
                      className={`border-thick border-border p-3 text-left transition-colors ${selected ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-bold">
                        <span className="truncate">{area.name}</span>
                        <span className="text-[10px] shrink-0">{count}店舗</span>
                      </span>
                      <span className="block text-[10px] mt-1">{selected ? "対象エリアに含める" : "対象外"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          {/* 2026-10-16: 数値を空にしたり途中値を入力してもReactが既定値へ戻さず、保存時のみ整数として検証する。 */}
          <label className="block space-y-1">
            <span className="text-xs font-bold">景品を獲得する利用店舗数</span>
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              value={requiredCountInput}
              aria-describedby="stamp-required-count-help"
              aria-invalid={invalidRequiredCount}
              onChange={(e) => setRequiredCountInput(e.target.value)}
            />
            <span id="stamp-required-count-help" className="block text-[10px] text-muted-foreground">1〜100の整数。選択エリア全体で、注文完了した異なる店舗を数えます。</span>
            {invalidRequiredCount && <span className="block text-[10px] text-error" role="alert">必要数は1〜100の整数で入力してください。</span>}
            {!invalidRequiredCount && draftSettings.enabled && parsedRequiredCount > circlesInTargets.length && <span className="block text-[10px] text-error" role="alert">選択中の対象店舗は {circlesInTargets.length} 店舗です。必要数を減らすか、対象エリアを追加してください。</span>}
          </label>

          <section className="space-y-2" aria-labelledby="stamp-reward-catalog-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 id="stamp-reward-catalog-title" className="text-xs font-bold">交換できる景品</h3>
                <p className="text-[10px] text-muted-foreground">在庫数を空欄にすると上限なしで管理します。</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={draftSettings.rewards.length >= 20}
                onClick={() => setDraftSettings((current) => ({
                  ...current,
                  rewards: [...current.rewards, { id: crypto.randomUUID(), name: "", stockQuantity: null }],
                }))}
              >
                景品を追加
              </Button>
            </div>
            <div className="space-y-2">
              {draftSettings.rewards.map((reward, index) => (
                <div key={reward.id} className="grid grid-cols-1 gap-2 border-b-thin border-border py-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold">景品名 {index + 1}</span>
                    <Input
                      maxLength={100}
                      value={reward.name}
                      onChange={(event) => setDraftSettings((current) => ({
                        ...current,
                        rewards: current.rewards.map((item) => item.id === reward.id ? { ...item, name: event.target.value } : item),
                      }))}
                      placeholder="例: オリジナル缶バッジ"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold">在庫数</span>
                    <Input
                      type="number"
                      min={0}
                      max={500_000}
                      value={reward.stockQuantity ?? ""}
                      onChange={(event) => setDraftSettings((current) => ({
                        ...current,
                        rewards: current.rewards.map((item) => item.id === reward.id
                          ? { ...item, stockQuantity: event.target.value === "" ? null : Number(event.target.value) }
                          : item),
                      }))}
                      placeholder="上限なし"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={draftSettings.rewards.length <= 1}
                    onClick={() => setDraftSettings((current) => ({
                      ...current,
                      rewards: current.rewards.filter((item) => item.id !== reward.id),
                    }))}
                    aria-label={`${reward.name || `景品 ${index + 1}`}を削除`}
                  >
                    削除
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <label className="block space-y-1">
            <span className="text-xs font-bold">景品交換場所の案内</span>
            <textarea
              maxLength={500}
              rows={3}
              value={draftSettings.redemptionLocation}
              onChange={(e) => setDraftSettings((current) => ({ ...current, redemptionLocation: e.target.value }))}
              className="w-full border-thick border-border bg-background p-3 text-sm"
              placeholder="例: 本館1階の本部テントで、このスタンプ画面を提示してください。"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-bold">スタンプラリーのルールURL</span>
            <Input type="url" maxLength={2048} value={draftSettings.rulesUrl} onChange={(e) => setDraftSettings((current) => ({ ...current, rulesUrl: e.target.value }))} placeholder="https://example.com/rules" />
            {invalidRulesUrl && <span className="block text-[10px] text-error" role="alert">URLは http または https で入力してください。</span>}
          </label>

          {invalidSettings && <p className="text-xs text-error" role="alert">設定内容を確認してください。必要数は1〜100の整数、対象エリアは50件までです。スタンプラリーを有効にする場合は、必要数以上の店舗があるエリアと景品交換場所を設定してください。</p>}
          {circlesQuery.isError && <p className="text-xs text-error" role="alert">サークルの場所を読み込めませんでした。通信状態を確認してページを再読み込みしてください。</p>}
          <div className="flex justify-end gap-2 border-t-thin border-border pt-3">
            <Button type="button" variant="outline" onClick={discardEditor}>キャンセル</Button>
            <Button type="button" disabled={save.isPending || invalidSettings} onClick={() => save.mutate()}>
              <Save className="h-4 w-4" />{save.isPending ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
