import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { eventApi, type EventAnnouncement } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, formControlClassName } from "@/components/ui/FormField";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { undoableDelete } from "@/lib/toast-undo";
import { PermissionGuard } from "@/hooks/useCircleAuth";
import { Megaphone, Plus, Archive, RotateCcw } from "lucide-react";

// イベント内スタッフへの一斉アナウンス (2026-07-12 新設 / 2026-07-16 履歴管理・モーダル化)
// イベント配下の全メンバー(イベントスタッフ+全サークルのスタッフ)へ通知を送る。
// 受信者は既存の通知センター(ヘッダーのベル)で受け取り、既読にできる。
//
// 2026-07-16 の変更意図:
// - 「送るだけで過去分が見られない」という要望に対応するため、送信履歴
//   (GET /api/festivals/:id/announcements、実体は event_announcement テーブル) の
//   一覧表示・削除を追加した。履歴の保存先の設計判断は packages/db/src/schema/core.ts
//   の eventAnnouncement テーブル定義コメントを参照。
// - プロジェクト全体で「入力フォームはポップアップ(モーダル)で行う」方針に合わせ、
//   送信フォームを常設のインライン入力から Modal + FormField に変更した。
export function AnnounceTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const {
    data: history,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["eventAnnouncements", eventId, showDeleted],
    queryFn: () => showDeleted ? eventApi.archivedAnnouncements(eventId) : eventApi.announcements(eventId),
  });

  const send = useMutation({
    mutationFn: () => eventApi.announce(eventId, { title: title.trim(), message: message.trim() }),
    onSuccess: (res) => {
      toast.success(`${res.sent} 名のスタッフに送信しました`);
      setTitle("");
      setMessage("");
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["eventAnnouncements", eventId] });
    },
    onError: (e: any) => toast.error(e?.message || "送信に失敗しました"),
  });

  const handleDelete = (a: EventAnnouncement) =>
    undoableDelete<EventAnnouncement>({
      queryClient,
      queryKey: ["eventAnnouncements", eventId, showDeleted],
      id: a.id,
      message: `「${a.title}」の履歴を非表示にしました`,
      commit: async () => {
        await eventApi.deleteAnnouncement(eventId, a.id);
        await queryClient.invalidateQueries({ queryKey: ["eventAnnouncements", eventId] });
      },
    });

  const restore = useMutation({
    mutationFn: (announcementId: string) => eventApi.restoreAnnouncement(eventId, announcementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eventAnnouncements", eventId] });
      toast.success("送信履歴を復元しました");
    },
    onError: (e: any) => toast.error(e?.message || "履歴の復元に失敗しました"),
  });

  const visibleHistory = (history ?? []).filter((announcement) => showDeleted
    ? announcement.deletedAt !== null
    : announcement.deletedAt === null);

  const canSend = title.trim().length > 0 && message.trim().length > 0;

  const closeModal = () => {
    if (send.isPending) return;
    setIsModalOpen(false);
    setTitle("");
    setMessage("");
  };

  return (
    <div className="w-full min-w-0 max-w-2xl space-y-4">
      {/* 2026-10-20: 説明文が長い画面では見出しと操作ボタンを縦に分け、本文を狭い幅でも折り返す。 */}
      <div className="flex min-w-0 flex-col gap-3 border-b-thick border-border pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider">
            <Megaphone className="h-4 w-4" /> 一斉アナウンス
          </h2>
          <p className="mt-1 break-words text-[11px] leading-[1.6] text-muted-foreground font-mono">
            イベント配下の<strong className="text-foreground">全スタッフ</strong>(イベントスタッフ + 各サークルのスタッフ)へ
            通知を送ります。受信者はヘッダーの通知(ベル)で確認・既読にできます。
          </p>
        </div>
        <PermissionGuard permission="member:write">
          <Button
            onClick={() => setIsModalOpen(true)}
            className="h-8 w-fit shrink-0 rounded-none border-thick border-primary bg-primary px-3 text-[11px] font-bold uppercase text-primary-foreground shadow-none hover:bg-background hover:text-foreground"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新規作成
          </Button>
        </PermissionGuard>
      </div>

      {/* 2026-10-21: 非表示にした履歴も管理者が戻せるよう、一覧から切替える。 */}
      <PermissionGuard permission="member:write">
        <Button variant="outline" size="sm" onClick={() => setShowDeleted((value) => !value)}>
          {showDeleted ? "削除済み履歴を隠す" : "削除済み履歴を表示"}
        </Button>
      </PermissionGuard>

      {/* 送信履歴 (2026-07-16) */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : visibleHistory.length > 0 ? (
        <div className="space-y-3">
          {visibleHistory.map((a) => (
            <div key={a.id} className="border-thick border-border p-3 bg-background space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      <span className="break-words">{a.title}</span>
                      {a.deletedAt && <span className="text-[10px] font-bold text-destructive">削除済み</span>}
                    </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {a.message}
                  </p>
                  <div className="text-[9px] text-muted-foreground font-mono">
                    {new Date(a.createdAt).toLocaleString("ja-JP")} ・ {a.senderEmail} ・ {a.recipientCount}名へ送信
                  </div>
                </div>
                <PermissionGuard permission="member:write">
                  {a.deletedAt ? (
                    <Button variant="outline" onClick={() => restore.mutate(a.id)} disabled={restore.isPending} className="shrink-0 text-xs">
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />復元
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleDelete(a)}
                      className="rounded-none border-thick border-border h-8 text-destructive hover:bg-destructive hover:text-destructive-foreground px-2 bg-background shadow-none shrink-0"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </PermissionGuard>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Megaphone}
          message={showDeleted ? "削除済みの送信履歴はありません" : "送信したアナウンスはまだありません"}
          actionLabel={showDeleted ? undefined : "新規作成"}
          onAction={showDeleted ? undefined : () => setIsModalOpen(true)}
        />
      )}

      {/* 新規作成モーダル */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title="[新しいアナウンスを送信]"
        subtitle="送信は取り消せません。緊急連絡・重要な変更に利用してください。"
      >
        <div className="space-y-4">
          <FormField
            id="an-title"
            label="タイトル"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 15時から雨天対応に切り替えます"
            maxLength={120}
          />
          <div className="space-y-1">
            <Label htmlFor="an-message" className="text-xs font-bold uppercase">
              本文 *
            </Label>
            <textarea
              id="an-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="スタッフへの連絡内容を入力してください"
              maxLength={2000}
              rows={5}
              className={`${formControlClassName} w-full h-auto p-2 resize-y`}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t-thick border-border">
            <Button
              onClick={closeModal}
              disabled={send.isPending}
              className="rounded-none border-thick border-border bg-background text-foreground hover:bg-muted h-10 text-xs font-bold uppercase px-4 shadow-none"
            >
              キャンセル
            </Button>
            <Button
              onClick={() => send.mutate()}
              disabled={!canSend || send.isPending}
              className="rounded-none border-thick border-primary bg-primary text-primary-foreground hover:bg-background hover:text-foreground h-10 text-xs font-bold uppercase px-4 shadow-none flex items-center gap-1.5"
            >
              <Megaphone className="h-4 w-4" />
              {send.isPending ? "送信中..." : "全スタッフに送信する"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
