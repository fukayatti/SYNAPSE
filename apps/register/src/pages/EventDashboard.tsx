import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { eventApi, circleApi } from "@/lib/api";
import { EventAdminGuard, getAuthInfo, saveAuthInfo, useAuth } from "@/hooks/useCircleAuth";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Calendar,
  Users,
  Trash2,
  Building2,
  Edit,
} from "lucide-react";
import { toast } from "sonner";

export default function EventDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { eventId } = useAuth();

  const [showCircleForm, setShowCircleForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingCircleId, setEditingCircleId] = useState<string | null>(null);

  // サークルフォーム
  const [circleForm, setCircleForm] = useState({
    name: "",
    description: "",
    managerPin: "",
    managerEmail: "",
    managerName: "",
  });

  // サークル編集フォーム
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    managerPin: "",
    managerEmail: "",
    managerName: "",
  });

  // イベント情報取得
  const { data: eventData, isLoading: eventLoading } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => eventApi.get(eventId!),
    enabled: !!eventId,
  });

  // サークル一覧取得
  const { data: circles, isLoading: circlesLoading } = useQuery({
    queryKey: ["circles", eventId],
    queryFn: () => circleApi.list(eventId!),
    enabled: !!eventId,
  });

  // サークル作成
  const createCircleMutation = useMutation({
    mutationFn: async (input: {
      eventId: string;
      name: string;
      managerPin?: string;
      description?: string;
      managerEmail: string;
      managerName?: string;
    }) => {
      return await circleApi.create(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circles", eventId] });
      toast.success("サークルを作成しました");
      setShowCircleForm(false);
      setCircleForm({
        name: "",
        description: "",
        managerPin: "",
        managerEmail: "",
        managerName: "",
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "サークル作成に失敗しました");
    },
  });

  // サークル更新
  const updateCircleMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      description?: string;
      managerPin?: string;
      managerEmail?: string;
      managerName?: string;
    }) => {
      const { id, ...data } = input;
      return await circleApi.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circles", eventId] });
      toast.success("サークル情報を更新しました");
      setShowEditForm(false);
      setEditingCircleId(null);
      setEditForm({
        name: "",
        description: "",
        managerPin: "",
        managerEmail: "",
        managerName: "",
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "サークル更新に失敗しました");
    },
  });

  // サークル削除
  const deleteCircleMutation = useMutation({
    mutationFn: async (input: { id: string }) => {
      return await circleApi.delete(input.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circles", eventId] });
      toast.success("サークルを削除しました");
    },
    onError: (error: Error) => {
      toast.error(error.message || "サークル削除に失敗しました");
    },
  });

  const handleCreateCircle = () => {
    if (!eventId) return;
    createCircleMutation.mutate({
      eventId,
      name: circleForm.name,
      managerPin: circleForm.managerPin || undefined,
      description: circleForm.description || undefined,
      managerEmail: circleForm.managerEmail,
      managerName: circleForm.managerName || undefined,
    });
  };

  const handleEditCircle = () => {
    if (!editingCircleId) return;
    updateCircleMutation.mutate({
      id: editingCircleId,
      name: editForm.name,
      description: editForm.description || undefined,
      managerPin: editForm.managerPin || undefined,
      managerEmail: editForm.managerEmail,
      managerName: editForm.managerName || undefined,
    });
  };

  const handleManageCircle = (cir: any) => {
    const authInfo = getAuthInfo();
    if (authInfo) {
      saveAuthInfo({
        ...authInfo,
        circleId: cir.id,
        circleName: cir.name,
        role: "circle_manager", // サークル管理コンテキストに切り替え
      });
      toast.success(`「${cir.name}」のダッシュボードに切り替えました`);
      navigate("/circle/dashboard");
    }
  };

  if (!eventId) {
    return (
      <EventAdminGuard>
        <div className="container mx-auto p-6 text-center">
          <p className="text-muted-foreground font-mono">アクティブなイベントが選択されていません。システム管理で選択してください。</p>
        </div>
      </EventAdminGuard>
    );
  }

  return (
    <EventAdminGuard>
      <div className="container mx-auto p-6 space-y-8 font-mono">
        <div className="flex items-center justify-between border-b-[3px] border-border pb-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-headline uppercase font-black tracking-tight flex items-center gap-3">
              <Calendar className="h-8 w-8 sm:h-10 sm:w-10" />
              {eventLoading ? "イベント読み込み中..." : eventData?.eventName || "イベント管理"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">イベント内サークルの作成・管理・各種設定</p>
          </div>
        </div>

        {/* サークル管理セクション */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              サークル一覧
            </h2>
            <Button onClick={() => { setShowCircleForm(!showCircleForm); setShowEditForm(false); }}>
              <Plus className="mr-2 h-4 w-4" />
              新規サークル追加
            </Button>
          </div>

          {/* 新規サークル作成フォーム */}
          {showCircleForm && (
            <Card className="border-thick border-border rounded-none bg-muted/20">
              <CardHeader className="border-b border-border/20">
                <CardTitle className="text-base uppercase">[新規サークル登録]</CardTitle>
                <CardDescription>イベントにサークルを追加し、代表者アカウントを登録します。</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="circleName">サークル名 *</Label>
                    <Input
                      id="circleName"
                      placeholder="例: たこ焼き 茨香庵"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={circleForm.name}
                      onChange={(e) => setCircleForm({ ...circleForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="circlePin">代表者一時PINコード (4〜6桁)</Label>
                    <Input
                      id="circlePin"
                      type="password"
                      placeholder="例: 1234"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={circleForm.managerPin}
                      onChange={(e) => setCircleForm({ ...circleForm, managerPin: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="managerEmail">代表者メールアドレス *</Label>
                    <Input
                      id="managerEmail"
                      type="email"
                      placeholder="leader@example.com"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={circleForm.managerEmail}
                      onChange={(e) => setCircleForm({ ...circleForm, managerEmail: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="managerName">代表者名</Label>
                    <Input
                      id="managerName"
                      placeholder="代表者の名前 (省略時はサークル代表)"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={circleForm.managerName}
                      onChange={(e) => setCircleForm({ ...circleForm, managerName: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="circleDescription">説明</Label>
                    <Input
                      id="circleDescription"
                      placeholder="出店ジャンルや販売メニュー等の説明"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={circleForm.description}
                      onChange={(e) => setCircleForm({ ...circleForm, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" className="border-thick border-border rounded-none" onClick={() => setShowCircleForm(false)}>
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleCreateCircle}
                    disabled={!circleForm.name || !circleForm.managerEmail || createCircleMutation.isPending}
                    className="border-thick border-border rounded-none bg-primary text-primary-foreground hover:bg-background hover:text-foreground transition-all"
                  >
                    {createCircleMutation.isPending ? "追加中..." : "サークルを追加"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* サークル編集フォーム */}
          {showEditForm && editingCircleId && (
            <Card className="border-thick border-border rounded-none bg-muted/20">
              <CardHeader className="border-b border-border/20">
                <CardTitle className="text-base uppercase">[サークル情報の編集]</CardTitle>
                <CardDescription>サークルの詳細や代表者メールを更新します。一時PINを変更しない場合は空欄にしてください。</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="editCircleName">サークル名 *</Label>
                    <Input
                      id="editCircleName"
                      placeholder="例: たこ焼き 茨香庵"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editCirclePin">代表者一時PINコード (変更時のみ入力)</Label>
                    <Input
                      id="editCirclePin"
                      type="password"
                      placeholder="新しい一時PIN"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={editForm.managerPin}
                      onChange={(e) => setEditForm({ ...editForm, managerPin: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editManagerEmail">代表者メールアドレス *</Label>
                    <Input
                      id="editManagerEmail"
                      type="email"
                      placeholder="leader@example.com"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={editForm.managerEmail}
                      onChange={(e) => setEditForm({ ...editForm, managerEmail: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editManagerName">代表者名</Label>
                    <Input
                      id="editManagerName"
                      placeholder="代表者の名前"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={editForm.managerName}
                      onChange={(e) => setEditForm({ ...editForm, managerName: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="editCircleDescription">説明</Label>
                    <Input
                      id="editCircleDescription"
                      placeholder="サークルの説明"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" className="border-thick border-border rounded-none" onClick={() => { setShowEditForm(false); setEditingCircleId(null); }}>
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleEditCircle}
                    disabled={!editForm.name || !editForm.managerEmail || updateCircleMutation.isPending}
                    className="border-thick border-border rounded-none bg-primary text-primary-foreground hover:bg-background hover:text-foreground transition-all"
                  >
                    {updateCircleMutation.isPending ? "保存中..." : "変更を保存"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* サークル一覧表示 */}
          {circlesLoading ? (
            <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
          ) : circles && circles.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {circles.map((cir) => (
                <Card key={cir.id} className="border-thick border-border rounded-none bg-background flex flex-col justify-between">
                  <CardHeader className="border-b border-border/20 p-4">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="truncate">{cir.name}</span>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => {
                            setEditingCircleId(cir.id);
                            setEditForm({
                              name: cir.name,
                              description: cir.description || "",
                              managerPin: "",
                              managerEmail: cir.managerEmail || "",
                              managerName: cir.managerName || "",
                            });
                            setShowEditForm(true);
                            setShowCircleForm(false);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`サークル「${cir.name}」を削除してよろしいですか？`)) {
                              deleteCircleMutation.mutate({ id: cir.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardTitle>
                    {cir.description && (
                      <CardDescription className="text-xs truncate">{cir.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>代表者: {cir.managerName || "未設定"}</p>
                      <p className="truncate">メール: {cir.managerEmail}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-thick border-border rounded-none uppercase font-black tracking-wider text-xs"
                      onClick={() => handleManageCircle(cir)}
                    >
                      このサークルを管理
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-thick border-dashed border-border rounded-none p-8 text-center text-muted-foreground bg-muted/10">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>このイベントにはまだサークルがありません。</p>
            </Card>
          )}
        </div>
      </div>
    </EventAdminGuard>
  );
}
