import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleAuthGuard, PermissionGuard, useAuth } from "@/hooks/useCircleAuth";
import { menuApi, toppingApi } from "@/lib/api";
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
import { queryCachePolicy } from "@/lib/query-cache-policy";

function MenuManagementContent() {
  // 2026-07-16: circleId/circleName を useState+useEffect(mount時一度きり) で
  // localStorage から固定読みしていたため、同一パス上でスペース切り替え後も
  // 古いサークルのメニュー管理画面のまま表示され続けていた。useAuth() (authChange
  // 購読) に統一する。
  const { circleId: authCircleId, circleName: authCircleName, checkPermission } = useAuth();
  const circleId = authCircleId ?? "";
  const circleName = authCircleName ?? "サークルダッシュボード";
  const canRestoreArchived = checkPermission("menu:delete");

  // モーダル開閉用ステート
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<any | null>(null);

  const [isToppingOpen, setIsToppingOpen] = useState(false);
  const [selectedTopping, setSelectedTopping] = useState<any | null>(null);
  const [isReorderingMenus, setIsReorderingMenus] = useState(false);
  const [isReorderingToppings, setIsReorderingToppings] = useState(false);


  const queryClient = useQueryClient();
  // 2026-10-21: 復元権限でアーカイブ項目の有無が変わるため、異なる一覧を同じキャッシュキーに混ぜない。
  const menuQueryKey = ["menus", circleId, canRestoreArchived];
  const toppingQueryKey = ["toppings", circleId, canRestoreArchived];

  const {
    data: menus,
    isLoading: menusLoading,
    isError: menusError,
    error: menusErrorObj,
    refetch: refetchMenus,
  } = useQuery({
    queryKey: menuQueryKey,
    queryFn: () => menuApi.list(circleId, canRestoreArchived),
    enabled: !!circleId,
    ...queryCachePolicy.catalog,
  });

  const {
    data: toppings,
    isLoading: toppingsLoading,
    isError: toppingsError,
    error: toppingsErrorObj,
    refetch: refetchToppings,
  } = useQuery({
    queryKey: toppingQueryKey,
    queryFn: () => toppingApi.list(circleId, canRestoreArchived),
    enabled: !!circleId,
    ...queryCachePolicy.catalog,
  });

  // カードから売切をワンタップで切り替える (在庫管理OFF時のみ) (2026-07-14)
  const toggleSoldOut = useMutation({
    mutationFn: (menu: any) => menuApi.update(menu.id, { soldOut: !menu.soldOut }),
    // 2026-10-21: 売切操作は現場で即時に確認できるよう、通信前に一覧へ反映する。
    onMutate: async (menu: any) => {
      const queryKey = menuQueryKey;
      await queryClient.cancelQueries({ queryKey });
      const previousMenus = queryClient.getQueryData<any[]>(queryKey);
      queryClient.setQueryData<any[]>(queryKey, (current) => current?.map((item) =>
        item.id === menu.id ? { ...item, soldOut: !item.soldOut } : item,
      ));
      return { previousMenus };
    },
    onSuccess: (_d, menu) => {
      toast.success(menu.soldOut ? "販売中に戻しました" : "売り切れにしました");
    },
    onError: (e: any, _menu: any, context: any) => {
      if (context?.previousMenus) queryClient.setQueryData(menuQueryKey, context.previousMenus);
      toast.error(e?.message || "更新に失敗しました");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["menus", circleId] }),
  });

  // 2026-10-21: 在庫残数とは別に一時提供停止を即時操作できるよう、手動売切を在庫管理中も許可する。
  const toggleToppingSoldOut = useMutation({
    mutationFn: (topping: any) => toppingApi.update(topping.id, { soldOut: !topping.soldOut }),
    // 2026-10-21: トッピング本体とメニュー内の紐付け表示を同時に先行更新する。
    onMutate: async (topping: any) => {
      const toppingKey = toppingQueryKey;
      const menuKey = menuQueryKey;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: toppingKey }),
        queryClient.cancelQueries({ queryKey: menuKey }),
      ]);
      const previousToppings = queryClient.getQueryData<any[]>(toppingKey);
      const previousMenus = queryClient.getQueryData<any[]>(menuKey);
      const soldOut = !topping.soldOut;
      queryClient.setQueryData<any[]>(toppingKey, (current) => current?.map((item) =>
        item.id === topping.id ? { ...item, soldOut } : item,
      ));
      queryClient.setQueryData<any[]>(menuKey, (current) => current?.map((menu) => ({
        ...menu,
        toppings: menu.toppings?.map((item: any) => item.id === topping.id ? { ...item, soldOut } : item),
      })));
      return { previousToppings, previousMenus };
    },
    onSuccess: (_d, topping) => {
      toast.success(topping.soldOut ? "販売中に戻しました" : "売り切れにしました");
    },
    onError: (e: any, _topping: any, context: any) => {
      if (context?.previousToppings) queryClient.setQueryData(toppingQueryKey, context.previousToppings);
      if (context?.previousMenus) queryClient.setQueryData(menuQueryKey, context.previousMenus);
      toast.error(e?.message || "更新に失敗しました");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["toppings", circleId] }),
        queryClient.invalidateQueries({ queryKey: ["menus", circleId] }),
      ]);
    },
  });

  const restoreMenu = useMutation({
    mutationFn: (menu: any) => menuApi.restore(menu.id),
    // 2026-10-21: 販売再開も一覧から即座に消し、成功時にサーバー状態へ同期する。
    onMutate: async (menu: any) => {
      const queryKey = menuQueryKey;
      await queryClient.cancelQueries({ queryKey });
      const previousMenus = queryClient.getQueryData<any[]>(queryKey);
      queryClient.setQueryData<any[]>(queryKey, (current) => current?.map((item) =>
        item.id === menu.id ? { ...item, isArchived: false } : item,
      ));
      return { previousMenus };
    },
    onSuccess: () => {
      toast.success("メニューの販売を再開しました");
    },
    onError: (error: any, _menu: any, context: any) => {
      if (context?.previousMenus) queryClient.setQueryData(menuQueryKey, context.previousMenus);
      toast.error(error?.message || "メニューを再開できませんでした");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["menus", circleId] }),
  });

  const restoreTopping = useMutation({
    mutationFn: (topping: any) => toppingApi.restore(topping.id),
    // 2026-10-21: 使用再開を両方の一覧へ先行反映し、API失敗時は元の表示へ戻す。
    onMutate: async (topping: any) => {
      const toppingKey = toppingQueryKey;
      const menuKey = menuQueryKey;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: toppingKey }),
        queryClient.cancelQueries({ queryKey: menuKey }),
      ]);
      const previousToppings = queryClient.getQueryData<any[]>(toppingKey);
      const previousMenus = queryClient.getQueryData<any[]>(menuKey);
      queryClient.setQueryData<any[]>(toppingKey, (current) => current?.map((item) =>
        item.id === topping.id ? { ...item, isArchived: false } : item,
      ));
      queryClient.setQueryData<any[]>(menuKey, (current) => current?.map((menu) => ({
        ...menu,
        toppings: menu.toppings?.map((item: any) => item.id === topping.id ? { ...item, isArchived: false } : item),
      })));
      return { previousToppings, previousMenus };
    },
    onSuccess: () => {
      toast.success("トッピングを再び選べるようにしました");
    },
    onError: (error: any, _topping: any, context: any) => {
      if (context?.previousToppings) queryClient.setQueryData(toppingQueryKey, context.previousToppings);
      if (context?.previousMenus) queryClient.setQueryData(menuQueryKey, context.previousMenus);
      toast.error(error?.message || "トッピングを再開できませんでした");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["toppings", circleId] }),
        queryClient.invalidateQueries({ queryKey: ["menus", circleId] }),
      ]);
    },
  });

  const activeMenus = (menus ?? []).filter((menu) => !menu.isArchived);
  const archivedMenus = (menus ?? []).filter((menu) => menu.isArchived);
  const activeToppings = (toppings ?? []).filter((topping) => !topping.isArchived);
  const archivedToppings = (toppings ?? []).filter((topping) => topping.isArchived);

  // メニュー削除 (確認ダイアログの代わりに undo 付きトースト)
  const handleDeleteMenu = (menu: any) =>
    undoableDelete({
      queryClient,
      queryKey: menuQueryKey,
      id: menu.id,
      // 2026-10-21: 履歴は保持する操作のため、物理削除と誤解しない販売停止表記にする。
      message: `メニュー「${menu.name}」を販売停止にしました`,
      commit: () => menuApi.delete(menu.id),
    });

  // トッピング削除 (undo 付き)
  const handleDeleteTopping = (topping: any) =>
    undoableDelete({
      queryClient,
      queryKey: toppingQueryKey,
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

  // 2026-10-21: カテゴリ内で順番を入れ替え、来場者画面でも使う表示順として保存する。
  const moveMenu = async (category: string, index: number, offset: -1 | 1) => {
    if (!menus || isReorderingMenus) return;
    const categoryMenus = activeMenus.filter((menu) => (menu.category?.trim() || "未分類") === category);
    const target = index + offset;
    if (target < 0 || target >= categoryMenus.length) return;
    const reordered = [...categoryMenus];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    setIsReorderingMenus(true);
    const queryKey = menuQueryKey;
    await queryClient.cancelQueries({ queryKey });
    const previousMenus = queryClient.getQueryData<any[]>(queryKey);
    if (previousMenus) {
      const categoryPositions = previousMenus.flatMap((menu, position) =>
        !menu.isArchived && (menu.category?.trim() || "未分類") === category ? [position] : [],
      );
      const optimistic = [...previousMenus];
      reordered.forEach((menu, position) => {
        const cachePosition = categoryPositions[position];
        if (cachePosition !== undefined) optimistic[cachePosition] = { ...menu, sortOrder: position };
      });
      queryClient.setQueryData(queryKey, optimistic);
    }
    try {
      await Promise.all(reordered.map((menu, sortOrder) => menuApi.update(menu.id, { sortOrder })));
    } catch (error: any) {
      if (previousMenus) queryClient.setQueryData(queryKey, previousMenus);
      toast.error(error?.message || "順番を保存できませんでした");
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["menus", circleId] });
      setIsReorderingMenus(false);
    }
  };

  // 2026-10-16: 既存データも含めて連番へ正規化し、上下操作後に順番が安定して保存されるようにする。
  const moveTopping = async (index: number, offset: -1 | 1) => {
    if (!toppings || isReorderingToppings) return;
    const target = index + offset;
    if (target < 0 || target >= activeToppings.length) return;
    const reordered = [...activeToppings];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    setIsReorderingToppings(true);
    const queryKey = toppingQueryKey;
    await queryClient.cancelQueries({ queryKey });
    const previousToppings = queryClient.getQueryData<any[]>(queryKey);
    if (previousToppings) {
      const activePositions = previousToppings.flatMap((topping, position) => !topping.isArchived ? [position] : []);
      const optimistic = [...previousToppings];
      reordered.forEach((topping, position) => {
        const cachePosition = activePositions[position];
        if (cachePosition !== undefined) optimistic[cachePosition] = { ...topping, sortOrder: position };
      });
      queryClient.setQueryData(queryKey, optimistic);
    }
    try {
      await Promise.all(reordered.map((item, sortOrder) => toppingApi.update(item.id, { sortOrder })));
    } catch (error: any) {
      if (previousToppings) queryClient.setQueryData(queryKey, previousToppings);
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
        {(menusError && menus !== undefined) || (toppingsError && toppings !== undefined) ? (
          <p role="status" className="border-thick border-warning bg-warning/10 p-3 text-xs">最新のメニュー・トッピング情報を取得できません。前回取得した内容を表示しています。</p>
        ) : null}
        
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
          {menusError && menus === undefined ? (
            <ErrorState error={menusErrorObj} onRetry={() => refetchMenus()} />
          ) : activeMenus.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              message="メニューがまだありません"
              actionLabel="メニューを追加"
              onAction={handleOpenMenuAdd}
            />
          ) : (
            <div className="space-y-6">
              {/* 2026-10-16: メニューはカテゴリ単位の横幅を使う行表示にし、編集フォームへ設定を集約する。 */}
              {[...new Set(activeMenus.map((menu) => menu.category?.trim() || "未分類"))].sort((a, b) => a.localeCompare(b, "ja")).map((category) => (
                <section key={category} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b-thin border-border pb-2">
                    <h3 className="text-xs font-bold uppercase">{category}</h3>
                    <span className="text-[9px] font-bold text-muted-foreground">カテゴリ内の順番</span>
                  </div>
                  <div className="w-full border-y-thin border-border">
              {activeMenus.filter((menu) => (menu.category?.trim() || "未分類") === category).map((menu, index, categoryMenus) => (
                <div key={menu.id} className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 border-b-thin border-border py-2 last:border-b-0 sm:flex sm:gap-3 sm:py-3">
                  {menu.imagePath ? <img src={resolveAssetUrl(menu.imagePath)} alt="" className="h-12 w-14 shrink-0 border-thin border-border object-cover sm:h-16 sm:w-20" /> : <div className="flex h-12 w-14 shrink-0 items-center justify-center bg-muted text-[8px] uppercase sm:h-16 sm:w-20 sm:text-[9px]">No Image</div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><CardTitle className="break-words text-sm font-bold uppercase">{menu.name}</CardTitle><span className="text-sm font-black sm:text-base">¥{menu.price.toLocaleString()}</span>
                      {menu.soldOut && <span className="border-thin border-destructive bg-destructive/10 px-1 text-[10px] font-bold text-destructive">売り切れ</span>}
                      {menu.inventoryEnabled && <span className="text-[10px] text-muted-foreground">在庫 {menu.stockQuantity ?? 0}</span>}
                    </div>
                    {menu.description && <p className="mt-0.5 break-words text-[11px] leading-snug text-muted-foreground sm:mt-1 sm:text-xs">{menu.description}</p>}
                    {menu.toppings?.length ? <p className="mt-0.5 break-words text-[10px] leading-snug text-muted-foreground sm:mt-1">対応トッピング: {menu.toppings.map((t) => t.name).join("、")}</p> : null}
                  </div>
                  {/* 2026-10-21: 狭幅は情報を2列にまとめて操作群を1段に寄せ、各商品は罫線で分離する。 */}
                  <div className="col-span-full flex shrink-0 flex-wrap items-center gap-1.5 pt-1 sm:ml-auto sm:col-span-1 sm:gap-2 sm:pt-0">
                    <span className="mr-auto text-[9px] font-bold uppercase text-muted-foreground sm:mr-0">順番</span>
                    <Button type="button" variant="outline" size="icon" title="上へ移動" aria-label={`${menu.name}を上へ`} disabled={isReorderingMenus || index === 0} onClick={() => moveMenu(category, index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" variant="outline" size="icon" title="下へ移動" aria-label={`${menu.name}を下へ`} disabled={isReorderingMenus || index === categoryMenus.length - 1} onClick={() => moveMenu(category, index, 1)}><ArrowDown className="h-4 w-4" /></Button>
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

          {canRestoreArchived && archivedMenus.length > 0 && (
            <section aria-labelledby="archived-menu-heading" className="space-y-2 border-t-thin border-border pt-4">
              <h3 id="archived-menu-heading" className="text-xs font-bold uppercase">販売停止中 · {archivedMenus.length}件</h3>
              <div className="divide-y-thin divide-border border-y-thin border-border">
                {archivedMenus.map((menu) => (
                  <div key={menu.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold">{menu.name}</p>
                      <p className="text-[10px] text-muted-foreground">¥{menu.price.toLocaleString("ja-JP")} · {menu.category?.trim() || "未分類"}</p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => restoreMenu.mutate(menu)} disabled={restoreMenu.isPending}>
                      販売を再開
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>

        {/* トッピングセクション */}
        <section aria-labelledby="topping-management-heading" className="space-y-4 border-thick border-border p-4">
          {/* 2026-10-21: 小画面では追加ボタンを見出しの下へ移し、見出しと重ならない幅を確保する。 */}
          <div className="flex flex-col items-stretch gap-2 border-b-thick border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="topping-management-heading" className="text-sm font-bold uppercase tracking-wider">[トッピング管理]</h2>
            <Button
              onClick={handleOpenToppingAdd}
              className="w-full rounded-none border-thick border-primary bg-primary text-primary-foreground hover:bg-background hover:text-foreground h-8 text-[11px] font-bold uppercase px-3 flex items-center justify-center gap-1 sm:w-auto"
            >
              <Plus className="h-3.5 w-3.5" />
              トッピングを追加
            </Button>
          </div>

          {/* トッピング一覧 */}
          {toppingsError && toppings === undefined ? (
            <ErrorState error={toppingsErrorObj} onRetry={() => refetchToppings()} />
          ) : activeToppings.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              message="トッピングがまだありません"
              actionLabel="トッピングを追加"
              onAction={handleOpenToppingAdd}
            />
          ) : (
            <>
              {/* 2026-10-16: トッピング一覧は全幅の行と並び替え操作で現場の順序調整を可能にする。 */}
              <div className="w-full border-y-thin border-border">
              {activeToppings.map((topping, index) => (
                <div key={topping.id} className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 border-b-thin border-border py-2 last:border-b-0 sm:flex sm:gap-3 sm:py-3">
                  {topping.imagePath ? <img src={resolveAssetUrl(topping.imagePath)} alt="" className="h-12 w-14 shrink-0 border-thin border-border object-cover sm:h-14 sm:w-16" /> : <div className="flex h-12 w-14 shrink-0 items-center justify-center bg-muted text-[8px] uppercase sm:h-14 sm:w-16 sm:text-[9px]">No Image</div>}
                  <div className="min-w-0 flex-1"><p className="break-words text-sm font-bold uppercase">{topping.name}</p><p className="text-[10px] text-muted-foreground">{topping.category || "未分類"} · +¥{topping.price.toLocaleString()} · <span className={topping.soldOut ? "font-bold text-destructive" : "text-success"}>{topping.soldOut ? "売り切れ" : "販売中"}</span></p>{topping.description && <p className="mt-0.5 break-words text-[11px] leading-snug text-muted-foreground sm:mt-1 sm:text-xs">{topping.description}</p>}</div>
                  {/* 2026-10-16: 順序調整の意味をラベルで示し、販売操作と見分けやすくする。 */}
                  {/* 2026-10-21: 商品と同じ狭幅配置と区切り線で、一覧の密度を揃える。 */}
                  <div className="col-span-full flex shrink-0 flex-wrap items-center gap-1.5 pt-1 sm:ml-auto sm:col-span-1 sm:gap-2 sm:pt-0">
                    <span className="mr-auto text-[9px] font-bold uppercase text-muted-foreground sm:mr-0">順番</span>
                    <Button type="button" variant="outline" size="icon" title="上へ移動" aria-label={`${topping.name}を上へ`} disabled={isReorderingToppings || index === 0} onClick={() => moveTopping(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" variant="outline" size="icon" title="下へ移動" aria-label={`${topping.name}を下へ`} disabled={isReorderingToppings || index === activeToppings.length - 1} onClick={() => moveTopping(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    {/* 2026-10-21: 在庫数とは別に一時的な提供停止を行えるよう、在庫管理中も手動切替を表示する。 */}
                    <Button type="button" variant={topping.soldOut ? "destructive" : "outline"} size="sm" onClick={() => toggleToppingSoldOut.mutate(topping)} disabled={toggleToppingSoldOut.isPending}>{topping.soldOut ? "販売再開" : "売り切れ"}</Button>
                    <Button variant="outline" size="sm" onClick={() => handleOpenToppingEdit(topping)}><Edit className="mr-1 h-3 w-3" />編集</Button>
                  </div>
                </div>
              ))}
              </div>
            </>
          )}

          {canRestoreArchived && archivedToppings.length > 0 && (
            <section aria-labelledby="archived-topping-heading" className="space-y-2 border-t-thin border-border pt-4">
              <h3 id="archived-topping-heading" className="text-xs font-bold uppercase">使用停止中 · {archivedToppings.length}件</h3>
              <div className="divide-y-thin divide-border border-y-thin border-border">
                {archivedToppings.map((topping) => (
                  <div key={topping.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold">{topping.name}</p>
                      <p className="text-[10px] text-muted-foreground">{topping.category?.trim() || "未分類"} · ¥{topping.price.toLocaleString("ja-JP")}</p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => restoreTopping.mutate(topping)} disabled={restoreTopping.isPending}>
                      選択肢に戻す
                    </Button>
                  </div>
                ))}
              </div>
            </section>
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
