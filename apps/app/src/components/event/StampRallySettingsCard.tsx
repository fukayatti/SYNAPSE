import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Save, Settings2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { circleApi, eventApi, type Circle, type Event, type StampRallyQualificationRule, type StampRallyReward, type StampRallySettings } from "@/lib/api";
import { toast } from "sonner";
import { useUnsavedChanges } from "@/components/UnsavedNavigationGuard";

type StoreArea = { id: string; name: string };
type EventWithStoreAreas = Event & { storeAreas?: string | null };
type ParsedSettings = StampRallySettings & { legacy: boolean; rewards: StampRallyReward[]; qualification: StampRallyQualificationRule };

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
    requiredCountByArea: {},
    qualification: {
      minQualifiedAreaCount: null,
      minDistinctCirclesPerArea: { default: 1, byArea: {} },
      requiredAreaIds: [],
      minTotalDistinctCircles: 3,
    },
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
    const requiredCountByArea = parsed.requiredCountByArea && typeof parsed.requiredCountByArea === "object" && !Array.isArray(parsed.requiredCountByArea)
      ? Object.fromEntries(Object.entries(parsed.requiredCountByArea)
          .filter((entry): entry is [string, number] => typeof entry[0] === "string" && Number.isInteger(entry[1]) && Number(entry[1]) >= 1 && Number(entry[1]) <= 100))
      : {};
    const targetAreaIds = Array.isArray(parsed.targetAreaIds)
      ? parsed.targetAreaIds.filter((id): id is string => typeof id === "string")
      : [];
    const requiredCount = Number.isInteger(parsed.requiredCount) && Number(parsed.requiredCount) > 0
      ? Number(parsed.requiredCount)
      : (Number.isInteger(firstLegacy?.requiredCount) ? Number(firstLegacy?.requiredCount) : empty.requiredCount);
    const rawQualification = parsed.qualification && typeof parsed.qualification === "object" && !Array.isArray(parsed.qualification)
      ? parsed.qualification as Record<string, unknown>
      : null;
    const rawPerArea = rawQualification?.minDistinctCirclesPerArea && typeof rawQualification.minDistinctCirclesPerArea === "object" && !Array.isArray(rawQualification.minDistinctCirclesPerArea)
      ? rawQualification.minDistinctCirclesPerArea as Record<string, unknown>
      : null;
    const rawByArea = rawPerArea?.byArea && typeof rawPerArea.byArea === "object" && !Array.isArray(rawPerArea.byArea)
      ? Object.fromEntries(Object.entries(rawPerArea.byArea)
          .filter((entry): entry is [string, number] => typeof entry[0] === "string" && Number.isInteger(entry[1]) && Number(entry[1]) >= 1 && Number(entry[1]) <= 100))
      : null;
    const hasValidQualification = rawQualification && rawPerArea && rawByArea &&
      (rawQualification.minQualifiedAreaCount === null || (Number.isInteger(rawQualification.minQualifiedAreaCount) && Number(rawQualification.minQualifiedAreaCount) >= 1 && Number(rawQualification.minQualifiedAreaCount) <= 50)) &&
      (rawQualification.minTotalDistinctCircles === null || (Number.isInteger(rawQualification.minTotalDistinctCircles) && Number(rawQualification.minTotalDistinctCircles) >= 1 && Number(rawQualification.minTotalDistinctCircles) <= 100)) &&
      Number.isInteger(rawPerArea.default) && Number(rawPerArea.default) >= 1 && Number(rawPerArea.default) <= 100 &&
      Array.isArray(rawQualification.requiredAreaIds) && rawQualification.requiredAreaIds.every((id) => typeof id === "string");
    const legacyAreaRequirementsConfigured = targetAreaIds.length > 0 && targetAreaIds.every((areaId) => requiredCountByArea[areaId] != null);
    const qualification: StampRallyQualificationRule = hasValidQualification
      ? {
          minQualifiedAreaCount: rawQualification.minQualifiedAreaCount as number | null,
          minDistinctCirclesPerArea: { default: Number(rawPerArea.default), byArea: rawByArea },
          requiredAreaIds: rawQualification.requiredAreaIds as string[],
          minTotalDistinctCircles: rawQualification.minTotalDistinctCircles as number | null,
        }
      : {
          // 2026-10-19: 保存済みの旧条件は、全エリア必須または合計店舗数として同じ意味で編集できるよう復元する。
          minQualifiedAreaCount: legacyAreaRequirementsConfigured ? targetAreaIds.length : null,
          minDistinctCirclesPerArea: { default: 1, byArea: legacyAreaRequirementsConfigured ? requiredCountByArea : {} },
          requiredAreaIds: [],
          minTotalDistinctCircles: legacyAreaRequirementsConfigured ? null : requiredCount,
        };
    return {
      enabled: parsed.enabled === true,
      targetAreaIds,
      requiredCount,
      requiredCountByArea,
      qualification,
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
export function StampRallySettingsCard({ eventId, event, onOpenStoreAreas }: { eventId: string; event: EventWithStoreAreas; onOpenStoreAreas: () => void }) {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<ParsedSettings>(() => parseSettings(event.stampRallySettings));
  const [draftSettings, setDraftSettings] = useState<ParsedSettings>(() => parseSettings(event.stampRallySettings));
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const storeAreas = useMemo(() => parseStoreAreas(event.storeAreas), [event.storeAreas]);
  const circlesQuery = useQuery({
    queryKey: ["stamp-rally-circles", eventId],
    queryFn: () => circleApi.list(eventId),
  });
  useEffect(() => setSettings(parseSettings(event.stampRallySettings)), [event.stampRallySettings]);

  const circlesByArea = new Map<string, number>(storeAreas.map((area) => [
    area.id,
    (circlesQuery.data ?? []).filter((circle) => getCircleStoreAreaId(circle) === area.id).length,
  ] as const));
  const qualification = draftSettings.qualification;
  const areaConditionEnabled = qualification.minQualifiedAreaCount !== null;
  const areaRequirement = (areaId: string) => qualification.minDistinctCirclesPerArea.byArea[areaId] ?? qualification.minDistinctCirclesPerArea.default;
  const requiredCountTotal = draftSettings.targetAreaIds.reduce((sum, areaId) => sum + areaRequirement(areaId), 0);
  const invalidAreaRequirements = draftSettings.targetAreaIds.some((areaId) => {
    const required = areaRequirement(areaId);
    return !Number.isInteger(required) || required < 1 || required > 100;
  });
  const possibleAreaIds = draftSettings.targetAreaIds.filter((areaId) => areaRequirement(areaId) <= (circlesByArea.get(areaId) ?? 0));
  const requiredAreasPossible = qualification.requiredAreaIds.every((areaId) =>
    draftSettings.targetAreaIds.includes(areaId) && possibleAreaIds.includes(areaId)
  );
  const invalidQualification = (areaConditionEnabled && (
    !Number.isInteger(qualification.minQualifiedAreaCount) ||
    (qualification.minQualifiedAreaCount ?? 0) < 1 ||
    (qualification.minQualifiedAreaCount ?? 0) > draftSettings.targetAreaIds.length ||
    possibleAreaIds.length < (qualification.minQualifiedAreaCount ?? 0) ||
    !requiredAreasPossible ||
    qualification.requiredAreaIds.length > (qualification.minQualifiedAreaCount ?? 0)
  )) || (!areaConditionEnabled && qualification.requiredAreaIds.length > 0);
  const targetCircleCount = draftSettings.targetAreaIds.reduce((sum, areaId) => sum + (circlesByArea.get(areaId) ?? 0), 0);
  const invalidTotalRequirement = qualification.minTotalDistinctCircles !== null && (
    !Number.isInteger(qualification.minTotalDistinctCircles) ||
    qualification.minTotalDistinctCircles < 1 ||
    qualification.minTotalDistinctCircles > 100 ||
    qualification.minTotalDistinctCircles > targetCircleCount
  );
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
    invalidAreaRequirements || invalidQualification || invalidTotalRequirement || invalidRewards ||
    draftSettings.redemptionLocation.trim().length > 500 || draftSettings.rulesUrl.trim().length > 2048 || invalidRulesUrl ||
    (draftSettings.enabled && (
    draftSettings.targetAreaIds.length === 0 ||
    (qualification.minQualifiedAreaCount === null && qualification.minTotalDistinctCircles === null) ||
    !draftSettings.redemptionLocation.trim()
    ));

  const save = useMutation({
    mutationFn: () => {
      const payload: StampRallySettings = {
        enabled: draftSettings.enabled,
        targetAreaIds: draftSettings.targetAreaIds,
        requiredCount: qualification.minTotalDistinctCircles ?? Math.min(100, requiredCountTotal || draftSettings.requiredCount),
        requiredCountByArea: Object.fromEntries(draftSettings.targetAreaIds.map((areaId) => [areaId, areaRequirement(areaId)])),
        qualification,
        rewardTitle: draftSettings.rewards[0]?.name.trim() || draftSettings.rewardTitle.trim() || "景品交換",
        rewards: draftSettings.rewards.map((reward) => ({ ...reward, name: reward.name.trim() })),
        redemptionLocation: draftSettings.redemptionLocation.trim(),
        rulesUrl: draftSettings.rulesUrl.trim(),
      };
      return eventApi.setStampRallySettings(eventId, payload);
    },
    onSuccess: () => {
      toast.success("スタンプラリーの設定を保存しました");
      const saved = {
        ...draftSettings,
        requiredCount: qualification.minTotalDistinctCircles ?? Math.min(100, requiredCountTotal || draftSettings.requiredCount),
        requiredCountByArea: Object.fromEntries(draftSettings.targetAreaIds.map((areaId) => [areaId, areaRequirement(areaId)])),
      };
      setSettings(saved);
      setDraftSettings(saved);
      setIsEditorOpen(false);
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["stamp-rally-usage", eventId] });
    },
    onError: (error: any) => toast.error(error?.message || "設定を保存できませんでした"),
  });

  const editorDirty = isEditorOpen && JSON.stringify(draftSettings) !== JSON.stringify(settings);
  const discardEditor = () => {
    setDraftSettings(settings);
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
    setIsEditorOpen(true);
  };

  const toggleTargetArea = (areaId: string) => setDraftSettings((current) => {
    const selected = current.targetAreaIds.includes(areaId);
    const targetAreaIds = selected
      ? current.targetAreaIds.filter((id) => id !== areaId)
      : [...current.targetAreaIds, areaId];
    const byArea = { ...current.qualification.minDistinctCirclesPerArea.byArea };
    const requiredAreaIds = current.qualification.requiredAreaIds.filter((id) => id !== areaId);
    if (selected) delete byArea[areaId];
    const minQualifiedAreaCount = current.qualification.minQualifiedAreaCount === null
      ? null
      : targetAreaIds.length === 0
        ? null
        : Math.min(current.qualification.minQualifiedAreaCount, targetAreaIds.length);
    return {
      ...current,
      targetAreaIds,
      qualification: {
        ...current.qualification,
        minQualifiedAreaCount,
        minDistinctCirclesPerArea: { ...current.qualification.minDistinctCirclesPerArea, byArea },
        requiredAreaIds,
      },
    };
  });

  const setAreaRequirement = (areaId: string, value: number) => setDraftSettings((current) => ({
    ...current,
    qualification: {
      ...current.qualification,
      minDistinctCirclesPerArea: {
        ...current.qualification.minDistinctCirclesPerArea,
        byArea: value === current.qualification.minDistinctCirclesPerArea.default
          ? Object.fromEntries(Object.entries(current.qualification.minDistinctCirclesPerArea.byArea).filter(([id]) => id !== areaId))
          : { ...current.qualification.minDistinctCirclesPerArea.byArea, [areaId]: value },
      },
    },
  }));

  const setAreaConditionEnabled = (enabled: boolean) => setDraftSettings((current) => ({
    ...current,
    qualification: {
      ...current.qualification,
      minQualifiedAreaCount: enabled
        ? Math.max(1, current.qualification.minQualifiedAreaCount ?? current.targetAreaIds.length)
        : null,
      requiredAreaIds: enabled ? current.qualification.requiredAreaIds : [],
    },
  }));

  const setRequiredArea = (areaId: string, required: boolean) => setDraftSettings((current) => ({
    ...current,
    qualification: {
      ...current.qualification,
      requiredAreaIds: required
        ? [...new Set([...current.qualification.requiredAreaIds, areaId])]
        : current.qualification.requiredAreaIds.filter((id) => id !== areaId),
    },
  }));

  const setTotalConditionEnabled = (enabled: boolean) => setDraftSettings((current) => ({
    ...current,
    qualification: {
      ...current.qualification,
      minTotalDistinctCircles: enabled
        ? current.qualification.minTotalDistinctCircles ?? Math.min(100, Math.max(1, current.requiredCount))
        : null,
    },
  }));

  const settingsQualification = settings.qualification;
  const settingsPossibleAreaIds = settings.targetAreaIds.filter((areaId) =>
    (settingsQualification.minDistinctCirclesPerArea.byArea[areaId] ?? settingsQualification.minDistinctCirclesPerArea.default) <= (circlesByArea.get(areaId) ?? 0)
  );
  const settingsTargetCircleCount = settings.targetAreaIds.reduce((sum, areaId) => sum + (circlesByArea.get(areaId) ?? 0), 0);
  const savedConditionImpossible = (settingsQualification.minQualifiedAreaCount !== null && (
    settingsPossibleAreaIds.length < settingsQualification.minQualifiedAreaCount ||
    settingsQualification.requiredAreaIds.some((id) => !settingsPossibleAreaIds.includes(id))
  )) || (settingsQualification.minTotalDistinctCircles !== null && settingsQualification.minTotalDistinctCircles > settingsTargetCircleCount);
  const qualificationDescription = [
    settingsQualification.minQualifiedAreaCount !== null
      ? `対象${settings.targetAreaIds.length}エリアのうち${settingsQualification.minQualifiedAreaCount}エリア以上で達成`
      : null,
    settingsQualification.requiredAreaIds.length > 0
      ? `必須: ${settingsQualification.requiredAreaIds.map((id) => storeAreas.find((area) => area.id === id)?.name ?? "エリア").join("・")}`
      : null,
    settingsQualification.minTotalDistinctCircles !== null
      ? `合計${settingsQualification.minTotalDistinctCircles}店舗以上`
      : null,
  ].filter(Boolean).join(" / ");

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
                ? `${settings.targetAreaIds.length}エリア / ${qualificationDescription || "条件未設定"}`
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
          {settings.enabled && (settings.targetAreaIds.length === 0 || savedConditionImpossible) && <p className="text-[10px] text-error" role="alert">現在の店舗数では設定条件を満たせません。サークルの場所と必要数を確認してください。</p>}
          {storeAreas.length === 0 && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenStoreAreas}>
              <MapPin className="h-4 w-4" />店舗エリアを設定
            </Button>
          )}
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
          <section className="space-y-3 border-b-thin border-border pb-3" aria-labelledby="stamp-qualification-title">
            <h3 id="stamp-qualification-title" className="text-xs font-bold">達成条件</h3>
            <label className="flex items-center gap-2 text-xs font-bold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={areaConditionEnabled}
                disabled={draftSettings.targetAreaIds.length === 0}
                onChange={(event) => setAreaConditionEnabled(event.target.checked)}
              />
              達成エリア数を条件にする
            </label>
            {areaConditionEnabled && (
              <label className="block max-w-xs space-y-1">
                <span className="text-[10px] font-bold">達成が必要なエリア数</span>
                <Input
                  type="number"
                  min={1}
                  max={Math.max(1, draftSettings.targetAreaIds.length)}
                  value={qualification.minQualifiedAreaCount ?? ""}
                  aria-label="達成が必要なエリア数"
                  aria-invalid={invalidQualification}
                  onChange={(event) => setDraftSettings((current) => ({
                    ...current,
                    qualification: { ...current.qualification, minQualifiedAreaCount: Number(event.target.value) },
                  }))}
                />
                <span className="block text-[10px] text-muted-foreground">対象 {draftSettings.targetAreaIds.length} エリアのうち、必要数以上を達成します。</span>
              </label>
            )}
            <label className="flex items-center gap-2 text-xs font-bold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={qualification.minTotalDistinctCircles !== null}
                onChange={(event) => setTotalConditionEnabled(event.target.checked)}
              />
              合計利用店舗数も条件にする
            </label>
            {qualification.minTotalDistinctCircles !== null && (
              <label className="block max-w-xs space-y-1">
                <span className="text-[10px] font-bold">合計で必要な異なる店舗数</span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={qualification.minTotalDistinctCircles}
                  aria-label="合計で必要な異なる店舗数"
                  aria-invalid={invalidTotalRequirement}
                  onChange={(event) => setDraftSettings((current) => ({
                    ...current,
                    qualification: { ...current.qualification, minTotalDistinctCircles: Number(event.target.value) },
                  }))}
                />
              </label>
            )}
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              エリア条件と合計店舗数を両方設定した場合は、両方を満たすと達成です。同じ店舗の複数注文は1店舗として数えます。
            </p>
          </section>
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold">対象エリア</legend>
            {storeAreas.length === 0 ? (
              <div className="space-y-3 border-thin border-border p-3">
                <p className="text-xs text-muted-foreground">スタンプラリーの対象エリアがありません。店舗エリアを登録してください。</p>
                <Button type="button" variant="outline" size="sm" onClick={onOpenStoreAreas}>
                  <MapPin className="h-4 w-4" />店舗エリアを設定
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {storeAreas.map((area) => {
                  const selected = draftSettings.targetAreaIds.includes(area.id);
                  const count = circlesByArea.get(area.id) ?? 0;
                  return (
                    <div key={area.id} className="space-y-2 border-thick border-border p-3">
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleTargetArea(area.id)}
                        className={`w-full text-left transition-colors ${selected ? "text-primary" : "hover:text-primary"}`}
                      >
                        <span className="flex items-center justify-between gap-2 text-sm font-bold">
                          <span className="truncate">{area.name}</span>
                          <span className="text-[10px] shrink-0">{count}店舗</span>
                        </span>
                        <span className="block text-[10px] mt-1">{selected ? "対象エリアに設定済み" : "タップして対象に設定"}</span>
                      </button>
                      {selected && areaConditionEnabled && (
                        <div className="space-y-2 border-t-thin border-border pt-2">
                          <label className="block space-y-1">
                            <span className="text-[10px] font-bold">このエリアで必要な利用店舗数</span>
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              value={areaRequirement(area.id)}
                              aria-label={`${area.name}で必要な利用店舗数`}
                              aria-invalid={areaRequirement(area.id) < 1 || areaRequirement(area.id) > 100}
                              onChange={(event) => setAreaRequirement(area.id, Number(event.target.value))}
                            />
                            <span className="block text-[10px] text-muted-foreground">このエリアの対象店舗: {count} 店舗</span>
                          </label>
                          <label className="flex items-center gap-2 text-[10px] font-bold">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={qualification.requiredAreaIds.includes(area.id)}
                              onChange={(event) => setRequiredArea(area.id, event.target.checked)}
                            />
                            このエリアを必須にする
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>

          {areaConditionEnabled && <p className="text-[10px] leading-relaxed text-muted-foreground">各エリアの設定数以上の異なる店舗を利用すると、そのエリアを達成します。必須エリアは必ず達成が必要です。</p>}
          {(invalidAreaRequirements || invalidQualification || invalidTotalRequirement) && <p className="text-[10px] text-error" role="alert">必要数が範囲外か、条件を満たせるエリア・店舗が不足しています。対象エリアとサークルの場所を確認してください。</p>}

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

          {invalidSettings && <p className="text-xs text-error" role="alert">設定内容を確認してください。達成条件を満たせる対象店舗と景品交換場所が必要です。</p>}
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
