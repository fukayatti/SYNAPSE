import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * 2026-10-21: カタログ編集は保存応答を待つ間も作業中の一覧を更新し、失敗時に
 * 直前のキャッシュへ戻す。クエリキーの前方一致で管理画面とフォーム内キャッシュを揃える。
 */
export async function updateCachedLists<T extends { id: string }>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  update: (current: T[]) => T[],
) {
  await queryClient.cancelQueries({ queryKey });
  const snapshots = queryClient.getQueriesData<T[]>({ queryKey });
  queryClient.setQueriesData<T[]>({ queryKey }, (current) => current ? update(current) : current);
  const optimisticSnapshots = queryClient.getQueriesData<T[]>({ queryKey });

  return {
    rollback: () => {
      for (const [key, previous] of snapshots) {
        if (previous === undefined) continue;
        const optimistic = optimisticSnapshots.find(([optimisticKey]) => optimisticKey === key)?.[1];
        const current = queryClient.getQueryData<T[]>(key);
        if (!optimistic || !current) continue;
        const previousById = new Map(previous.map((item) => [item.id, item]));
        const optimisticById = new Map(optimistic.map((item) => [item.id, item]));
        // 2026-10-21: 保存中に別の変更が重なった場合、後から入った表示を古い失敗で巻き戻さない。
        const restored = current.flatMap((item) => {
          const optimisticItem = optimisticById.get(item.id);
          if (!optimisticItem || JSON.stringify(item) !== JSON.stringify(optimisticItem)) return [item];
          const previousItem = previousById.get(item.id);
          return previousItem ? [previousItem] : [];
        });
        queryClient.setQueryData(key, restored);
      }
    },
    commit: (replace: (current: T[]) => T[]) => {
      queryClient.setQueriesData<T[]>({ queryKey }, (current) => current ? replace(current) : current);
    },
  };
}
