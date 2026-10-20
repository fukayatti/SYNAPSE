import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, QrCode, UserRoundCog } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { useVisitor, saveVisitor } from "@/hooks/useVisitor";
import { eventApi, wristbandApi } from "@/lib/api";

// 2026-10-16: QRの提示とアカウント情報の編集を別画面に分け、来場時に必要な操作を先に見せる。
export default function MyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("eventId");
  const action = searchParams.get("action");
  const { session, userId, isLoaded } = useVisitor();
  const [origin, setOrigin] = useState("");
  const [isIssuing, setIsIssuing] = useState(false);
  // 2026-10-20: QR表示条件はURLで切り替えられないよう、入場中イベントの設定を優先する。
  const settingsEventId = session?.eventId || eventId || null;
  const eventSettingsQuery = useQuery({
    queryKey: ["visitor-event-settings", settingsEventId],
    queryFn: () => eventApi.get(settingsEventId!),
    enabled: !!settingsEventId,
  });

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (action !== "issue" || !eventId || !isLoaded) return;
    if (session?.eventId === eventId && session.userId) {
      navigate("/visitor/mypage", { replace: true });
      return;
    }
    if (eventSettingsQuery.isPending) return;
    // 2026-10-19: 物理バンド運用中にセルフ発行を止めている場合、直リンクでも発行を試さず案内へ戻す。
    if (eventSettingsQuery.data?.hasPhysicalWristband && !eventSettingsQuery.data.allowSelfIssue) {
      navigate(`/visitor/mypage?eventId=${encodeURIComponent(eventId)}`, { replace: true });
      return;
    }

    const issueDigitalBand = async () => {
      setIsIssuing(true);
      try {
        const result = await wristbandApi.issue(eventId);
        saveVisitor({
          userId: result.userId,
          wristbandId: result.wristbandId,
          eventId,
          displayId: result.displayId,
          nickname: null,
          onboarded: false,
        });
        toast.success("デジタルQRを発行しました");
        navigate("/visitor/onboarding", { replace: true });
      } catch (error) {
        console.error("Self issuance failed:", error);
        toast.error("QRコードを発行できませんでした。通信状況を確認して再試行してください。");
      } finally {
        setIsIssuing(false);
      }
    };

    void issueDigitalBand();
  }, [action, eventId, eventSettingsQuery.data, eventSettingsQuery.isPending, isLoaded, navigate, session]);

  const query = useQuery({
    queryKey: ["userWristbandStatus", userId],
    queryFn: () => wristbandApi.lookup(userId!),
    enabled: !!userId && !isIssuing,
  });

  if (!isLoaded || query.isLoading || isIssuing || (!!settingsEventId && eventSettingsQuery.isPending)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 font-mono" aria-label="マイQRを読み込み中">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-2xl p-4 font-mono">
        <ErrorState error={query.error} title="来場者情報を読み込めませんでした" onRetry={() => query.refetch()} />
      </div>
    );
  }

  if (settingsEventId && eventSettingsQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl p-4 font-mono">
        <ErrorState error={eventSettingsQuery.error} title="イベント設定を読み込めませんでした" onRetry={() => eventSettingsQuery.refetch()} />
      </div>
    );
  }

  const status = query.data;
  const activeWristband = status?.familyWristbands.find((band) => band.id === session?.wristbandId) ?? status?.wristband;
  const qrBandId = activeWristband?.id;
  // 2026-10-20: メニュー下見で未登録バンドがあってもQRを出さないよう、サーバーの入場登録完了を必須にする。
  const hasCompletedAdmission = !!status?.user.onboardedAt;
  const checkinUrl = hasCompletedAdmission && qrBandId && origin ? `${origin}/w/${qrBandId}` : null;
  const mustPresentPhysicalWristband = Boolean(
    eventSettingsQuery.data?.hasPhysicalWristband && !eventSettingsQuery.data.allowSelfIssue
  );

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-10 font-mono sm:py-8">
      <header className="space-y-1 border-b-thick border-border pb-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">来場者メニュー</p>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{mustPresentPhysicalWristband ? "来場案内" : "マイQR"}</h1>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {mustPresentPhysicalWristband ? "このイベントではスマートフォンQRを発行していません。" : "注文の受け取りや受付で、このQRを提示してください。"}
        </p>
      </header>

      {mustPresentPhysicalWristband ? (
        <section className="flex items-start gap-3 border-heavy border-border bg-primary/5 p-4 sm:p-5" aria-labelledby="physical-wristband-required-title">
          <QrCode className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <h2 id="physical-wristband-required-title" className="text-sm font-bold">物理リストバンドを提示してください</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">受付や注文の受け取りでは、登録済みの物理リストバンドをスタッフに提示してください。</p>
          </div>
        </section>
      ) : checkinUrl ? (
        <section aria-label="来場用QR" className="border-heavy border-border bg-primary p-4 text-center text-primary-foreground sm:p-6">
          <div className="mx-auto inline-block border-thick border-background bg-background p-3 sm:p-4">
            <QRCodeSVG value={checkinUrl} size={220} level="M" title="来場用QRコード" className="mx-auto block" />
          </div>
          <p className="mt-4 text-xs text-primary-foreground/80">来場者番号</p>
          <p className="mt-1 text-2xl font-black tabular-nums">#{status?.user.displayId ?? session?.displayId ?? "—"}</p>
          {activeWristband?.nickname && <p className="mt-1 text-sm">{activeWristband.nickname}</p>}
        </section>
      ) : (
        <section className="flex items-start gap-3 border-thick border-border bg-muted p-4" aria-labelledby="visitor-qr-title">
          <QrCode className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <h2 id="visitor-qr-title" className="text-sm font-bold">
              {hasCompletedAdmission ? "提示できるリストバンドがありません" : "入場登録が必要です"}
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {hasCompletedAdmission
                ? "受付で登録済みのリストバンドを確認してください。"
                : "入場登録が完了すると、来場用QRを確認できます。"}
            </p>
          </div>
        </section>
      )}

      {status?.user && <section className="border-t-thin border-border pt-4" aria-labelledby="account-summary-title">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="account-summary-title" className="flex items-center gap-2 text-sm font-black">
              <UserRoundCog className="h-4 w-4" aria-hidden="true" />
              アカウント情報
            </h2>
            <p className="mt-1 break-words text-sm font-bold">{status?.user.nickname || "ニックネーム未設定"}</p>
            <p className="mt-1 text-xs text-muted-foreground">登録バンドやアレルギー情報を管理できます。</p>
          </div>
          <Button type="button" variant="outline" className="shrink-0" onClick={() => navigate("/visitor/account")}>
            管理する <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </section>}
    </div>
  );
}
