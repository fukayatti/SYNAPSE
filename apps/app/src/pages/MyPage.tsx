import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { wristbandApi, eventApi, visitorApi } from "@/lib/api";
import { useVisitor, saveVisitor } from "@/hooks/useVisitor";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, QrCode, Receipt, ChevronRight, UserCog, Pencil, Ticket, Camera } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { resolveAssetUrl } from "@/lib/asset-url";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AllergenSelector } from "@/components/menu/AllergenSelector";
import { QrScannerModal } from "@/components/pos/qr-scanner-modal";
import { parseJapaneseAllergens, type JapaneseAllergen } from "@fesflow/config/allergens";

/**
 * 来場者マイページ (2026-07-11 注文履歴を /orders に分離しマイQR/身分表示に専念)。
 *
 * 来場者は eventUser.id ベアラーのみ (旧 useAuth/useGuestUser シムは撤去済み)。
 * リストバンドの登録/再発行/紛失処理はスマホ側では行わず、本部(イベント管理)で行う。
 */
export default function MyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramEventId = searchParams.get("eventId");
  const action = searchParams.get("action");

  const { session, userId: visitorUserId, isLoaded } = useVisitor();
  const eventId = paramEventId || session?.eventId;
  const userId = visitorUserId ?? "";

  const [origin, setOrigin] = useState("");
  const [isIssuing, setIsIssuing] = useState(false);
  const [familyCode, setFamilyCode] = useState("");
  const [familyNickname, setFamilyNickname] = useState("");
  const [familyMonth, setFamilyMonth] = useState("");
  const [familyDay, setFamilyDay] = useState("");
  const [familyAge, setFamilyAge] = useState("");
  const [isFamilyScannerOpen, setIsFamilyScannerOpen] = useState(false);
  const [editingFamilyWristbandId, setEditingFamilyWristbandId] = useState<string | null>(null);
  const [editFamilyNickname, setEditFamilyNickname] = useState("");
  const [editFamilyMonth, setEditFamilyMonth] = useState("");
  const [editFamilyDay, setEditFamilyDay] = useState("");
  const [editFamilyAge, setEditFamilyAge] = useState("");
  const [familyAllergies, setFamilyAllergies] = useState<JapaneseAllergen[] | null>(null);
  const [isAllergyEditorOpen, setIsAllergyEditorOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  // 2026-07-12: セルフ発行用QRスキャン時の自動発行処理
  useEffect(() => {
    if (action === "issue" && paramEventId && isLoaded) {
      if (session && session.eventId === paramEventId && session.userId) {
        // すでに現在のイベントのセッションがローカルストレージにある場合はクリーンなURLにリダイレクトして通常表示
        navigate("/visitor/mypage", { replace: true });
        return;
      }

      const runIssue = async () => {
        setIsIssuing(true);
        try {
          // 物理リストバンドなし（スマホのみ）のイベントとして ID とデジタルQR用疑似バンドを発行
          const res = await wristbandApi.issue(paramEventId);
          saveVisitor({
            userId: res.userId,
            wristbandId: res.wristbandId,
            eventId: paramEventId,
            displayId: res.displayId,
            nickname: null,
            onboarded: false,
          });
          toast.success("デジタルQRを発行しました！");
          navigate("/visitor/onboarding", { replace: true });
        } catch (e) {
          console.error("Self issuance failed:", e);
          alert("QRコードのセルフ発行に失敗しました。再試行してください。");
        } finally {
          setIsIssuing(false);
        }
      };
      runIssue();
    }
  }, [action, paramEventId, session, isLoaded, navigate]);

  // eventData はヘッダーのロゴ表示のみに使う装飾的な値。取得失敗しても
  // ロゴが出ないだけで画面は成立するため ErrorState は出さない (判断: 2026-07-07)。
  const { data: eventData } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => eventApi.get(eventId!),
    enabled: !!eventId,
  });

  // ユーザー＆リストバンド状態取得 (マイQRの表示IDに使う)
  const {
    data: userStatus,
    isLoading: statusLoading,
    isError: statusError,
    error: statusErrorObj,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["userWristbandStatus", userId],
    queryFn: () => wristbandApi.lookup(userId),
    enabled: !!userId && !isIssuing,
  });

  const familyMutation = useMutation({
    mutationFn: () => {
      const monthDay = familyMonth && familyDay
        ? `${familyMonth.padStart(2, "0")}-${familyDay.padStart(2, "0")}`
        : "";
      return wristbandApi.addFamilyMember({
        userId,
        wristbandId: familyCode.trim(),
        nickname: familyNickname.trim(),
        birthdayMonthDay: monthDay,
        age: Number(familyAge),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["userWristbandStatus", userId] });
      setFamilyCode("");
      setFamilyNickname("");
      setFamilyMonth("");
      setFamilyDay("");
      setFamilyAge("");
      setIsAllergyEditorOpen(true);
      toast.success("家族のリストバンドを追加しました");
    },
    onError: (e: any) => toast.error(e?.message || "家族の追加に失敗しました"),
  });

  const familyUpdateMutation = useMutation({
    mutationFn: () => wristbandApi.updateFamilyMember({
      userId,
      wristbandId: editingFamilyWristbandId!,
      nickname: editFamilyNickname.trim(),
      birthdayMonthDay: `${editFamilyMonth.padStart(2, "0")}-${editFamilyDay.padStart(2, "0")}`,
      age: Number(editFamilyAge),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["userWristbandStatus", userId] });
      setEditingFamilyWristbandId(null);
      toast.success("家族の情報を保存しました");
    },
    onError: (e: any) => toast.error(e?.message || "家族の情報を保存できませんでした"),
  });

  const beginFamilyEdit = (band: NonNullable<typeof userStatus>["familyWristbands"][number]) => {
    const [month = "", day = ""] = band.birthdayMonthDay?.split("-") ?? [];
    setEditingFamilyWristbandId(band.id);
    setEditFamilyNickname(band.nickname ?? "");
    setEditFamilyMonth(month ? String(Number(month)) : "");
    setEditFamilyDay(day ? String(Number(day)) : "");
    setEditFamilyAge(band.age == null ? "" : String(band.age));
  };

  useEffect(() => {
    if (!userStatus?.user) return;
    const allergies = parseJapaneseAllergens(userStatus.user.allergies);
    setFamilyAllergies(allergies);
    if (allergies === null) setIsAllergyEditorOpen(true);
  }, [userStatus?.user.allergies]);

  const allergiesMutation = useMutation({
    mutationFn: () => {
      if (familyAllergies === null) throw new Error("アレルゲンまたは『なし』を選択してください");
      return visitorApi.updateAllergies(userId, familyAllergies);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["userWristbandStatus", userId] });
      setIsAllergyEditorOpen(false);
      familyMutation.reset();
      toast.success("家族のアレルギーを保存しました");
    },
    onError: (e: any) => toast.error(e?.message || "家族のアレルギーを保存できませんでした"),
  });

  if (!isLoaded || statusLoading || isIssuing) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4 font-mono">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  // userStatus はマイQR・リストバンド状態など画面全体の前提になるため取得失敗時はページ全体を止める。
  if (statusError) {
    return (
      <div className="max-w-3xl mx-auto p-4 font-mono">
        <ErrorState
          error={statusErrorObj}
          title="ユーザー情報の取得に失敗しました"
          onRetry={() => refetchStatus()}
        />
      </div>
    );
  }

  const activeWristband = userStatus?.familyWristbands?.find((band) => band.id === session?.wristbandId) ?? userStatus?.wristband;
  // 2026-10-16: 家族一覧では本人のバンドを除き、各家族の情報だけを編集対象にする。
  const familyMembers = (userStatus?.familyWristbands ?? []).filter((band) => band.id !== activeWristband?.id);
  const targetWbId = activeWristband?.id || userId;
  // 2026-07-13: 来場者の表示QRのURLを物理リストバンドのQRと同じ形式 (/w/:id) に統一する。
  // 店頭レジ側はすでに入力文字列から /w/:id や ?wb=... を解析してIDを抽出できるように修正済みのため、これで動作する。
  const userCheckinUrl = `${origin}/w/${targetWbId}`;

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6 pb-24 font-mono">
      {eventData?.logoUrl && (
        <div className="border-thick border-border p-2 bg-background mb-4">
          <img
            src={resolveAssetUrl(eventData.logoUrl)}
            alt={eventData.eventName}
            className="w-full h-auto max-h-32 object-contain mx-auto block"
          />
        </div>
      )}

      <button
        onClick={() => navigate("/visitor/menu")}
        className="text-xs uppercase tracking-widest underline hover:text-info flex items-center gap-1"
      >
        <ArrowLeft className="h-4 w-4" />
        メニュー選択に戻る
      </button>

      <div className="border-b-thick border-border pb-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tight leading-tight">
          マイQR
        </h1>
        <p className="text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground mt-1">
          店頭でこちらのQRまたはリストバンドをお見せください
        </p>
      </div>

      {/* リストバンド未登録の案内。
          2026-07-11: 登録/再発行/紛失処理はすべて本部(受付/イベント管理)で行う。
          未登録のうちは「使えるQR」を出さない (アクセスしただけで使えると誤解させないため)。
          本部でリストバンドを登録すると、下のマイQRが表示される。 */}
      {!activeWristband && (
        <div className="border-thick border-border bg-muted p-4 flex items-start gap-3">
          <QrCode className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-sm">リストバンドが未登録です</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              マイQRは、受付・本部でリストバンドを登録すると表示されます。
              受付で発行された来場登録QR（またはリストバンドのQR）を読み取って登録してください。
              登録すると、なくしても本部で再発行できます。
            </p>
          </div>
        </div>
      )}

      {/* デジタルQRカード
          2026-07-11: リストバンド未登録の来場者に「使えるQR」を出さないよう、activeWristband がある場合のみ表示する。 */}
      {activeWristband && (
        <Card className="border-heavy border-border bg-primary text-primary-foreground rounded-none p-4 sm:p-6 text-center shadow-none">
          <CardHeader className="p-0 mb-4">
            <div className="inline-block bg-background text-foreground px-3 py-1 text-xs font-black uppercase tracking-widest mx-auto">
              来場用QR
            </div>
          </CardHeader>
          <CardContent className="p-0 space-y-4">
            <div className="bg-background p-3 sm:p-4 inline-block border-thick border-background mx-auto">
              <QRCodeSVG value={userCheckinUrl} size={180} level="M" title="来場用QRコード" className="mx-auto block" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-primary-foreground/70 uppercase tracking-widest">
                来場者ID（呼出番号: {userStatus?.user.displayId || "---"}）
              </p>
              <p className="text-base sm:text-xl font-bold tracking-wider break-all px-2">{userId}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* プロフィール表示と自己編集への導線。 */}
      <div className="border-thick border-border bg-background p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            <UserCog className="h-4 w-4" />
            あなたの情報
          </span>
          <button
            onClick={() => navigate("/visitor/onboarding?edit=1")}
            className="flex items-center gap-1 border-[2px] border-border bg-background px-2.5 py-1 text-[11px] font-black uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            編集
          </button>
        </div>
        <dl className="grid gap-2 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">ニックネーム</dt>
            <dd className="font-bold text-right break-all">
              {userStatus?.user.nickname || <span className="text-muted-foreground font-normal">未設定</span>}
            </dd>
          </div>
        </dl>
      </div>

      {/* 2026-10-15 (#125): 受付前の発行済みバンドだけを家族に追加する。
          登録済みアカウントや過去履歴は統合せず、追加後の注文・スタンプは代表アカウントに集約する。 */}
      <section className="border-thick border-border bg-background p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black uppercase tracking-wider">家族のリストバンド</h2>
          <span className="text-xs font-bold">{familyMembers.length}人登録</span>
        </div>
        <ul className="space-y-2">
          {familyMembers.map((band) => (
            <li key={band.id} className="space-y-3 border-thin border-border bg-muted/20 px-3 py-3 text-xs">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-bold">{band.nickname || "ニックネーム未設定"} · {band.age == null ? "年齢未設定" : `${band.age}歳`}</span>
                  <span className="block truncate text-muted-foreground">{band.id}</span>
                  <span className="block text-muted-foreground">誕生日 {band.birthdayMonthDay || "未設定"}</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 shrink-0 px-2 text-[10px]"
                  aria-expanded={editingFamilyWristbandId === band.id}
                  onClick={() => editingFamilyWristbandId === band.id ? setEditingFamilyWristbandId(null) : beginFamilyEdit(band)}
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  {editingFamilyWristbandId === band.id ? "閉じる" : "編集"}
                </Button>
              </div>
              {editingFamilyWristbandId === band.id && (
                <div className="space-y-2 border-t-thin border-border pt-3">
                  <Input aria-label={`${band.nickname || "家族"}のニックネーム`} value={editFamilyNickname} onChange={(e) => setEditFamilyNickname(e.target.value)} placeholder="ニックネーム" maxLength={30} />
                  <div className="grid grid-cols-3 gap-2">
                    <select aria-label="家族の誕生月" value={editFamilyMonth} onChange={(e) => { setEditFamilyMonth(e.target.value); setEditFamilyDay(""); }} className="h-10 min-w-0 border-thick bg-input px-2 font-mono text-xs">
                      <option value="">誕生月</option>
                      {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((month) => <option key={month} value={month}>{month}月</option>)}
                    </select>
                    <select aria-label="家族の誕生日" value={editFamilyDay} onChange={(e) => setEditFamilyDay(e.target.value)} disabled={!editFamilyMonth} className="h-10 min-w-0 border-thick bg-input px-2 font-mono text-xs disabled:opacity-50">
                      <option value="">誕生日</option>
                      {Array.from({ length: editFamilyMonth ? new Date(Date.UTC(2000, Number(editFamilyMonth), 0)).getUTCDate() : 0 }, (_, index) => String(index + 1)).map((day) => <option key={day} value={day}>{day}日</option>)}
                    </select>
                    <Input aria-label="家族の年齢" type="number" inputMode="numeric" min={0} max={120} step={1} value={editFamilyAge} onChange={(e) => setEditFamilyAge(e.target.value)} placeholder="年齢" className="h-10 px-2 text-xs" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingFamilyWristbandId(null)}>キャンセル</Button>
                    <Button
                      type="button"
                      className="flex-1"
                      disabled={!editFamilyNickname.trim() || !editFamilyMonth || !editFamilyDay || editFamilyAge === "" || !Number.isInteger(Number(editFamilyAge)) || Number(editFamilyAge) < 0 || Number(editFamilyAge) > 120 || familyUpdateMutation.isPending}
                      onClick={() => familyUpdateMutation.mutate()}
                    >
                      {familyUpdateMutation.isPending ? "保存中…" : "保存"}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {familyMembers.length === 0 && <li className="text-xs text-muted-foreground">家族のリストバンドはまだ登録されていません。</li>}
        </ul>
        <div className="space-y-2 border-t-thin border-border pt-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            受付前で、まだ入場登録していない家族のリストバンドを追加できます。別のアカウントや利用履歴は統合されません。
          </p>
          <Button type="button" variant="outline" className="w-full" onClick={() => setIsFamilyScannerOpen(true)}>
            <Camera className="mr-2 h-4 w-4" />
            リストバンドを撮影して読み取る
          </Button>
          <Input
            aria-label="追加する家族のリストバンドコード"
            value={familyCode}
            onChange={(e) => setFamilyCode(e.target.value)}
            placeholder="リストバンドのQRコード値"
            className="rounded-none border-[2px]"
          />
          <Input
            aria-label="家族のニックネーム"
            value={familyNickname}
            onChange={(e) => setFamilyNickname(e.target.value)}
            placeholder="ニックネーム"
            maxLength={30}
            className="rounded-none border-[2px]"
          />
          <div className="grid grid-cols-3 gap-2">
            <select aria-label="家族の誕生月" value={familyMonth} onChange={(e) => { setFamilyMonth(e.target.value); setFamilyDay(""); }} className="h-10 border-[2px] bg-input px-2 font-mono text-xs">
              <option value="">誕生月</option>
              {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((month) => <option key={month} value={month}>{month}月</option>)}
            </select>
            <select aria-label="家族の誕生日" value={familyDay} onChange={(e) => setFamilyDay(e.target.value)} disabled={!familyMonth} className="h-10 border-[2px] bg-input px-2 font-mono text-xs disabled:opacity-50">
              <option value="">誕生日</option>
              {Array.from({ length: familyMonth ? new Date(Date.UTC(2000, Number(familyMonth), 0)).getUTCDate() : 0 }, (_, index) => String(index + 1)).map((day) => <option key={day} value={day}>{day}日</option>)}
            </select>
            <Input aria-label="家族の年齢" type="number" min={0} max={120} step={1} value={familyAge} onChange={(e) => setFamilyAge(e.target.value)} placeholder="年齢" className="h-10 rounded-none border-[2px] px-2" />
          </div>
          <Button
            type="button"
            className="w-full rounded-none"
            disabled={!familyCode.trim() || !familyNickname.trim() || !familyMonth || !familyDay || familyAge === "" || !Number.isInteger(Number(familyAge)) || Number(familyAge) < 0 || Number(familyAge) > 120 || familyMutation.isPending}
            onClick={() => familyMutation.mutate()}
          >
            {familyMutation.isPending ? "追加しています…" : "家族を追加"}
          </Button>
        </div>
      </section>

      {/* 2026-10-15 (#124): アレルギーはリストバンド別でなく家族全員の和集合として保持する。
          家族追加後に必ず編集欄を開き、追加メンバーの申告を確認できるようにする。 */}
      <section className="border-thick border-border bg-background p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black uppercase tracking-wider">家族のアレルギー</h2>
          {!isAllergyEditorOpen && (
            <Button type="button" variant="outline" className="h-8 rounded-none px-2 text-[10px]" onClick={() => setIsAllergyEditorOpen(true)}>
              登録・編集
            </Button>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          ご家族の中に一人でも当てはまる品目をすべて登録してください。注文時にメニューと選択トッピングを照合し、該当時に警告します。
        </p>
        {!isAllergyEditorOpen ? (
          <p className="border-thin border-border bg-muted/20 p-2 text-xs font-bold">
            {familyAllergies === null ? "未登録" : familyAllergies.length > 0 ? familyAllergies.join("・") : "アレルゲンなし"}
          </p>
        ) : (
          <div className="space-y-3">
            {familyMutation.isSuccess && (
              <p role="status" className="border-thick border-warning bg-warning/10 p-2 text-xs font-bold">
                家族を追加しました。家族全員について、該当するアレルゲンを確認・更新してください。
              </p>
            )}
            <AllergenSelector
              value={familyAllergies}
              onChange={setFamilyAllergies}
              helpText="家族の誰か一人でも該当する品目はすべて選んでください。該当しない場合も『アレルゲンなし』を選択します。"
            />
            <Button
              type="button"
              className="w-full rounded-none"
              disabled={familyAllergies === null || allergiesMutation.isPending}
              onClick={() => allergiesMutation.mutate()}
            >
              {allergiesMutation.isPending ? "保存しています…" : "家族のアレルギーを保存"}
            </Button>
          </div>
        )}
      </section>

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

      {/* 2026-10-15 (#123): スタンプと景品条件をマイQR画面からすぐ確認できるようにする。 */}
      <button
        onClick={() => navigate("/visitor/stamps")}
        className="group w-full flex items-center justify-between gap-2 border-thick border-border bg-background hover:bg-muted transition-all p-4 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center border-thick border-border bg-primary text-primary-foreground shrink-0">
            <Ticket className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-black uppercase tracking-tight">スタンプラリーを見る</span>
            <span className="block text-[11px] text-muted-foreground">利用した店舗と景品の条件を確認</span>
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
      </button>

      {/* 注文履歴への導線 (履歴は /orders に分離) */}
      <button
        onClick={() => navigate("/visitor/orders")}
        className="group w-full flex items-center justify-between gap-2 border-thick border-border bg-background hover:bg-muted transition-all p-4 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center border-thick border-border bg-primary text-primary-foreground shrink-0">
            <Receipt className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-black uppercase tracking-tight">注文履歴を見る</span>
            <span className="block text-[11px] text-muted-foreground">事前オーダー・店頭注文の状況を確認</span>
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
      </button>
    </div>
  );
}
