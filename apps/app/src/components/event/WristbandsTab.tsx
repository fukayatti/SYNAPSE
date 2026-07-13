import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { wristbandApi } from "@/lib/api";
import { extractIdFromCode } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Search, RefreshCw, Users, Camera, QrCode } from "lucide-react";
import { toast } from "sonner";
import { QrScannerModal } from "@/components/pos/qr-scanner-modal";
import { Modal } from "@/components/ui/Modal";

interface WristbandsTabProps {
  eventId: string;
}

export function WristbandsTab({
  eventId
}: WristbandsTabProps) {
  const [lostSearchCode, setLostSearchCode] = useState("");
  const [newWristbandId, setNewWristbandId] = useState("");
  const [profileSearchQuery, setProfileSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [lookupResult, setLookupResult] = useState<any | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<"search" | "reissue">("search");

  // Modal & profile form states (2026-07-13)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editBirthday, setEditBirthday] = useState("");
  const [editDisplayId, setEditDisplayId] = useState<number | "">("");
  const [editUserStatus, setEditUserStatus] = useState("available");

  // Sync profile edit state when lookupResult changes
  useEffect(() => {
    if (lookupResult?.user) {
      setEditNickname(lookupResult.user.nickname || "");
      setEditBirthday(lookupResult.user.birthday || "");
      setEditDisplayId(lookupResult.user.displayId || "");
      setEditUserStatus(lookupResult.user.status || "available");
    } else {
      setEditNickname("");
      setEditBirthday("");
      setEditDisplayId("");
      setEditUserStatus("available");
    }
  }, [lookupResult]);

  // リストバンド照会 API
  const lookupWristbandMutation = useMutation({
    mutationFn: (code: string) => {
      const parsedCode = extractIdFromCode(code);
      return wristbandApi.lookup(parsedCode);
    },
    onSuccess: (data) => {
      setLookupResult(data);
      if (!data.wristband) {
        toast.info("指定のコードに紐づく有効なリストバンドはありません");
      } else {
        toast.success("ユーザー情報を取得しました");
      }
      setIsDetailsModalOpen(true);
    },
    onError: () => {
      toast.error("照会に失敗しました。正しいコードを入力してください。");
    },
  });

  // 来場者プロフィール検索 API
  const searchProfileMutation = useMutation({
    mutationFn: (query: string) => wristbandApi.search(eventId, query),
    onSuccess: (data) => {
      setSearchResults(data);
      if (data.length === 0) {
        toast.info("該当する来場者が見つかりませんでした");
      } else {
        toast.success(`${data.length} 件の来場者が見つかりました`);
      }
    },
    onError: () => {
      toast.error("検索に失敗しました");
    },
  });

  // 紛失ロック API
  const reportLostMutation = useMutation({
    mutationFn: (wristbandId: string) => wristbandApi.reportLost(wristbandId),
    onSuccess: () => {
      toast.success("紛失ロック（無効化）が完了しました");
      if (lostSearchCode) {
        lookupWristbandMutation.mutate(lostSearchCode);
      } else if (lookupResult?.user?.id) {
        lookupWristbandMutation.mutate(lookupResult.user.id);
      }
      // 検索結果も更新する
      if (profileSearchQuery) {
        searchProfileMutation.mutate(profileSearchQuery);
      }
    },
  });

  // リストバンド更新 (2026-07-12)
  const updateWbMutation = useMutation({
    mutationFn: (input: { id: string; status: any; userId?: string }) =>
      wristbandApi.update(input.id, { status: input.status, userId: input.userId }),
    onSuccess: () => {
      toast.success("リストバンド情報を更新しました");
      if (lostSearchCode) {
        lookupWristbandMutation.mutate(lostSearchCode);
      } else if (lookupResult?.user?.id) {
        lookupWristbandMutation.mutate(lookupResult.user.id);
      }
      if (profileSearchQuery) {
        searchProfileMutation.mutate(profileSearchQuery);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "更新に失敗しました");
    },
  });

  // 来場者プロフィール更新 API (2026-07-13)
  const updateProfileMutation = useMutation({
    mutationFn: (input: { userId: string; nickname: string | null; birthday: string | null; displayId: number; status: string }) =>
      wristbandApi.updateUser(input.userId, {
        nickname: input.nickname,
        birthday: input.birthday,
        displayId: input.displayId,
        status: input.status,
      }),
    onSuccess: (_, variables) => {
      toast.success("ユーザー情報を更新しました");
      // 更新後の情報で詳細を再読み込みする
      lookupWristbandMutation.mutate(variables.userId);
      if (profileSearchQuery) {
        searchProfileMutation.mutate(profileSearchQuery);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "プロフィール更新に失敗しました");
    },
  });

  // 新規リストバンド再紐付け
  const registerWristbandMutation = useMutation({
    mutationFn: (input: { userId: string; wristbandId: string }) =>
      wristbandApi.register(input.userId, input.wristbandId),
    onSuccess: () => {
      toast.success("新しいリストバンドをアカウントに紐付けました");
      setNewWristbandId("");
      if (lostSearchCode) {
        lookupWristbandMutation.mutate(lostSearchCode);
      } else if (lookupResult?.user?.id) {
        lookupWristbandMutation.mutate(lookupResult.user.id);
      }
      // 検索結果も更新する
      if (profileSearchQuery) {
        searchProfileMutation.mutate(profileSearchQuery);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "紐付けに失敗しました");
    },
  });

  const handleSearchLost = () => {
    if (!lostSearchCode.trim()) return;
    lookupWristbandMutation.mutate(lostSearchCode.trim());
  };

  const handleSearchProfile = () => {
    if (!profileSearchQuery.trim()) return;
    searchProfileMutation.mutate(profileSearchQuery.trim());
  };

  const handleSelectUser = (result: any) => {
    setLookupResult(result);
    setLostSearchCode(result.user.id);
    setIsDetailsModalOpen(true);
  };

  const handleReportLost = (wbId: string) => {
    reportLostMutation.mutate(wbId);
  };

  const handleReissueWb = (userId: string) => {
    if (!newWristbandId.trim()) return;
    const parsedWbId = extractIdFromCode(newWristbandId);
    registerWristbandMutation.mutate({ userId, wristbandId: parsedWbId });
  };

  const handleScannerScan = (userId: string, wristbandId: string | null) => {
    const code = wristbandId || userId;
    if (scannerTarget === "search") {
      setLostSearchCode(code);
      lookupWristbandMutation.mutate(code);
    } else {
      setNewWristbandId(code);
    }
  };

  const handleUpdateWbStatus = (wbId: string, status: any) => {
    updateWbMutation.mutate({ id: wbId, status });
  };

  const handleUnlinkWb = (wbId: string) => {
    if (!window.confirm("このリストバンドの紐付けを解除しますか？")) return;
    updateWbMutation.mutate({ id: wbId, status: "revoked", userId: "" });
  };

  return (
    <div className="space-y-6 font-mono text-foreground">
      <div className="flex justify-between items-center border-b-thick border-border pb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Lock className="h-4 w-4" />
          リストバンド紛失のロック・再発行処理
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 照会カード */}
        <Card className="rounded-none bg-background shadow-none">
          <CardHeader className="p-4 pb-2 border-b-thin border-border bg-muted/20">
            <CardTitle className="text-xs uppercase font-bold">[登録情報スキャン・照会]</CardTitle>
            <CardDescription className="text-[10px]">紛失したリストバンドID、または来場者ユーザーIDを完全一致で照会します。</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-4">
            <div className="flex gap-2">
              <Input
                placeholder="例: wb_test_001 または usr_xxxx"
                value={lostSearchCode}
                onChange={(e) => setLostSearchCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearchLost();
                  }
                }}
                className="border-thick border-border rounded-none focus-visible:ring-0 h-10 text-xs bg-background font-mono flex-1"
              />
              <Button
                onClick={() => {
                  setScannerTarget("search");
                  setIsScannerOpen(true);
                }}
                variant="outline"
                className="border-thick border-border h-10 px-3 rounded-none"
              >
                <Camera className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleSearchLost}
                disabled={!lostSearchCode.trim() || lookupWristbandMutation.isPending}
                className="border-thick border-primary bg-primary text-primary-foreground hover:bg-background hover:text-foreground h-10 text-xs font-bold rounded-none shadow-none px-4"
              >
                <Search className="h-4 w-4 mr-1" />
                照会
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* プロフィール検索カード */}
        <Card className="rounded-none bg-background shadow-none">
          <CardHeader className="p-4 pb-2 border-b-thin border-border bg-muted/20">
            <CardTitle className="text-xs uppercase font-bold">[来場者プロフィール検索]</CardTitle>
            <CardDescription className="text-[10px]">ニックネーム、呼出ID（#番号）、または誕生日から来場者を検索します。</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-4">
            <div className="flex gap-2">
              <Input
                placeholder="例: たろう / 123 / YYYY-MM-DD"
                value={profileSearchQuery}
                onChange={(e) => setProfileSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearchProfile();
                  }
                }}
                className="border-thick border-border rounded-none focus-visible:ring-0 h-10 text-xs bg-background font-mono flex-1"
              />
              <Button
                onClick={handleSearchProfile}
                disabled={!profileSearchQuery.trim() || searchProfileMutation.isPending}
                className="border-thick border-primary bg-primary text-primary-foreground hover:bg-background hover:text-foreground h-10 text-xs font-bold rounded-none shadow-none px-4"
              >
                <Users className="h-4 w-4 mr-1" />
                検索
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 検索結果一覧 */}
      {searchResults.length > 0 && (
        <Card className="rounded-none bg-background shadow-none border-thick border-border">
          <CardHeader className="p-4 pb-2 border-b-thin border-border bg-muted/20">
            <CardTitle className="text-xs uppercase font-bold">[検索結果一覧]</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b-thin border-border bg-muted/10 font-bold">
                    <th className="p-2">呼出ID</th>
                    <th className="p-2">ニックネーム</th>
                    <th className="p-2">誕生日</th>
                    <th className="p-2">紐付くバンド</th>
                    <th className="p-2">状態</th>
                    <th className="p-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((res) => (
                    <tr key={res.user.id} className="border-b-thin border-border hover:bg-muted/5">
                      <td className="p-2">#{res.user.displayId}</td>
                      <td className="p-2">{res.user.nickname || "-"}</td>
                      <td className="p-2">{res.user.birthday || "-"}</td>
                      <td className="p-2">{res.wristband?.id || "なし"}</td>
                      <td className="p-2">
                        {res.wristband ? (
                          <Badge variant="default" className={`rounded-none text-[8px] font-mono border-thick border-border uppercase ${
                            res.wristband.status === "active"
                              ? "bg-success/10 text-success border-success"
                              : res.wristband.status === "smartphone"
                              ? "bg-info/10 text-info border-info"
                              : "bg-error/10 text-error border-error"
                          }`}>
                            {res.wristband.status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">未紐付け</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSelectUser(res)}
                          className="h-7 text-[10px] rounded-none border-thick border-border bg-background hover:bg-primary hover:text-primary-foreground"
                        >
                          選択する
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 来場者詳細・編集ポップアップモーダル */}
      <Modal
        isOpen={isDetailsModalOpen}
        title="[来場者・リストバンド詳細編集]"
        subtitle="来場者のプロフィール情報とリストバンドのステータス変更・再発行を行います。"
        onClose={() => {
          setIsDetailsModalOpen(false);
          setLookupResult(null);
        }}
        maxWidth="xl"
      >
        {lookupResult && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* 左カラム: 来場者アカウント情報 */}
              <div className="space-y-4 border-b md:border-b-0 md:border-r border-border pb-6 md:pb-0 md:pr-6">
                <h3 className="font-black text-xs uppercase tracking-wider text-primary border-b border-border pb-1">
                  [アカウント情報変更]
                </h3>
                
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">ユーザーID (固定)</label>
                    <Input
                      value={lookupResult.user.id}
                      disabled
                      className="bg-muted border-thick border-border rounded-none h-8 text-xs font-mono select-all"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">表示用呼出ID (#)</label>
                    <Input
                      type="number"
                      value={editDisplayId}
                      onChange={(e) => setEditDisplayId(e.target.value === "" ? "" : Number(e.target.value))}
                      className="border-thick border-border rounded-none h-8 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">ニックネーム</label>
                    <Input
                      value={editNickname}
                      onChange={(e) => setEditNickname(e.target.value)}
                      placeholder="未登録"
                      className="border-thick border-border rounded-none h-8 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">誕生日 (YYYY-MM-DD)</label>
                    <Input
                      value={editBirthday}
                      onChange={(e) => setEditBirthday(e.target.value)}
                      placeholder="例: 2000-01-01"
                      className="border-thick border-border rounded-none h-8 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">アカウント状態</label>
                    <select
                      value={editUserStatus}
                      onChange={(e) => setEditUserStatus(e.target.value)}
                      className="w-full border-thick border-border bg-background p-1.5 text-xs font-bold font-mono rounded-none"
                    >
                      <option value="available">利用可能 (Available)</option>
                      <option value="banned">BAN中 (Banned)</option>
                    </select>
                  </div>
                </div>

                <Button
                  onClick={() => {
                    if (editDisplayId === "") {
                      toast.error("呼出IDを入力してください");
                      return;
                    }
                    updateProfileMutation.mutate({
                      userId: lookupResult.user.id,
                      nickname: editNickname.trim() || null,
                      birthday: editBirthday.trim() || null,
                      displayId: Number(editDisplayId),
                      status: editUserStatus,
                    });
                  }}
                  disabled={updateProfileMutation.isPending}
                  className="w-full border-thick border-primary bg-primary text-primary-foreground hover:bg-background hover:text-foreground h-9 text-xs font-bold rounded-none shadow-none mt-4"
                >
                  プロフィール保存
                </Button>
              </div>

              {/* 右カラム: リストバンド情報＆操作 */}
              <div className="space-y-4">
                <h3 className="font-black text-xs uppercase tracking-wider text-primary border-b border-border pb-1">
                  [紐付くリストバンド情報]
                </h3>

                {lookupResult.wristband ? (
                  <div className="space-y-4 text-xs">
                    <div className="bg-muted/20 p-3 border border-border space-y-2 font-mono">
                      <p>バンドID: <span className="font-bold select-all">{lookupResult.wristband.id}</span></p>
                      <p className="flex items-center gap-2">
                        ステータス:
                        <Badge variant="default" className={`rounded-none text-[8px] font-mono border-thick border-border uppercase ${
                          lookupResult.wristband.status === "active"
                            ? "bg-success/10 text-success border-success"
                            : lookupResult.wristband.status === "smartphone"
                            ? "bg-info/10 text-info border-info"
                            : "bg-error/10 text-error border-error"
                        }`}>
                          {lookupResult.wristband.status}
                        </Badge>
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        登録日時: {new Date(lookupResult.wristband.assignedAt).toLocaleString("ja-JP")}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[10px] uppercase text-muted-foreground">状態変更:</span>
                        <select
                          value={lookupResult.wristband.status}
                          onChange={(e) => handleUpdateWbStatus(lookupResult.wristband.id, e.target.value)}
                          disabled={updateWbMutation.isPending}
                          className="border-thick border-border bg-background p-1.5 text-xs font-bold font-mono rounded-none"
                        >
                          <option value="active">有効 (Active)</option>
                          <option value="smartphone">スマホ用 (Smartphone)</option>
                          <option value="lost">紛失 (Lost)</option>
                          <option value="replaced">再発行済 (Replaced)</option>
                          <option value="revoked">無効化 (Revoked)</option>
                        </select>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnlinkWb(lookupResult.wristband.id)}
                        disabled={updateWbMutation.isPending}
                        className="w-full rounded-none text-[10px] font-bold h-8 uppercase shadow-none border-thick border-border hover:bg-destructive hover:text-white"
                      >
                        紐付け解除 (Unlink)
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-muted/10 p-4 text-center border border-dashed border-border text-muted-foreground text-xs">
                    現在、有効なリストバンドは紐付いていません
                  </div>
                )}

                {/* 新しいリストバンドの登録・再発行 */}
                <div className="border-t border-border pt-4 mt-2 space-y-2">
                  <h4 className="font-bold uppercase text-[10px] text-muted-foreground">
                    [物理リストバンドの新規紐付け・再発行]
                  </h4>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    新しい物理リストバンドのQR/コード値を入力して登録します（古いリストバンドは自動的に無効化されます）。
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="新しいリストバンドIDを入力"
                      value={newWristbandId}
                      onChange={(e) => setNewWristbandId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleReissueWb(lookupResult.user.id);
                        }
                      }}
                      className="border-thick border-border rounded-none focus-visible:ring-0 h-9 text-xs bg-background font-mono flex-1"
                    />
                    <Button
                      onClick={() => {
                        setScannerTarget("reissue");
                        setIsScannerOpen(true);
                      }}
                      variant="outline"
                      className="border-thick border-border h-9 px-3 rounded-none"
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => handleReissueWb(lookupResult.user.id)}
                      disabled={!newWristbandId.trim() || registerWristbandMutation.isPending}
                      className="border-thick border-border bg-background text-foreground hover:bg-primary hover:text-primary-foreground h-9 text-xs font-bold rounded-none shadow-none px-3"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin-hover" />
                      登録
                    </Button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </Modal>

      {/* マイデジタルQRセルフ発行用QRの出力エリア */}
      <Card className="rounded-none bg-background shadow-none border-thick border-border">
        <CardHeader className="p-4 pb-2 border-b-thin border-border bg-muted/20">
          <CardTitle className="text-xs uppercase font-bold flex items-center gap-1.5">
            <QrCode className="h-4 w-4" />
            [来場者向け・マイデジタルQR発行QRコード]
          </CardTitle>
          <CardDescription className="text-[10px]">来場者が自身のスマートフォンでスキャンし、マイデジタルQRをセルフ発行するための受付用QRです。</CardDescription>
        </CardHeader>
        <CardContent className="p-6 flex flex-col md:flex-row items-center gap-6">
          <div className="border-thick border-border p-3 bg-white">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                `${window.location.origin}/visitor/mypage?eventId=${eventId}&action=issue`
              )}`}
              alt="My Digital QR Issuance QR"
              width={180}
              height={180}
              className="block"
            />
          </div>
          <div className="space-y-2 text-xs font-mono">
            <p className="font-bold underline text-primary">セルフ登録URL:</p>
            <p className="bg-muted p-2 select-all break-all border border-border">
              {`${window.location.origin}/visitor/mypage?eventId=${eventId}&action=issue`}
            </p>
            <div className="text-[10px] text-muted-foreground leading-normal space-y-1 pt-2">
              <p>1. 受付にこのQRコードを掲示するか、URLを来場者に共有してください。</p>
              <p>2. 来場者がスキャンすると、自動的に「スマホデジタルID（リストバンド代替）」が新規発行され、マイページで支払いやスタンプラリーが使えるようになります。</p>
              <p>※ 物理リストバンドを使わない「スマホ単体イベント」では、このQRだけで受付を完全セルフ化できます。</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* カメラQRスキャナーモーダル */}
      <QrScannerModal
        circleId="dummy"
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        mode="customer"
        onCustomerScanned={handleScannerScan}
      />
    </div>
  );
}
