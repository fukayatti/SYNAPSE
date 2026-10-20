import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { eventApi, circleApi, orderApi, membershipApi } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, FileSpreadsheet, Users, Store, Receipt, HelpCircle } from "lucide-react";

// CSVセルのエスケープ
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSVファイルの作成とダウンロード
function downloadCsvFile(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 2026-10-08: Chromium may read the Blob URL after click() returns, so keep it alive briefly.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportTab({ eventId }: { eventId: string }) {
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const startDownload = (key: string) => {
    setDownloading((prev) => ({ ...prev, [key]: true }));
  };

  const endDownload = (key: string) => {
    setDownloading((prev) => ({ ...prev, [key]: false }));
  };

  // 1. 統計サマリのエクスポート
  const exportAnalytics = async () => {
    const key = "analytics";
    startDownload(key);
    try {
      const data = await eventApi.analytics(eventId);
      const t = data.totals;

      const headers = ["指標名", "数値", "補足情報"];
      // 2026-10-19: 統計APIと同じく、来場は入場済み家族アカウント、プロフィールは家族人数で書き出す。
      const rows = [
        ["入場処理済みアカウント数（家族単位）", t.visitors, `事前登録: ${t.preRegisteredAccounts}件 · 入場処理率: ${t.entryRate}%`],
        ["来場プロフィール数", t.visitorProfiles, "入場処理済みアカウント内のプロフィール数"],
        ["総売上", `¥${t.revenue.toLocaleString()}`, ""],
        ["総注文数", t.orders, `完了率: ${t.completedRate}%`],
        ["総客数", t.customers, `平均客単価: ¥${t.avgSpend.toLocaleString()}`],
        ["サークル数", t.circles, ""],
        ["平均評価", t.avgRating != null ? `★${t.avgRating}` : "未評価", `レビュー数: ${t.reviews}件`],
        ["回遊のべ訪問", t.circleVisits, `${t.visitingUsers}人が訪問`],
      ];

      downloadCsvFile("イベント統計サマリ", headers, rows);
      toast.success("統計サマリをエクスポートしました");
    } catch (e: any) {
      toast.error(e.message || "統計データの取得に失敗しました");
    } finally {
      endDownload(key);
    }
  };

  // 2. サークル一覧のエクスポート
  const exportCircles = async () => {
    const key = "circles";
    startDownload(key);
    try {
      const circles = await circleApi.list(eventId);
      const headers = ["サークルID", "サークル名", "説明"];
      const rows = circles.map((c) => [
        c.id,
        c.name,
        c.description || "",
      ]);

      downloadCsvFile("サークル一覧", headers, rows);
      toast.success("サークル一覧をエクスポートしました");
    } catch (e: any) {
      toast.error(e.message || "サークル一覧の取得に失敗しました");
    } finally {
      endDownload(key);
    }
  };

  // 3. 全注文履歴のエクスポート
  const exportOrders = async () => {
    const key = "orders";
    startDownload(key);
    try {
      const circles = await circleApi.list(eventId);
      if (circles.length === 0) {
        toast.warning("サークルが登録されていません");
        return;
      }

      // 全サークルの注文を並行してロード
      const allOrdersResult = await Promise.all(
        circles.map(async (cir) => {
          try {
            const list = await orderApi.list(cir.id);
            return list.map((o) => ({ ...o, circleName: cir.name }));
          } catch {
            return [];
          }
        })
      );

      const flatOrders = allOrdersResult.flat().sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA; // 新しい順
      });

      const headers = [
        "サークル名",
        "注文ID",
        "注文番号",
        "合計金額",
        "支払い方法",
        "ステータス",
        "人数",
        "メニュー内容",
        "トッピング内容",
        "注文日時",
        "調理完了日時",
      ];

      // 2026-10-20: 注文履歴CSVは注文単位の行を保ち、明細はセル内にまとめて追跡しやすくする。
      const rows = flatOrders.map((o) => {
        const menuDetails = o.items
          .map((item) => `${item.menuName} × ${item.quantity}`)
          .join(" / ");
        const toppingDetails = o.items
          .flatMap((item) =>
            (item.toppings ?? []).map(
              (topping) => `${item.menuName}: ${topping.toppingName} × ${item.quantity}`
            )
          )
          .join(" / ");

        return [
          o.circleName,
          o.id,
          o.orderNumber,
          o.totalPrice,
          o.paymentMethod || "未設定",
          o.status,
          o.peopleCount,
          menuDetails,
          toppingDetails,
          o.createdAt ? new Date(o.createdAt).toLocaleString("ja-JP") : "",
          o.completedAt ? new Date(o.completedAt).toLocaleString("ja-JP") : "",
        ];
      });

      downloadCsvFile("全注文履歴一覧", headers, rows);
      toast.success("全注文履歴一覧をエクスポートしました");
    } catch (e: any) {
      toast.error(e.message || "注文履歴の取得に失敗しました");
    } finally {
      endDownload(key);
    }
  };

  // 4. 来場者一覧のエクスポート
  const exportVisitors = async () => {
    const key = "visitors";
    startDownload(key);
    try {
      const visitors = await eventApi.visitors(eventId);
      const headers = ["ユーザーID", "呼出ID", "状態", "ニックネーム", "お好きな日付", "オンボード日時", "登録日時"];
      const rows = visitors.map((v) => [
        v.id,
        v.displayId,
        v.status,
        v.nickname || "",
        v.favoriteDate || "",
        v.onboardedAt ? new Date(v.onboardedAt).toLocaleString("ja-JP") : "未入力",
        v.createdAt ? new Date(v.createdAt).toLocaleString("ja-JP") : "",
      ]);

      downloadCsvFile("来場者一覧", headers, rows);
      toast.success("来場者一覧をエクスポートしました");
    } catch (e: any) {
      toast.error(e.message || "来場者一覧の取得に失敗しました");
    } finally {
      endDownload(key);
    }
  };

  // 5. スタッフ一覧のエクスポート
  const exportStaff = async () => {
    const key = "staff";
    startDownload(key);
    try {
      const staff = await membershipApi.listByEvent(eventId);
      const headers = ["メンバーシップID", "氏名", "メールアドレス", "ロール", "状態"];
      const rows = staff.map((s) => [
        s.id,
        s.userName || "未設定",
        s.userEmail,
        s.role,
        s.isActive ? "有効" : "無効",
      ]);

      downloadCsvFile("イベントスタッフ一覧", headers, rows);
      toast.success("スタッフ一覧をエクスポートしました");
    } catch (e: any) {
      toast.error(e.message || "スタッフ一覧の取得に失敗しました");
    } finally {
      endDownload(key);
    }
  };

  const items = [
    {
      key: "analytics",
      title: "統計・売上サマリ",
      description: "イベント全体の来場者数、総売上、完了率、客単価等の指標を集計した概要データです。",
      icon: FileSpreadsheet,
      action: exportAnalytics,
    },
    {
      key: "circles",
      title: "サークル一覧",
      description: "イベントに登録されているサークル（模擬店）の基本情報（ID、名称、説明、登録日）です。",
      icon: Store,
      action: exportCircles,
    },
    {
      key: "orders",
      title: "全注文履歴一覧",
      description: "全サークルを横断した注文履歴の詳細データ（サークル名、金額、支払方法、日時、ステータス）です。",
      icon: Receipt,
      action: exportOrders,
    },
    {
      key: "visitors",
      title: "来場者一覧",
      description: "リストバンドを登録したすべての来場者の情報（呼出ID、ニックネーム、お好きな日付、オンボード時刻）です。",
      icon: Users,
      action: exportVisitors,
    },
    {
      key: "staff",
      title: "イベントスタッフ一覧",
      description: "イベントの運営権限を持つスタッフ・メンバーシップの一覧（メールアドレス、権限ロール）です。",
      icon: HelpCircle,
      action: exportStaff,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3 border-b-thick border-border pb-6">
        <h2 className="text-xl font-headline flex items-center gap-3 uppercase tracking-wider">
          <Download className="h-5 w-5 shrink-0" /> データエクスポート
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground font-mono">
          イベントに関する各種データを Excel やスプレッドシートで読み込み可能な CSV 形式でダウンロードできます。
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          const isDownloading = downloading[item.key] || false;
          return (
            <Card key={item.key} className="min-w-0 flex flex-col justify-between gap-6 p-6">
              <CardHeader className="min-w-0 p-0">
                {/* 2026-10-16: 長いラベルと説明文をカード幅内で折り返し、横はみ出しを防ぐ。 */}
                <div className="flex min-w-0 items-start gap-3">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <CardTitle className="min-w-0 whitespace-normal break-words text-sm uppercase font-bold tracking-wider">{item.title}</CardTitle>
                </div>
                <CardDescription className="break-words pt-2 text-xs leading-relaxed">
                  {item.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="min-w-0 p-0">
                <Button
                  onClick={item.action}
                  disabled={isDownloading}
                  className="h-auto min-h-11 w-full min-w-0 whitespace-normal break-words px-3 py-2 text-center text-xs leading-snug font-bold"
                  variant="outline"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                      エクスポート中...
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      CSV エクスポート
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
