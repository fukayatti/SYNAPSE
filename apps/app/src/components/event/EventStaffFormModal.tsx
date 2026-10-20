import { membershipApi } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import {
  FormField,
  FormSelect,
  FormSubmitButton,
} from "@/components/ui/FormField";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { useEntityForm } from "@/hooks/useEntityForm";
import { UserPlus } from "lucide-react";

interface EventStaffFormModalProps {
  eventId: string;
  isOpen: boolean;
  onClose: () => void;
}

// 2026-07-12 (SaaS): バックエンドの enum に無い "event_staff"/"event_admin" を
// 送って 400 になっていた不具合を修正 (role-vocab-debt)。有効なロールに統一する。
// - event_manager: イベント共同管理者 (特定の人宛。email 必須)。
// - circle_manager (circleId 無し) = circle_host: サークル出店の招待。
//   出店代表者がこのコード/リンクでサークルを新規作成し circle_manager になる。
//   複数サークルに配るため email 任意・maxUses 複数可。
type InvitePurpose = "event_manager" | "event_staff" | "event_wristband_staff" | "event_stamp_staff" | "circle_host";
// 2026-07-15: 期限付き・人数制限付きの招待リンク機能向上のため、expiresInDays から expiresInHours (時間指定) に変更
type InviteForm = { email: string; purpose: InvitePurpose; maxUses: number; expiresInHours: number };

export function EventStaffFormModal({ eventId, isOpen, onClose }: EventStaffFormModalProps) {
  // 招待は常に新規発行のみ (編集モードなし) なので entity は渡さない。
  const {
    form, setForm, isConfirmOpen, setIsConfirmOpen, isCreating,
    handleOverlayClose, handleSaveAndClose, handleDiscardAndClose,
  } = useEntityForm<InviteForm, never>({
    isOpen,
    emptyForm: { email: "", purpose: "circle_host", maxUses: 1, expiresInHours: 168 },
    onClose,
    toastId: "event-staff-invite",
    invalidateKeys: [["invites", eventId]],
    create: (data) =>
      membershipApi.createInvite({
        eventId,
        // circle_host はイベント配下にサークルを作る権利 (role=circle_manager, circleId 無し)。当日スタッフは担当範囲のロールで招待する。
        role: data.purpose === "circle_host" ? "circle_manager" : data.purpose,
        // 2026-07-15: 共同管理者でも直接リンク共有可能にするためメールアドレスは任意。
        targetEmail: data.email.trim() ? data.email.toLowerCase() : undefined,
        // 2026-10-15 Issue #122: 0回は1回制限ではなく無制限として保存する。
        maxUses: data.maxUses === 0 ? null : Math.min(100, Math.max(1, data.maxUses)),
        // 2026-07-15: サークルと同様に時間(1〜168時間)でクランプして送信。
        expiresInHours: Math.min(168, Math.max(1, data.expiresInHours)),
      }),
    validate: () => null, // 2026-07-15: 共同管理者でもメールアドレスを任意とするためバリデーションを解除
    hasInput: (data) =>
      data.email.trim() !== "" ||
      data.maxUses !== 1 ||
      data.expiresInHours !== 168 ||
      data.purpose !== "circle_host",
    messages: {
      createSuccess: "招待を発行しました",
      createError: "招待の発行に失敗しました",
      updateSuccess: "",
    },
  });

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleOverlayClose}
        maxWidth="md"
        title="スタッフ招待を発行"
      >
        <FormSelect
          id="invitePurpose"
          label="招待の種類"
          value={form.purpose}
          onChange={(e) => setForm({ ...form, purpose: e.target.value as InvitePurpose })}
        >
          <option value="circle_host">サークル出店 (代表者がサークルを作成)</option>
          <option value="event_manager">イベント共同管理者 (フルアクセス)</option>
          <option value="event_staff">当日スタッフ (紛失バンド交換・スタンプラリー)</option>
          <option value="event_wristband_staff">当日スタッフ (紛失バンド交換)</option>
          <option value="event_stamp_staff">当日スタッフ (スタンプラリー)</option>
        </FormSelect>

        <FormField
          id="inviteEmail"
          label="メールアドレス (任意)"
          required={false}
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="staff@example.com (任意)"
        />

        <FormField
          id="inviteMaxUses"
          label={`${form.purpose !== "circle_host" ? "最大使用回数 (人数)" : "使用可能回数 (何サークル分)"}${form.maxUses === 0 ? "（無制限）" : ""}`}
          type="number"
          min={0}
          max={100}
          value={String(form.maxUses)}
          onChange={(e) => {
            const n = parseInt(e.target.value);
            setForm({ ...form, maxUses: Number.isNaN(n) ? 0 : Math.max(0, n) });
          }}
          placeholder={form.maxUses === 0 ? "無制限" : "1"}
        />
        <p className="-mt-1 text-[10px] text-muted-foreground" aria-live="polite">
          0を入力すると無制限です（現在: {form.maxUses === 0 ? "無制限" : `${form.maxUses}回`}）。
        </p>

        <FormField
          id="inviteExpiry"
          label="有効期限（時間）"
          type="number"
          max={168}
          value={String(form.expiresInHours)}
          onChange={(e) => {
            const n = parseInt(e.target.value);
            setForm({ ...form, expiresInHours: Number.isNaN(n) ? 0 : Math.max(0, n) });
          }}
          placeholder="168"
        />

        <FormSubmitButton
          onClick={handleSaveAndClose}
          isPending={isCreating}
          icon={UserPlus}
        >
          招待を発行する
        </FormSubmitButton>
      </Modal>

      <UnsavedChangesDialog
        isOpen={isConfirmOpen}
        title="招待を発行せずに閉じますか？"
        description="招待を発行するには「招待を発行する」を押してください。破棄する場合は「保存せず閉じる」を選択してください。"
        onConfirm={handleSaveAndClose}
        onDiscard={handleDiscardAndClose}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </>
  );
}
