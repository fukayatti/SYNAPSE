import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleAuthGuard, PermissionGuard, useAuth } from "@/hooks/useCircleAuth";
import { menuApi, toppingApi, circleApi, parseCircleSettings } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { undoableDelete } from "@/lib/toast-undo";
import { Plus, Edit, UtensilsCrossed, ArrowUp, ArrowDown } from "lucide-react";

// モーダルインポート
import { MenuFormModal } from "@/components/menu/MenuFormModal";
import { ToppingFormModal } from "@/components/menu/ToppingFormModal";
import { resolveAssetUrl } from "@/lib/asset-url";

function MenuManagementContent() {
  // 2026-07-16: circleId/circleName を useState+useEffect(mount時一度きり) で
  // localStorage から固定読みしていたため、同一パス上でスペース切り替え後も
  // 古いサークルのメニュー管理画面のまま表示され続けていた。useAuth() (authChange
  // 購読) に統一する。
  const { circleId: authCircleId, circleName: authCircleName } = useAuth();
  const circleId = authCircleId ?? "";
  const circleName = authCircleName ?? "サークルダッシュボード";

  // モーダル開閉用ステート
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<any | null>(null);

  const [isToppingOpen, setIsToppingOpen] = useState(false);
  const [selectedTopping, setSelectedTopping] = useState<any | null>(null);
  const [isReorderingToppings, setIsReorderingToppings] = useState(false);


  const queryClient = useQueryClient();

  const {
    data: menus,
    isLoading: menusLoading,
    isError: menusError,
    error: menusErrorObj,
    refetch: refetchMenus,
  } = useQuery({
    queryKey: ["menus", circleId],
    queryFn: () => menuApi.list(circleId),
    enabled: !!circleId,
  });

  const {
    data: toppings,
    isLoading: toppingsLoading,
    isError: toppingsError,
    error: toppingsErrorObj,
    refetch: refetchToppings,
  } = useQuery({
    queryKey: ["toppings", circleId],
    queryFn: () => toppingApi.list(circleId),
    enabled: !!circleId,
  });

  // 在庫管理拡張がONか (ONなら売切はメニュー管理から変更不可、在庫で自動制御)
  const { data: circleData } = useQuery({
    queryKey: ["circle", circleId],
    queryFn: () => circleApi.get(circleId),
    enabled: !!circleId,
  });
  // 2026-09-27: Keep the legacy circle switch only for topping stock; menu inventory is per-product.
  const toppingStockManaged = parseCircleSettings(circleData?.settings).extensions.stock;

  // カードから売切をワンタップで切り替える (在庫管理OFF時のみ) (2026-07-14)
  const toggleSoldOut = useMutation({
    mutationFn: (menu: any) => menuApi.update(menu.id, { soldOut: !menu.soldOut }),
    onSuccess: (_d, menu) => {
      toast.success(menu.soldOut ? "販売中に戻しました" : "売り切れにしました");
      queryClient.invalidateQueries({ queryKey: ["menus", circleId] });
    },
    onError: (e: any) => toast.error(e?.message || "更新に失敗しました"),
  });

  // トッピングの売切をワンタップで切り替える (在庫管理OFF時のみ。ON時は在庫連動) (2026-07-15)
  const toggleToppingSoldOut = useMutation({
    mutationFn: (topping: any) => toppingApi.update(topping.id, { soldOut: !topping.soldOut }),
    onSuccess: (_d, topping) => {
      toast.success(topping.soldOut ? "販売中に戻しました" : "売り切れにしました");
      queryClient.invalidateQueries({ queryKey: ["toppings", circleId] });
      queryClient.invalidateQueries({ queryKey: ["menus", circleId] }); // メニューの紐付け表示も更新
    },
    onError: (e: any) => toast.error(e?.message || "更新に失敗しました"),
  });

  // メニュー削除 (確認ダイアログの代わりに undo 付きトースト)
  const handleDeleteMenu = (menu: any) =>
    undoableDelete({
      queryClient,
      queryKey: ["menus", circleId],
      id: menu.id,
      // 2026-10-21: 履歴は保持する操作のため、物理削除と誤解しない販売停止表記にする。
      message: `メニュー「${menu.name}」を販売停止にしました`,
      commit: () => menuApi.delete(menu.id),
    });

  // トッピング削除 (undo 付き)
  const handleDeleteTopping = (topping: any) =>
    undoableDelete({
      queryClient,
      queryKey: ["toppings", circleId],
      id: topping.id,
      // 2026-10-21: 履歴は保持する操作のため、物理削除と誤解しない使用停止表記にする。
      message: `トッピング「${topping.name}」を使用停止にしました`,
      commit: async () => {
        await toppingApi.delete(topping.id);
        queryClient.invalidateQueries({ queryKey: ["menus", circleId] }); // メニューのトッピング一覧も更新
      },
  });

  const handleOpenMenuAdd = () => {
    setSelectedMenu(null);
    setIsMenuOpen(true);
  };

  const handleOpenMenuEdit = (menu: any) => {
    setSelectedMenu(menu);
    setIsMenuOpen(true);
  };

  const handleOpenToppingAdd = () => {
    setSelectedTopping(null);
    setIsToppingOpen(true);
  };

  const handleOpenToppingEdit = (topping: any) => {
    setSelectedTopping(topping);
    setIsToppingOpen(true);
  };

  // 2026-10-16: 既存データも含めて連番へ正規化し、上下操作後に順番が安定して保存されるようにする。
  const moveTopping = async (index: number, offset: -1 | 1) => {
    if (!toppings || isReorderingToppings) return;
    const target = index + offset;
    if (target < 0 || target >= toppings.length) return;
    const reordered = [...toppings];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    setIsReorderingToppings(true);
    try {
      await Promise.all(reordered.map((item, sortOrder) => toppingApi.update(item.id, { sortOrder })));
    } catch (error: any) {
      toast.error(error?.message || "順番を保存できませんでした");
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["toppings", circleId] });
      setIsReorderingToppings(false);
    }
  };

  if (menusLoading || toppingsLoading) {
    return (
      <DashboardLayout title={circleName} subtitle="メニュー・トッピング管理" type="circle">
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={circleName} subtitle="メニュー・トッピング管理" type="circle">
      <div className="space-y-8 font-mono text-foreground">
        
        {/* メニューセクション */}
        <section aria-labelledby="menu-management-heading" className="space-y-4 border-thick border-border p-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b-thick border-border pb-3 gap-2 sm:gap-0">
            <h2 id="menu-management-heading" className="text-sm font-bold uppercase tracking-wider">[メニュー管理]</h2>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                onClick={handleOpenMenuAdd}
                className="flex-1 sm:flex-none rounded-none border-thick border-primary bg-primary text-primary-foreground hover:bg-background hover:text-foreground h-8 text-[11px] font-bold uppercase px-3 flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                メニューを追加
              </Button>
            </div>
          </div>

          {/* メニュー一覧 */}
          {menusError ? (
            <ErrorState error={menusErrorObj} onRetry={() => refetchMenus()} />
          ) : !menus || menus.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              message="メニューがまだありません"
              actionLabel="メニューを追加"
              onAction={handleOpenMenuAdd}
            />
          ) : (
            <div className="space-y-6">
              {/* 2026-10-16: メニューはカテゴリ単位の横幅を使う行表示にし、編集フォームへ設定を集約する。 */}
              {[...new Set(menus.map((menu) => menu.category?.trim() || "未分類"))].sort((a, b) => a.localeCompare(b, "ja")).map((category) => (
                <section key={category} className="space-y-2">
                  <h3 className="border-b-thin border-border pb-2 text-xs font-bold uppercase">{category}</h3>
                  <div className="w-full divide-y-thin divide-border border-y-thin border-border">
              {menus.filter((menu) => (menu.category?.trim() || "未分類") === category).map((menu) => (
                <div key={menu.id} className="flex w-full flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  {menu.imagePath ? <img src={resolveAssetUrl(menu.imagePath)} alt="" className="h-16 w-20 shrink-0 border-thin border-border object-cover" /> : <div className="flex h-16 w-20 shrink-0 items-center justify-center bg-muted text-[9px] uppercase">No Image</div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3"><CardTitle className="text-sm font-bold uppercase">{menu.name}</CardTitle><span className="text-base font-black">¥{menu.price.toLocaleString()}</span>
                      {menu.soldOut && <span className="border-thin border-destructive bg-destructive/10 px-1 text-[10px] font-bold text-destructive">売り切れ</span>}
                      {menu.inventoryEnabled && <span className="text-[10px] text-muted-foreground">在庫 {menu.stockQuantity ?? 0}</span>}
                    </div>
                    {menu.description && <p className="mt-1 text-xs text-muted-foreground">{menu.description}</p>}
                    {menu.toppings?.length ? <p className="mt-1 text-[10px] text-muted-foreground">対応トッピング: {menu.toppings.map((t) => t.name).join("、")}</p> : null}
                  </div>
                  {/* 2026-10-16: 操作ボタンは狭い画面で折り返し、商品名と重ならないようにする。 */}
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {/* 2026-10-21: 売切中の操作も状態色に合わせ、販売再開対象を一覧で見つけやすくする。 */}
                    {!menu.inventoryEnabled && <Button type="button" variant={menu.soldOut ? "destructive" : "outline"} size="sm" onClick={() => toggleSoldOut.mutate(menu)} disabled={toggleSoldOut.isPending}>{menu.soldOut ? "販売再開" : "売り切れ"}</Button>}
                    <Button variant="outline" size="sm" onClick={() => handleOpenMenuEdit(menu)}><Edit className="mr-1 h-3 w-3" />編集</Button>
                  </div>
                </div>
              ))}
                  </div>
                </section>
              ))}
            </div>

          )}
        </section>

        {/* トッピングセクション */}
        <section aria-labelledby="topping-management-heading" className="space-y-4 border-thick border-border p-4">
          <div className="flex justify-between items-center border-b-thick border-border pb-3">
            <h2 id="topping-management-heading" className="text-sm font-bold uppercase tracking-wider">[トッピング管理]</h2>
            <Button
              onClick={handleOpenToppingAdd}
              className="rounded-none border-thick border-primary bg-primary text-primary-foreground hover:bg-background hover:text-foreground h-8 text-[11px] font-bold uppercase px-3 flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              トッピングを追加
            </Button>
          </div>

          {/* トッピング一覧 */}
          {toppingsError ? (
            <ErrorState error={toppingsErrorObj} onRetry={() => refetchToppings()} />
          ) : !toppings || toppings.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              message="トッピングがまだありません"
              actionLabel="トッピングを追加"
              onAction={handleOpenToppingAdd}
            />
          ) : (
            <>
              {/* 2026-10-16: トッピング一覧は全幅の行と並び替え操作で現場の順序調整を可能にする。 */}
              <div className="w-full divide-y-thin divide-border border-y-thin border-border">
              {toppings.map((topping, index) => (
                <div key={topping.id} className="flex w-full flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  {topping.imagePath ? <img src={resolveAssetUrl(topping.imagePath)} alt="" className="h-14 w-16 shrink-0 border-thin border-border object-cover" /> : <div className="flex h-14 w-16 shrink-0 items-center justify-center bg-muted text-[9px] uppercase">No Image</div>}
                  <div className="min-w-0 flex-1"><p className="text-sm font-bold uppercase">{topping.name}</p><p className="text-[10px] text-muted-foreground">{topping.category || "未分類"} · +¥{topping.price.toLocaleString()} · <span className={topping.soldOut ? "font-bold text-destructive" : "text-success"}>{topping.soldOut ? "売り切れ" : "販売中"}</span></p>{topping.description && <p className="mt-1 text-xs text-muted-foreground">{topping.description}</p>}</div>
                  {/* 2026-10-16: 順序調整の意味をラベルで示し、販売操作と見分けやすくする。 */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="w-full text-[9px] font-bold uppercase text-muted-foreground sm:w-auto">順番</span>
                    <Button type="button" variant="outline" size="icon" title="上へ移動" aria-label={`${topping.name}を上へ`} disabled={isReorderingToppings || index === 0} onClick={() => moveTopping(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" variant="outline" size="icon" title="下へ移動" aria-label={`${topping.name}を下へ`} disabled={isReorderingToppings || index === toppings.length - 1} onClick={() => moveTopping(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    {!toppingStockManaged && <Button type="button" variant={topping.soldOut ? "destructive" : "outline"} size="sm" onClick={() => toggleToppingSoldOut.mutate(topping)}>{topping.soldOut ? "販売再開" : "売り切れ"}</Button>}
                    <Button variant="outline" size="sm" onClick={() => handleOpenToppingEdit(topping)}><Edit className="mr-1 h-3 w-3" />編集</Button>
                  </div>
                </div>
              ))}
              </div>
            </>
          )}
        </section>

      </div>

      {/* 各種モーダルダイアログ */}
      <MenuFormModal
        circleId={circleId}
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        menu={selectedMenu}
        onDelete={selectedMenu ? () => { handleDeleteMenu(selectedMenu); setIsMenuOpen(false); } : undefined}
      />

      <ToppingFormModal
        circleId={circleId}
        isOpen={isToppingOpen}
        onClose={() => setIsToppingOpen(false)}
        topping={selectedTopping}
        onDelete={selectedTopping ? () => { handleDeleteTopping(selectedTopping); setIsToppingOpen(false); } : undefined}
      />

    </DashboardLayout>
  );
}

export default function MenuManagementPage() {
  return (
    <CircleAuthGuard>
      <PermissionGuard permission="menu:write" showDenied>
        <MenuManagementContent />
      </PermissionGuard>
    </CircleAuthGuard>
  );
}
