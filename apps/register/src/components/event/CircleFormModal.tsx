import { circleApi } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import {
  FormField,
  FormSubmitButton,
  EditModeBanner,
} from "@/components/ui/FormField";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { useEntityForm } from "@/hooks/useEntityForm";
import { Save } from "lucide-react";

interface CircleFormModalProps {
  eventId: string;
  isOpen: boolean;
  onClose: () => void;
  circle?: any | null; // 編集時は既存のCircleオブジェクトを渡す
}

type CircleForm = {
  name: string;
  description: string;
};

// 2026-07-07 (Phase 3a/3b): サークル作成はセルフサービス化された。
// 旧仕様は管理者が代表者のメール/名前/PINを入力して代理作成するものだったが、
// 新仕様では better-auth ログイン中のユーザー本人がここで作成すると同時に
// 自分自身が circle_manager になる。そのため managerEmail/managerName/managerPin
// の入力欄は廃止し、名前と説明のみを扱う。
export function CircleFormModal({ eventId, isOpen, onClose, circle }: CircleFormModalProps) {
  const {
    form, setForm, isEdit, isConfirmOpen, setIsConfirmOpen, isCreating, saveStatus,
    triggerAutoSave, handleOverlayClose, handleSaveAndClose, handleDiscardAndClose,
  } = useEntityForm<CircleForm, any>({
    isOpen,
    entity: circle,
    emptyForm: { name: "", description: "" },
    toForm: (c) => ({
      name: c.name || "",
      description: c.description || "",
    }),
    onClose,
    toastId: "circle-auto-save",
    invalidateKeys: [["circles", eventId]],
    create: (data) =>
      circleApi.create({
        eventId,
        name: data.name,
        description: data.description || undefined,
      }),
    update: (c, data) =>
      circleApi.update(c.id, {
        name: data.name,
        description: data.description || undefined,
      }),
    validate: (data) =>
      !data.name ? "サークル名は必須入力です" : null,
    messages: {
      createSuccess: "サークルを新規登録しました",
      createError: "サークルの作成に失敗しました",
      updateSuccess: "サークル情報を自動保存しました",
    },
  });

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleOverlayClose}
        title={isEdit ? `[サークル編集: ${circle?.name}]` : "[新規サークル登録]"}
      >
        {isEdit && <EditModeBanner saveStatus={saveStatus} />}

        {/* セルフサービス化の説明: 作成すると自分が管理者(circle_manager)になる旨を明示する */}
        {!isEdit && (
          <p className="mb-3 font-mono text-[12px] text-muted-foreground border-thin border-border bg-muted/30 p-2">
            サークルを作成すると、あなた自身がこのサークルの管理者（サークルマネージャー）になります。
            スタッフの追加はサークル作成後、メンバー管理画面の招待リンクから行えます。
          </p>
        )}

        <div className="grid grid-cols-1 gap-4">
          <FormField
            id="circleName"
            label="サークル名"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onBlur={triggerAutoSave}
            placeholder="例: たこ焼き 茨香庵"
          />
          <FormField
            id="circleDescription"
            label="説明"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            onBlur={triggerAutoSave}
            placeholder="出店ジャンルや販売メニュー等の説明"
          />
        </div>

        {!isEdit && (
          <FormSubmitButton
            onClick={handleSaveAndClose}
            disabled={!form.name}
            isPending={isCreating}
            icon={Save}
          >
            追加する
          </FormSubmitButton>
        )}
      </Modal>

      <UnsavedChangesDialog
        isOpen={isConfirmOpen}
        title="[確認: 保存されていないサークル登録があります]"
        description="サークル追加を完了するには「保存して閉じる」を押してください。破棄する場合は「保存せず閉じる」を選択してください。"
        onConfirm={handleSaveAndClose}
        onDiscard={handleDiscardAndClose}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </>
  );
}
