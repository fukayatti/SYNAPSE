import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { visitorApi, eventApi, wristbandApi } from "@/lib/api";
import { getVisitor, saveVisitor, useVisitor } from "@/hooks/useVisitor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveAssetUrl } from "@/lib/asset-url";
import { AllergenSelector } from "@/components/menu/AllergenSelector";
import { QrScannerModal } from "@/components/pos/qr-scanner-modal";
import { parseJapaneseAllergens, type JapaneseAllergen } from "@fesflow/config/allergens";

/**
 * 来場者オンボーディング / プロフィール編集 (2026-07-04, 2026-07-15 編集モード追加)。
 *
 * `?edit=1` で開くと同じフォームを「編集」として使う (マイページの[情報を編集]から遷移)。
 * 初回登録と編集で入力項目は同じなので、画面を分けずコピーと遷移先だけ切り替える。
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = searchParams.get("edit") === "1";
  const isAllergyEdit = searchParams.get("allergies") === "1";
  const { isLoaded, isEntered, session, userId } = useVisitor();
  const [nickname, setNickname] = useState("");
  const [birthdayMonth, setBirthdayMonth] = useState("");
  const [birthdayDay, setBirthdayDay] = useState("");
  const [age, setAge] = useState("");
  const [step, setStep] = useState<"profile" | "family" | "allergies">(isAllergyEdit ? "allergies" : "profile");
  const [allergies, setAllergies] = useState<JapaneseAllergen[] | null>(null);
  const [isFamilyScannerOpen, setIsFamilyScannerOpen] = useState(false);
  const [familyCode, setFamilyCode] = useState("");
  const [familyNickname, setFamilyNickname] = useState("");
  const [familyBirthdayMonth, setFamilyBirthdayMonth] = useState("");
  const [familyBirthdayDay, setFamilyBirthdayDay] = useState("");
  const [familyAge, setFamilyAge] = useState("");
  const queryClient = useQueryClient();
  const isAdmissionWizard = !isEdit && !isAllergyEdit;

  // 入場前(セッション無し)に直接来たら入場を促す
  useEffect(() => {
    if (isLoaded && !isEntered) {
      navigate("/visitor", { replace: true });
    }
  }, [isLoaded, isEntered, navigate]);

  // 編集モードでは既に登録済みかを確認する。未登録の来場者が編集URLから
  // 誕生日・年齢を省略して送信すると、APIが400で拒否するため必須状態を合わせる。
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["visitorProfile", userId],
    queryFn: () => wristbandApi.lookup(userId!),
    enabled: (isEdit || isAllergyEdit || step === "family") && !!userId,
  });

  useEffect(() => {
    if (profile?.user.nickname) setNickname(profile.user.nickname);
    else if (session?.nickname) setNickname(session.nickname);
  }, [profile?.user.nickname, session?.nickname]);

  useEffect(() => {
    const [month = "", day = ""] = profile?.user.birthdayMonthDay?.split("-") ?? [];
    if (month) setBirthdayMonth(String(Number(month)));
    if (day) setBirthdayDay(String(Number(day)));
    if (profile?.user.age != null) setAge(String(profile.user.age));
  }, [profile?.user.birthdayMonthDay, profile?.user.age]);

  useEffect(() => {
    if (profile?.user.allergies !== undefined) {
      setAllergies(parseJapaneseAllergens(profile.user.allergies));
    }
  }, [profile?.user.allergies]);

  // 2026-10-08: 生年を集めない要件のため月日を別選択にし、2月29日も選べるよううるう年で日数を出す。
  const daysInBirthdayMonth = birthdayMonth
    ? new Date(Date.UTC(2000, Number(birthdayMonth), 0)).getUTCDate()
    : 31;
  const birthdayMonthDay = birthdayMonth && birthdayDay
    ? birthdayMonth.padStart(2, "0") + "-" + birthdayDay.padStart(2, "0")
    : "";
  const ageNumber = age === "" ? undefined : Number(age);
  const hasValidAge =
    ageNumber !== undefined && Number.isInteger(ageNumber) && ageNumber >= 0 && ageNumber <= 120;
  const hasBirthday = !!birthdayMonthDay && Number(birthdayDay) <= daysInBirthdayMonth;
  const requiresAdmissionDetails = !isEdit || !profile?.user.onboardedAt;
  const hasRequiredAdmissionDetails = !requiresAdmissionDetails || (hasBirthday && hasValidAge);

  const mutation = useMutation({
    mutationFn: () => {
      const v = getVisitor();
      if (!v?.userId) throw new Error("セッションが見つかりません");
      return visitorApi.onboard({
        userId: v.userId,
        wristbandId: v.wristbandId,
        nickname: nickname.trim(),
        birthdayMonthDay: hasBirthday ? birthdayMonthDay : undefined,
        age: hasValidAge ? ageNumber : undefined,
      });
    },
    onSuccess: (result) => {
      const v = getVisitor();
      if (v) {
        saveVisitor({
          ...v,
          nickname: result.nickname,
          onboarded: !!result.onboardedAt,
        });
      }
      if (isEdit) {
        toast.success("プロフィールを保存しました");
        navigate("/visitor/mypage", { replace: true });
      } else {
        // 2026-10-16: 家族のバンド登録をアレルギー申告より先に完了し、家族全体の情報を一度に確認する。
        toast.success("ご本人の情報を登録しました");
        setStep("family");
      }
    },
    onError: (e: any) => toast.error(e?.message || (isEdit ? "保存に失敗しました" : "登録に失敗しました")),
  });

  const familyMutation = useMutation({
    mutationFn: () => {
      const visitor = getVisitor();
      if (!visitor?.userId) throw new Error("セッションが見つかりません");
      const birthdayMonthDay = familyBirthdayMonth && familyBirthdayDay
        ? `${familyBirthdayMonth.padStart(2, "0")}-${familyBirthdayDay.padStart(2, "0")}`
        : "";
      return wristbandApi.addFamilyMember({
        userId: visitor.userId,
        wristbandId: familyCode.trim(),
        nickname: familyNickname.trim(),
        birthdayMonthDay,
        age: Number(familyAge),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["visitorProfile", userId] });
      setFamilyCode("");
      setFamilyNickname("");
      setFamilyBirthdayMonth("");
      setFamilyBirthdayDay("");
      setFamilyAge("");
      toast.success("家族のリストバンドを登録しました。続けて追加できます");
    },
    onError: (e: any) => toast.error(e?.message || "家族の追加に失敗しました"),
  });

  const allergiesMutation = useMutation({
    mutationFn: () => {
      const visitor = getVisitor();
      if (!visitor?.userId) throw new Error("セッションが見つかりません");
      if (allergies === null) throw new Error("アレルゲンまたは『なし』を選択してください");
      return visitorApi.updateAllergies(visitor.userId, allergies);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["userWristbandStatus", userId] });
      toast.success(isAllergyEdit ? "家族のアレルギーを保存しました" : "入場登録が完了しました");
      navigate("/visitor/mypage", { replace: true });
    },
    onError: (e: any) => toast.error(e?.message || "アレルギーを保存できませんでした"),
  });

  const v = getVisitor();
  const eventId = v?.eventId;

  // eventData はロゴ・イベント名の表示にのみ使う装飾的な値で、フォーム自体(ニックネーム登録)は
  // eventData 無しでも成立する。取得失敗時は `eventData ? ... : "ようこそ"` のフォールバックが
  // 効くため、isError/ErrorState は追加せず現状維持とする (判断: 2026-07-07)。
  const { data: eventData } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => eventApi.get(eventId!),
    enabled: !!eventId,
  });

  return (
    <div className="mx-auto max-w-md px-4 py-10 font-mono">
      {eventData?.logoUrl && (
        <div className="mb-6 border-[3px] border-border p-2 bg-background">
          <img
            src={resolveAssetUrl(eventData.logoUrl)}
            alt={eventData.eventName}
            className="w-full h-auto max-h-32 object-contain mx-auto block"
          />
        </div>
      )}
      <div className="border-[3px] border-border p-6 space-y-6">
        {isAdmissionWizard && (
          /* 2026-10-16: イベント作成ウィザードと揃え、各工程の下線と現在地の反転で進捗を示す。 */
          <ol aria-label="入場登録の進行状況" className="flex items-center justify-between gap-2 text-center text-[10px] font-bold sm:text-xs">
            {([
              ["profile", "本人情報"],
              ["family", "家族の登録"],
              ["allergies", "アレルギー"],
            ] as const).map(([stepId, label], index) => {
              const activeIndex = ["profile", "family", "allergies"].indexOf(step);
              const isComplete = index < activeIndex;
              const isActive = step === stepId;
              return (
                <li
                  key={stepId}
                  aria-current={isActive ? "step" : undefined}
                  className={`min-w-0 flex-1 border-b-thick pb-2 ${isActive ? "border-primary text-foreground" : "border-border text-muted-foreground"}`}
                >
                  <span className={`mr-1 ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{isComplete ? "✓" : index + 1}</span>{label}
                </li>
              );
            })}
          </ol>
        )}
        {step === "allergies" || isAllergyEdit ? (
          <>
            {isAdmissionWizard && (
              <button
                type="button"
                onClick={() => setStep("family")}
                className="text-xs uppercase tracking-widest underline hover:text-info"
              >
                ← 家族の登録に戻る
              </button>
            )}
            {isAllergyEdit && (
              <button
                onClick={() => navigate("/visitor/mypage")}
                className="text-xs uppercase tracking-widest underline hover:text-info"
              >
                ← マイページに戻る
              </button>
            )}
            <div className="space-y-1">
              <h1 className="text-2xl font-black uppercase tracking-wider">家族のアレルギー登録</h1>
              <p className="text-sm text-muted-foreground">
                ご家族の中に一人でも当てはまる品目があれば選んでください。家族全員の情報として登録し、注文時にメニュー・トッピングと照合して警告します。
              </p>
            </div>
            <AllergenSelector
              value={allergies}
              onChange={setAllergies}
              helpText="28品目から家族のどなたかに該当するものをすべて選択してください。該当する品目がない場合も「アレルゲンなし」を選んでください。"
            />
            <Button
              type="button"
              className="w-full h-12 rounded-none border-[2px] uppercase font-black"
              onClick={() => allergiesMutation.mutate()}
              disabled={allergies === null || allergiesMutation.isPending}
            >
              {allergiesMutation.isPending ? "保存中..." : isAllergyEdit ? "家族のアレルギーを保存" : "アレルギーを登録して入場"}
            </Button>
          </>
        ) : step === "family" && isAdmissionWizard ? (
          <>
            <button
              type="button"
              onClick={() => setStep("profile")}
              className="text-xs uppercase tracking-widest underline hover:text-info"
            >
              ← 本人情報に戻る
            </button>
            <div className="space-y-1">
              <h1 className="text-2xl font-black uppercase tracking-wider">家族のリストバンド</h1>
              <p className="text-sm text-muted-foreground">
                家族のリストバンドを撮影して追加し、ご本人と同じ情報を登録してください。複数人いる場合は続けて登録できます。
              </p>
            </div>

            <section aria-labelledby="family-registered-heading" className="space-y-2 border-b-thin border-border pb-4">
              <div className="flex items-center justify-between gap-2">
                <h2 id="family-registered-heading" className="text-xs font-black uppercase tracking-wider">登録した家族</h2>
                <span className="text-[10px] text-muted-foreground">{profileLoading ? "読込中…" : `${(profile?.familyWristbands ?? []).filter((band) => band.id !== session?.wristbandId).length}人`}</span>
              </div>
              {(profile?.familyWristbands ?? [])
                .filter((band) => band.id !== session?.wristbandId)
                .map((band) => (
                  <div key={band.id} className="border-thin border-border bg-muted/20 px-3 py-2 text-xs">
                    <p className="font-bold">{band.nickname || "ニックネーム未設定"} · {band.age == null ? "年齢未設定" : `${band.age}歳`}</p>
                    <p className="text-muted-foreground">誕生日 {band.birthdayMonthDay || "未設定"}</p>
                  </div>
                ))}
              {!profileLoading && (profile?.familyWristbands ?? []).filter((band) => band.id !== session?.wristbandId).length === 0 && (
                <p className="text-xs text-muted-foreground">まだ家族のリストバンドは登録されていません。</p>
              )}
            </section>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground" htmlFor="family-wristband-code">
                  リストバンド <span className="text-destructive">*</span>
                </label>
                <Button type="button" variant="outline" className="w-full" onClick={() => setIsFamilyScannerOpen(true)}>
                  リストバンドを撮影して読み取る
                </Button>
                <Input
                  id="family-wristband-code"
                  aria-label="読み取ったリストバンドコード"
                  value={familyCode}
                  onChange={(e) => setFamilyCode(e.target.value)}
                  placeholder="読み取りが難しい場合はコードを入力"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground" htmlFor="family-nickname">
                  ニックネーム <span className="text-destructive">*</span>
                </label>
                <Input id="family-nickname" value={familyNickname} onChange={(e) => setFamilyNickname(e.target.value)} placeholder="例: はなこ" maxLength={30} />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">誕生日（月日） <span className="text-destructive">*</span></label>
                <div className="flex items-center gap-3">
                  <select
                    aria-label="家族の誕生日の月"
                    value={familyBirthdayMonth}
                    onChange={(e) => { setFamilyBirthdayMonth(e.target.value); setFamilyBirthdayDay(""); }}
                    className="h-11 min-w-0 flex-1 border-[2px] bg-input px-3 font-mono"
                  >
                    <option value="">月を選択</option>
                    {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((month) => <option key={month} value={month}>{month}月</option>)}
                  </select>
                  <select
                    aria-label="家族の誕生日の日"
                    value={familyBirthdayDay}
                    onChange={(e) => setFamilyBirthdayDay(e.target.value)}
                    disabled={!familyBirthdayMonth}
                    className="h-11 min-w-0 flex-1 border-[2px] bg-input px-3 font-mono disabled:opacity-50"
                  >
                    <option value="">日を選択</option>
                    {Array.from({ length: familyBirthdayMonth ? new Date(Date.UTC(2000, Number(familyBirthdayMonth), 0)).getUTCDate() : 0 }, (_, index) => String(index + 1)).map((day) => <option key={day} value={day}>{day}日</option>)}
                  </select>
                </div>
                <p className="text-[10px] text-muted-foreground">誕生日は月日だけ入力してください。</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="family-age" className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">年齢 <span className="text-destructive">*</span></label>
                <Input id="family-age" type="number" inputMode="numeric" min={0} max={120} step={1} value={familyAge} onChange={(e) => setFamilyAge(e.target.value)} placeholder="例: 10" />
                {familyAge !== "" && (!Number.isInteger(Number(familyAge)) || Number(familyAge) < 0 || Number(familyAge) > 120) && (
                  <p className="text-xs text-destructive">0〜120の整数を入力してください。</p>
                )}
              </div>

              <Button
                type="button"
                className="w-full h-12"
                disabled={!familyCode.trim() || !familyNickname.trim() || !familyBirthdayMonth || !familyBirthdayDay || familyAge === "" || !Number.isInteger(Number(familyAge)) || Number(familyAge) < 0 || Number(familyAge) > 120 || familyMutation.isPending}
                onClick={() => familyMutation.mutate()}
              >
                {familyMutation.isPending ? "登録しています…" : "家族を登録して次を追加"}
              </Button>
            </div>

            <div className="space-y-3 border-t-thin border-border pt-4">
              <Button type="button" variant="outline" className="w-full" onClick={() => setStep("allergies")}>
                家族の登録を終えて次へ
              </Button>
              <p className="text-center text-[10px] text-muted-foreground">家族がいない場合も、そのまま次へ進めます。</p>
            </div>
          </>
        ) : (
          <>
        {isEdit && (
          <button
            onClick={() => navigate("/visitor/mypage")}
            className="text-xs uppercase tracking-widest underline hover:text-info"
          >
            ← マイページに戻る
          </button>
        )}
        <div className="space-y-1">
          <h1 className="text-2xl font-black uppercase tracking-wider">
            {isEdit ? "プロフィール編集" : eventData?.eventName || "ようこそ"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? requiresAdmissionDetails
                ? "ニックネーム・誕生日・年齢を登録してください。"
                : "ニックネーム・誕生日・年齢を編集できます。"
              : "ニックネーム・誕生日・年齢を登録してください。誕生日は月日だけで入力できます。"}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="visitor-birthday-month" className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
            誕生日（月日） {requiresAdmissionDetails && <span className="text-destructive">*</span>}
          </label>
          <div className="flex items-center gap-3">
            <select
              id="visitor-birthday-month"
              value={birthdayMonth}
              onChange={(e) => {
                const month = e.target.value;
                setBirthdayMonth(month);
                if (!month || Number(birthdayDay) > new Date(Date.UTC(2000, Number(month), 0)).getUTCDate()) {
                  setBirthdayDay("");
                }
              }}
              aria-label="誕生日の月"
              required={requiresAdmissionDetails}
              className="h-11 min-w-0 flex-1 rounded-none border-[2px] bg-input px-3 font-mono"
            >
              <option value="">月を選択</option>
              {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((month) => (
                <option key={month} value={month}>{month}月</option>
              ))}
            </select>
            <select
              id="visitor-birthday-day"
              value={birthdayDay}
              onChange={(e) => setBirthdayDay(e.target.value)}
              aria-label="誕生日の日"
              required={requiresAdmissionDetails}
              disabled={!birthdayMonth}
              className="h-11 min-w-0 flex-1 rounded-none border-[2px] bg-input px-3 font-mono disabled:opacity-50"
            >
              <option value="">日を選択</option>
              {Array.from({ length: daysInBirthdayMonth }, (_, index) => String(index + 1)).map((day) => (
                <option key={day} value={day}>{day}日</option>
              ))}
            </select>
          </div>
          <p className="text-[10px] text-muted-foreground">誕生日は月日だけ入力してください。</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="visitor-age" className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
            年齢 {requiresAdmissionDetails && <span className="text-destructive">*</span>}
          </label>
          <Input
            id="visitor-age"
            type="number"
            inputMode="numeric"
            min={0}
            max={120}
            step={1}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="例: 16"
            required={requiresAdmissionDetails}
            aria-invalid={age !== "" && !hasValidAge}
            className="rounded-none border-[2px] h-11"
          />
          {age !== "" && !hasValidAge && (
            <p className="text-xs text-destructive">0〜120の整数を入力してください。</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
            ニックネーム <span className="text-destructive">*</span>
          </label>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="例: たろう"
            maxLength={30}
            className="rounded-none border-[2px] h-11"
          />
        </div>

        <Button
          type="button"
          className="w-full h-12 rounded-none border-[2px] uppercase font-black"
          onClick={() => mutation.mutate()}
          disabled={
            mutation.isPending ||
            profileLoading ||
            !nickname.trim() ||
            !hasRequiredAdmissionDetails ||
            (age !== "" && !hasValidAge)
          }
        >
          {mutation.isPending ? "保存中..." : isEdit ? "保存する" : "はじめる"}
        </Button>
          </>
        )}
      </div>
      <QrScannerModal
        circleId={eventId ?? ""}
        isOpen={isFamilyScannerOpen}
        onClose={() => setIsFamilyScannerOpen(false)}
        mode="customer"
        onCustomerScanned={(_, wristbandId) => {
          if (!wristbandId) {
            toast.error("リストバンドのQRコードを読み取ってください");
            return;
          }
          setFamilyCode(wristbandId);
          toast.success("リストバンドを読み取りました");
        }}
      />
    </div>
  );
}
