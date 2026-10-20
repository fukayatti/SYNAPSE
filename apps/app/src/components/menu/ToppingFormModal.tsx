import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Package, Save, Store } from "lucide-react";
import { toppingApi, circleApi, parseCircleSettings, type Topping } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ImageUpload } from "@/components/image-upload";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import {
  FormField,
  FormSelect,
  FormSubmitButton,
  EditModeBanner,
} from "@/components/ui/FormField";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { useEntityForm } from "@/hooks/useEntityForm";
import { Button } from "@/components/ui/button";
import { AllergenSelector } from "@/components/menu/AllergenSelector";
import { SignedPriceField } from "@/components/menu/SignedPriceField";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseJapaneseAllergens, type JapaneseAllergen } from "@fesflow/config/allergens";

interface ToppingFormModalProps {
  circleId: string;
  isOpen: boolean;
  onClose: () => void;
  topping?: Topping | null;
  onDelete?: () => void;
}

// 売り切れフラグを保持 (2026-07-15)。メニュー同様、在庫数はトッピング編集では扱わず
// 在庫管理から操作する。ここで持つのは売切かどうかだけ。
type ToppingForm = { name: string; category: string; price: number; imagePath: string; description: string; allergens: JapaneseAllergen[] | null; soldOut: boolean };

