import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Pencil, Plus, UserRoundCog, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { parseJapaneseAllergens, type JapaneseAllergen } from "@fesflow/config/allergens";
import { VISITOR_AGE_GROUPS, visitorAgeGroupLabel, type VisitorAgeGroup } from "@fesflow/config/visitor-profile";
import { AllergenSelector } from "@/components/menu/AllergenSelector";
import { QrScannerModal } from "@/components/pos/qr-scanner-modal";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useVisitor } from "@/hooks/useVisitor";
import { type WristbandLookupResult, visitorApi, wristbandApi } from "@/lib/api";
import { PushNotificationControl } from "@/components/PushNotificationControl";

type Wristband = WristbandLookupResult["familyWristbands"][number];

// 2026-10-16: 追加と編集で同じプロフィール項目を使い、バンド情報の入力方法を揃える。
function WristbandProfileFields({
  idPrefix,
  nickname,
  ageGroup,
  onNicknameChange,
  onAgeGroupChange,
}: {
  idPrefix: string;
  nickname: string;
  ageGroup: VisitorAgeGroup | "";
  onNicknameChange: (value: string) => void;
  onAgeGroupChange: (value: VisitorAgeGroup | "") => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-nickname`} className="text-xs font-bold">ニックネーム</label>
        <Input id={`${idPrefix}-nickname`} value={nickname} onChange={(event) => onNicknameChange(event.target.value)} maxLength={30} autoComplete="nickname" />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-age-group`} className="text-xs font-bold">年代</label>
        <select id={`${idPrefix}-age-group`} value={ageGroup} onChange={(event) => onAgeGroupChange(event.target.value as VisitorAgeGroup | "")} className="h-10 w-full border-thick border-border bg-input px-2 font-mono text-xs">
          <option value="">年代を選択</option>
          {VISITOR_AGE_GROUPS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// 2026-10-16: マイQRから登録情報を分離し、共有アカウントの設定を一か所にまとめる。
export default function VisitorAccountPage() {
  const navigate = useNavigate();
  const { session, userId, isLoaded } = useVisitor();
  const eventId = session?.eventId ?? "";
  const queryClient = useQueryClient();

  const [isAddingBand, setIsAddingBand] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [bandCode, setBandCode] = useState("");
  const [bandNickname, setBandNickname] = useState("");
  const [bandAgeGroup, setBandAgeGroup] = useState<VisitorAgeGroup | "">("");
  const [editingBandId, setEditingBandId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState("");
  const [editAgeGroup, setEditAgeGroup] = useState<VisitorAgeGroup | "">("");
  const [allergies, setAllergies] = useState<JapaneseAllergen[] | null>(null);
  const [isAllergyEditorOpen, setIsAllergyEditorOpen] = useState(false);

  const query = useQuery({
    queryKey: ["userWristbandStatus", userId],
    queryFn: () => wristbandApi.lookup(userId!),
    enabled: !!userId,
  });
  const user = query.data?.user;
  const registeredWristbands = query.data?.familyWristbands ?? [];

  useEffect(() => {
    if (user) setAllergies(parseJapaneseAllergens(user.allergies));
  }, [user?.allergies]);

  const addBandMutation = useMutation({
    mutationFn: () => wristbandApi.addFamilyMember({
      userId: userId!,
      wristbandId: bandCode.trim(),
      nickname: bandNickname.trim(),
      ageGroup: bandAgeGroup as VisitorAgeGroup,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["userWristbandStatus", userId] });
      setBandCode("");
      setBandNickname("");
      setBandAgeGroup("");
      setIsAddingBand(false);
      setIsAllergyEditorOpen(true);
      toast.success("リストバンドを登録しました。アカウント全体のアレルギー情報も確認してください。");
    },
    onError: (error) => toast.error(errorMessage(error, "リストバンドを登録できませんでした")),
  });

  const editBandMutation = useMutation({
    mutationFn: () => wristbandApi.updateFamilyMember({
      userId: userId!,
      wristbandId: editingBandId!,
      nickname: editNickname.trim(),
      ageGroup: editAgeGroup as VisitorAgeGroup,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["userWristbandStatus", userId] });
      setEditingBandId(null);
      toast.success("リストバンドの情報を保存しました");
    },
    onError: (error) => toast.error(errorMessage(error, "リストバンドの情報を保存できませんでした")),
  });

  const beginEdit = (band: Wristband) => {
    setEditingBandId(band.id);
    setEditNickname(band.nickname ?? "");
    setEditAgeGroup(band.ageGroup ?? "");
  };

  const allergyMutation = useMutation({
    mutationFn: () => {
      if (allergies === null) throw new Error("アレルゲンまたは『なし』を選択してください");
      return visitorApi.updateAllergies(userId!, allergies);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["userWristbandStatus", userId] });
      setIsAllergyEditorOpen(false);
      toast.success("アカウントのアレルギー情報を保存しました");
    },
    onError: (error) => toast.error(errorMessage(error, "アレルギー情報を保存できませんでした")),
  });

  if (!isLoaded || query.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 font-mono" aria-label="アカウント情報を読み込み中">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-2xl p-4 font-mono">
        <ErrorState error={query.error} title="アカウント情報を読み込めませんでした" onRetry={() => query.refetch()} />
      </div>
    );
  }

  const isValidBandProfile = (nickname: string, ageGroup: string) => !!nickname.trim() && !!ageGroup;
  const savedAllergies = allergies === null ? null : allergies.length ? allergies.join("・") : "アレルゲンなし";

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 pb-10 font-mono sm:py-8">
      <button type="button" onClick={() => navigate("/visitor/mypage")} className="inline-flex min-h-11 items-center gap-1 text-xs font-bold underline underline-offset-2 hover:text-info">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        マイQRに戻る
      </button>

      <header className="space-y-1 border-b-thick border-border pb-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">マイQR / アカウント</p>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">アカウント管理</h1>
        <p className="text-xs leading-relaxed text-muted-foreground">プロフィール、登録リストバンド、アレルギー情報を確認・編集できます。</p>
      </header>

      <section aria-labelledby="account-profile-title" className="space-y-3 border-b-thin border-border pb-5">
        <div className="flex items-center justify-between gap-4">
          <h2 id="account-profile-title" className="flex items-center gap-2 text-base font-black">
            <UserRoundCog className="h-5 w-5" aria-hidden="true" />
            アカウントプロフィール
          </h2>
          <Button type="button" variant="outline" onClick={() => navigate("/visitor/onboarding?edit=1")}>
            <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />編集
          </Button>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
          <dt className="text-xs text-muted-foreground">ニックネーム</dt>
          <dd className="font-bold">{user?.nickname || "未設定"}</dd>
          {user?.ageGroup && <><dt className="text-xs text-muted-foreground">年代</dt><dd>{visitorAgeGroupLabel(user.ageGroup)}</dd></>}
        </dl>
      </section>

      <section aria-labelledby="wristbands-title" className="space-y-4">
        <header className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="wristbands-title" className="text-base font-black">登録リストバンド</h2>
            <span className="shrink-0 text-xs font-bold">{registeredWristbands.length}本</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">同じアカウントに登録されたバンドです。バンドごとのプロフィールを編集できます。</p>
        </header>

        {registeredWristbands.length ? (
          <ul className="divide-y divide-border border-y-thin border-border">
            {registeredWristbands.map((band) => (
              <li key={band.id} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-sm font-bold">{band.nickname || "ニックネーム未設定"}</p>
                    <p className="text-xs text-muted-foreground">
                      {visitorAgeGroupLabel(band.ageGroup)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 shrink-0 px-3"
                    aria-expanded={editingBandId === band.id}
                    aria-controls={`edit-band-${band.id}`}
                    onClick={() => editingBandId === band.id ? setEditingBandId(null) : beginEdit(band)}
                  >
                    {editingBandId === band.id ? <X className="mr-1 h-4 w-4" aria-hidden="true" /> : <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />}
                    {editingBandId === band.id ? "閉じる" : "編集"}
                  </Button>
                </div>
                {editingBandId === band.id && (
                  <form
                    id={`edit-band-${band.id}`}
                    className="mt-4 space-y-4 border-l-thick border-border pl-3"
                    onSubmit={(event) => { event.preventDefault(); editBandMutation.mutate(); }}
                  >
                    <WristbandProfileFields
                      idPrefix={`edit-${band.id}`}
                      nickname={editNickname}
                      ageGroup={editAgeGroup}
                      onNicknameChange={setEditNickname}
                      onAgeGroupChange={setEditAgeGroup}
                    />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingBandId(null)}>キャンセル</Button>
                      <Button type="submit" className="flex-1" disabled={!isValidBandProfile(editNickname, editAgeGroup) || editBandMutation.isPending}>
                        {editBandMutation.isPending ? "保存中…" : "保存"}
                      </Button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-l-thick border-border bg-muted/40 px-3 py-3 text-sm">登録済みのリストバンドはありません。</p>
        )}

        <Button type="button" variant="outline" className="w-full" onClick={() => setIsAddingBand(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          リストバンドを追加
        </Button>
        {/* 2026-10-16: 入力フォームは一覧から分け、カメラ読み取り後もそのまま入力できるモーダルにする。 */}
        <Modal
          isOpen={isAddingBand}
          onClose={() => setIsAddingBand(false)}
          title="新しいバンドを登録"
          subtitle="受付前で、まだ登録されていないリストバンドを追加できます。"
          maxWidth="md"
        >
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); addBandMutation.mutate(); }}>
            <div className="space-y-1">
              <label htmlFor="new-band-code" className="text-xs font-bold">リストバンドのQRコード</label>
              <div className="flex gap-2">
                <Input id="new-band-code" value={bandCode} onChange={(event) => setBandCode(event.target.value)} className="min-w-0 flex-1" autoCapitalize="none" />
                <Button type="button" variant="outline" className="shrink-0 px-3" onClick={() => setIsScannerOpen(true)}>
                  <Camera className="mr-1 h-4 w-4" aria-hidden="true" />撮影
                </Button>
              </div>
            </div>
            <WristbandProfileFields
              idPrefix="new-band"
              nickname={bandNickname}
              ageGroup={bandAgeGroup}
              onNicknameChange={setBandNickname}
              onAgeGroupChange={setBandAgeGroup}
            />
            <Button type="submit" className="w-full" disabled={!bandCode.trim() || !isValidBandProfile(bandNickname, bandAgeGroup) || addBandMutation.isPending}>
              {addBandMutation.isPending ? "登録中…" : "このバンドを登録"}
            </Button>
          </form>
        </Modal>
      </section>

      <section aria-labelledby="allergies-title" className="space-y-3 border-t-thick border-border pt-5">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id="allergies-title" className="text-base font-black">アカウントのアレルギー</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">注文時のアレルギー警告に使います。アカウント内で該当する品目をすべて登録してください。</p>
          </div>
          <Button type="button" variant="outline" className="shrink-0" onClick={() => setIsAllergyEditorOpen(true)}>
            {savedAllergies === null ? "登録する" : "編集"}
          </Button>
        </header>
        <p className="border-l-thick border-border bg-muted/40 px-3 py-3 text-sm font-bold">
          {savedAllergies ?? "未登録です。注文前に登録してください。"}
        </p>
        {/* 2026-10-16: 多い選択肢をページに展開せず、フォーカス可能な設定モーダルにまとめる。 */}
        <Modal
          isOpen={isAllergyEditorOpen}
          onClose={() => { setAllergies(parseJapaneseAllergens(user?.allergies)); setIsAllergyEditorOpen(false); }}
          title="アレルギー情報を設定"
          subtitle="アカウント内で該当する品目をすべて登録してください。"
          maxWidth="md"
        >
          <div className="space-y-3">
            {addBandMutation.isSuccess && (
              <p role="status" className="border-l-thick border-warning bg-warning/10 px-3 py-2 text-xs font-bold">
                バンドを追加しました。アカウント内で該当するアレルゲンを確認してください。
              </p>
            )}
            <AllergenSelector
              value={allergies}
              onChange={setAllergies}
              helpText="アカウントに登録された方のうち、一人でも該当する品目を選択してください。該当しない場合は『アレルゲンなし』を選びます。"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setAllergies(parseJapaneseAllergens(user?.allergies)); setIsAllergyEditorOpen(false); }}>キャンセル</Button>
              <Button type="button" className="flex-1" disabled={allergies === null || allergyMutation.isPending} onClick={() => allergyMutation.mutate()}>
                {allergyMutation.isPending ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </Modal>
      </section>

      <section aria-labelledby="notification-settings-title" className="space-y-3 border-t-thick border-border pt-5">
        <header className="space-y-1">
          <h2 id="notification-settings-title" className="text-base font-black">通知設定</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">注文の完成やイベントからのお知らせを、この端末で受け取れます。</p>
        </header>
        <PushNotificationControl ownerType="visitor" />
      </section>

      <QrScannerModal
        circleId={eventId}
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        mode="customer"
        onCustomerScanned={(_, wristbandId) => {
          if (!wristbandId) {
            toast.error("リストバンドのQRコードを読み取ってください");
            return;
          }
          setIsScannerOpen(false);
          setBandCode(wristbandId);
          setIsAddingBand(true);
          toast.success("QRコードを読み取りました。プロフィールを入力してください。");
        }}
      />
    </div>
  );
}
