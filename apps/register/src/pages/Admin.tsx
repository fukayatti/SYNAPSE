import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { eventApi } from "@/lib/api";
import { SystemAdminGuard, getAuthInfo, saveAuthInfo } from "@/hooks/useCircleAuth";
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
  Shield,
} from "lucide-react";
import { toast } from "sonner";

export default function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showEventForm, setShowEventForm] = useState(false);

  // イベントフォーム
  const [eventForm, setEventForm] = useState({
    eventName: "",
    description: "",
    startDate: "",
    endDate: "",
  });

  // イベント一覧取得
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => eventApi.list(),
  });

  // イベント作成
  const createEventMutation = useMutation({
    mutationFn: async (input: {
      eventName: string;
      description?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      return await eventApi.create(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("イベントを作成しました");
      setShowEventForm(false);
      setEventForm({
        eventName: "",
        description: "",
        startDate: "",
        endDate: "",
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "イベント作成に失敗しました");
    },
  });

  const handleCreateEvent = () => {
    createEventMutation.mutate({
      eventName: eventForm.eventName,
      description: eventForm.description || undefined,
      startDate: eventForm.startDate || undefined,
      endDate: eventForm.endDate || undefined,
    });
  };

  const handleManageEvent = (evt: any) => {
    const authInfo = getAuthInfo();
    if (authInfo) {
      saveAuthInfo({
        ...authInfo,
        circleId: null, // イベント管理時はサークルIDをクリア
        circleName: null,
        eventId: evt.id,
        role: "event_manager", // イベント管理コンテキストへ切り替え
      });
      toast.success(`イベント「${evt.eventName}」の管理画面へ移動します`);
      navigate("/event/dashboard");
    }
  };

  return (
    <SystemAdminGuard>
      <div className="container mx-auto p-6 space-y-8 font-mono">
        <div className="flex items-center justify-between border-b-[3px] border-border pb-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-headline uppercase font-black tracking-tight flex items-center gap-3">
              <Shield className="h-8 w-8 sm:h-10 sm:w-10" />
              システム最高管理
            </h1>
            <p className="text-sm text-muted-foreground mt-1">学園祭イベント一覧の管理と新規イベント開設</p>
          </div>
        </div>

        {/* イベント管理セクション */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6" />
              イベント一覧
            </h2>
            <Button onClick={() => setShowEventForm(!showEventForm)}>
              <Plus className="mr-2 h-4 w-4" />
              新規イベント開設
            </Button>
          </div>

          {/* イベント作成フォーム */}
          {showEventForm && (
            <Card className="border-thick border-border rounded-none bg-muted/20">
              <CardHeader className="border-b border-border/20">
                <CardTitle className="text-base uppercase">[新規イベント作成]</CardTitle>
                <CardDescription>新しい学園祭イベントを開設します。</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="eventName">イベント名 *</Label>
                    <Input
                      id="eventName"
                      placeholder="例: 茨香祭 2026"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={eventForm.eventName}
                      onChange={(e) =>
                        setEventForm({
                          ...eventForm,
                          eventName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eventDescription">説明</Label>
                    <Input
                      id="eventDescription"
                      placeholder="第34回 茨香祭 など"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={eventForm.description}
                      onChange={(e) =>
                        setEventForm({
                          ...eventForm,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startDate">開始日</Label>
                    <Input
                      id="startDate"
                      type="date"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={eventForm.startDate}
                      onChange={(e) =>
                        setEventForm({
                          ...eventForm,
                          startDate: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">終了日</Label>
                    <Input
                      id="endDate"
                      type="date"
                      className="border-thick border-border rounded-none focus-visible:ring-0"
                      value={eventForm.endDate}
                      onChange={(e) =>
                        setEventForm({ ...eventForm, endDate: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="border-thick border-border rounded-none"
                    onClick={() => setShowEventForm(false)}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleCreateEvent}
                    disabled={!eventForm.eventName || createEventMutation.isPending}
                    className="border-thick border-border rounded-none bg-primary text-primary-foreground hover:bg-background hover:text-foreground transition-all"
                  >
                    {createEventMutation.isPending ? "作成中..." : "イベントを開設"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* イベント一覧 */}
          {eventsLoading ? (
            <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
          ) : events && events.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {events.map((evt) => (
                <Card
                  key={evt.id}
                  className="border-thick border-border rounded-none bg-background flex flex-col justify-between"
                >
                  <CardHeader className="border-b border-border/20 p-4">
                    <CardTitle className="text-base truncate flex items-center gap-2">
                      <Calendar className="h-5 w-5 shrink-0" />
                      {evt.eventName}
                    </CardTitle>
                    {evt.description && (
                      <CardDescription className="text-xs truncate">{evt.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="text-xs text-muted-foreground space-y-1">
                      {evt.startDate && (
                        <p>開始: {new Date(evt.startDate).toLocaleDateString("ja-JP")}</p>
                      )}
                      {evt.endDate && (
                        <p>終了: {new Date(evt.endDate).toLocaleDateString("ja-JP")}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-thick border-border rounded-none uppercase font-black tracking-wider text-xs"
                      onClick={() => handleManageEvent(evt)}
                    >
                      このイベントを管理
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-thick border-dashed border-border rounded-none p-8 text-center text-muted-foreground bg-muted/10">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>開設済みのイベントがありません。</p>
            </Card>
          )}
        </div>
      </div>
    </SystemAdminGuard>
  );
}