export function ToppingFormModal({ circleId, isOpen, onClose, topping, onDelete }: ToppingFormModalProps) {
  // 2026-10-21: 商品情報と販売状態を分け、長い編集欄を目的別に見渡せるようにする。
  const [activeSection, setActiveSection] = useState("product");
  const [newCategory, setNewCategory] = useState("");
  useEffect(() => {
    if (isOpen) {
      setNewCategory("");
      setActiveSection("product");
    }
  }, [isOpen, topping?.id]);

  const { data: toppings } = useQuery({
    queryKey: ["toppings", circleId],
    queryFn: () => toppingApi.list(circleId),
    enabled: isOpen && !!circleId,
  });

  // 在庫管理拡張ONのサークルでは、売切はトッピング編集から変更不可 (在庫で自動制御)。
  const { data: circleData } = useQuery({
    queryKey: ["circle", circleId],
    queryFn: () => circleApi.get(circleId),
    enabled: isOpen && !!circleId,
  });
  const stockManaged = parseCircleSettings(circleData?.settings).extensions.stock;

  const queryClient = useQueryClient();
  const {
    form, setForm, isEdit, isConfirmOpen, setIsConfirmOpen, isCreating, saveStatus,
    triggerAutoSave, saveNow, handleOverlayClose, handleSaveAndClose, handleDiscardAndClose,
  } = useEntityForm<ToppingForm, Topping>({
    isOpen,
    entity: topping,
    emptyForm: { name: "", category: "", price: 0, imagePath: "", description: "", allergens: null, soldOut: false },
    toForm: (t) => ({
      name: t.name,
      category: t.category || "",
      price: t.price,
      imagePath: t.imagePath || "",
      description: t.description || "",
      allergens: parseJapaneseAllergens(t.allergens),
      soldOut: t.soldOut ?? false,
    }),
    onClose,
    toastId: "topping-auto-save",
    invalidateKeys: [["toppings", circleId]],
    create: (data) => {
      if (data.allergens === null) throw new Error("トッピングを登録する前にアレルゲンを選択してください。");
      return toppingApi.create({
        circleId,
        name: data.name,
        category: data.category.trim(),
        price: data.price,
        imagePath: data.imagePath || undefined,
        description: data.description || undefined,
        allergens: data.allergens,
        soldOut: data.soldOut,
      });
    },
    update: async (t, data) => {
      if (data.allergens === null) throw new Error("トッピングを保存する前にアレルゲンを選択してください。");
      await toppingApi.update(t.id, {
        name: data.name,
        category: data.category.trim(),
        price: data.price,
        // 2026-10-07 Issue #48: 空文字は画像削除の明示値として PUT に渡す。
        imagePath: data.imagePath,
        description: data.description || null,
        allergens: data.allergens,
        soldOut: data.soldOut,
      });
    },
    validate: (data) => !data.name
      ? "トッピング名を入力してください"
      : data.allergens === null ? "アレルゲンまたは『なし』を選択してください" : null,
    messages: {
      createSuccess: "トッピングを追加しました",
      createError: "トッピングの追加に失敗しました",
      updateSuccess: "変更を自動保存しました",
    },
  });

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleOverlayClose}
        title={isEdit ? `[トッピング編集: ${topping?.name}]` : "[新規トッピング追加]"}
      >
        {isEdit && <EditModeBanner saveStatus={saveStatus} />}

        {/* 2026-10-21: 商品名・金額・販売状態を編集前後で一目で比較できる要約。 */}
        <div className="flex min-w-0 items-center gap-3 border-b-thin border-border pb-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center border-thick border-border bg-muted/30">
            <Package className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{form.name || "トッピング名未設定"}</p>
            <p className={`font-mono text-xl font-bold ${form.price < 0 ? "text-destructive" : ""}`}>
              ¥{form.price.toLocaleString("ja-JP")}
            </p>
          </div>
          <div className={`shrink-0 border-thick px-2 py-1 text-[10px] font-bold ${form.soldOut ? "border-destructive bg-destructive/10 text-destructive" : "border-success bg-success/10 text-success"}`}>
            {form.soldOut ? "売り切れ" : "販売中"}
          </div>
        </div>

        <Tabs value={activeSection} onValueChange={setActiveSection} className="w-full">
          <TabsList className="sticky top-0 z-10 grid h-auto grid-cols-2 gap-1 border-0 bg-background p-0">
            <TabsTrigger value="product" className="h-auto min-h-14 flex-col gap-1 border-thick border-border px-1 py-2 text-[10px] sm:text-xs">
              <span className="flex items-center gap-1"><Package className="h-4 w-4" aria-hidden="true" />商品</span>
              <span className="max-w-full truncate text-[9px] font-normal normal-case tracking-normal">名前・価格・カテゴリ</span>
            </TabsTrigger>
            <TabsTrigger value="availability" className="h-auto min-h-14 flex-col gap-1 border-thick border-border px-1 py-2 text-[10px] sm:text-xs">
              <span className="flex items-center gap-1"><Store className="h-4 w-4" aria-hidden="true" />販売</span>
              <span className={`max-w-full truncate text-[9px] font-normal normal-case tracking-normal ${form.soldOut ? "text-destructive" : "text-success"}`}>
                {form.soldOut ? "売り切れ" : "販売中"}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="product" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            id="toppingName"
            label="トッピング名"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onBlur={triggerAutoSave}
            placeholder="例: チーズ増量"
          />
          <SignedPriceField
            id="toppingPrice"
            label="価格"
            value={form.price}
            onChange={(e) => {
              const n = Number(e.target.value);
              setForm({ ...form, price: Number.isNaN(n) ? 0 : n });
            }}
            onBlur={triggerAutoSave}
            onToggleSign={() => {
              const next = { ...form, price: form.price < 0 ? Math.abs(form.price) : -Math.abs(form.price) };
              setForm(next);
              if (isEdit) saveNow(next);
            }}
          />
        </div>

        <div className="space-y-2">
          <FormSelect
            id="toppingCategory"
            label="トッピングカテゴリ"
            value={form.category}
            onChange={(e) => {
              const next = { ...form, category: e.target.value };
              setForm(next);
              if (isEdit) saveNow(next);
            }}
          >
            <option value="">未分類</option>
            {[...new Set([...(toppings ?? []).map((item) => item.category?.trim()).filter((value): value is string => !!value), form.category.trim()].filter(Boolean))]
              .sort((a, b) => a.localeCompare(b, "ja"))
              .map((category) => <option key={category} value={category}>{category}</option>)}
          </FormSelect>
          <div className="flex items-end gap-2">
            <FormField id="newToppingCategory" label="新しいカテゴリ" fieldClassName="min-w-0 flex-1" maxLength={100} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="例: サイズ / ソース" />
            <Button type="button" variant="outline" className="shrink-0" disabled={!newCategory.trim()} onClick={() => {
              const category = newCategory.trim();
              const next = { ...form, category };
              setForm(next);
              setNewCategory("");
              if (isEdit) saveNow(next);
            }}>追加して選択</Button>
          </div>
          <p className="text-[10px] text-muted-foreground">同じカテゴリ名のトッピングはレジの選択ステップにまとまります。新しいカテゴリは保存時に一覧へ反映されます。</p>
        </div>

        <ImageUpload
          label="トッピング画像"
          value={form.imagePath}
          entityKey={topping?.id ? `topping:${topping.id}:image` : undefined}
          // 2026-10-05 Issue #97: メニューと同様、完了後の画像保存をアップロードマネージャに任せる。
          onCommit={
            isEdit && topping
              ? async (path) => {
                  await toppingApi.update(topping.id, { imagePath: path });
                  queryClient.invalidateQueries({ queryKey: ["toppings", circleId] });
                }
              : undefined
          }
          onChange={(path) => setForm((prev) => ({ ...prev, imagePath: path }))}
        />

        <FormField
          id="toppingDescription"
          label="説明"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          onBlur={triggerAutoSave}
          placeholder="トッピングの説明"
        />
          </TabsContent>

          <TabsContent value="availability" className="space-y-4">

        <AllergenSelector
          value={form.allergens}
          onChange={(allergens) => {
            const next = { ...form, allergens };
            setForm(next);
            if (isEdit) saveNow(next);
          }}
          helpText="このトッピングに含まれるアレルゲンを登録してください。該当しない場合も『なし』を選択します。"
        />

        {/* 売り切れ設定 (2026-07-15)。在庫管理拡張ONのサークルでは在庫で自動制御されるため変更不可。 */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase">販売状態</Label>
          {stockManaged ? (
            <div className="border-thick border-border bg-muted/30 p-3 text-xs font-mono text-muted-foreground">
              このサークルは<strong className="text-foreground">在庫管理</strong>がONのため、売り切れは在庫数から自動判定されます。
              売切の切り替えは「在庫管理」から行ってください。
              {/* 2026-10-21: 在庫から自動判定される売切も、手動設定と同じ赤で区別する。 */}
              <div className={cn("mt-1.5 font-bold", form.soldOut ? "text-destructive" : "text-success")}>
                現在: {form.soldOut ? "売り切れ" : "販売中"}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                const next = { ...form, soldOut: !form.soldOut };
                setForm(next);
                if (isEdit) saveNow(next);
              }}
              className={cn(
                "w-full border-thick rounded-none px-3 py-2.5 text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                form.soldOut
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-success bg-success/10 text-success",
              )}
            >
              {form.soldOut ? "売り切れ (タップで販売中に戻す)" : "販売中 (タップで売り切れにする)"}
            </button>
          )}
        </div>
          </TabsContent>
        </Tabs>

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
        {/* 2026-10-21: 注文履歴を保った使用停止であることを操作前に示す。 */}
        <div className="flex justify-between gap-2 border-t-thick border-border pt-3">
          {isEdit && onDelete ? (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">今後の注文に表示されなくなります。過去の注文履歴には残ります。</p>
              <Button type="button" variant="destructive" onClick={onDelete}>使用停止</Button>
            </div>
          ) : <span />}
          <Button type="button" variant="outline" onClick={handleOverlayClose}>閉じる</Button>
        </div>
      </Modal>

      <UnsavedChangesDialog
        isOpen={isConfirmOpen}
        title="[確認: 保存されていないトッピング入力があります]"
        description="トッピング追加を完了するには「保存して閉じる」を押してください。破棄する場合は「保存せず閉じる」を選択してください。"
        onConfirm={handleSaveAndClose}
        onDiscard={handleDiscardAndClose}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </>
  );
}
