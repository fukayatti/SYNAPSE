import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Film, FolderOpen, Image as ImageIcon, MonitorPlay, Save, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useUnsavedChanges } from "@/components/UnsavedNavigationGuard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useCircleAuth";
import { circleApi, parseCircleSettings, type OrderNumberDisplayMedia, type OrderNumberDisplaySettings } from "@/lib/api";
import { deleteLocalDisplayMedia, estimateAvailableLocalStorageBytes, saveLocalDisplayMedia } from "@/lib/local-display-media";
import { toast } from "sonner";

const DEFAULT_SETTINGS: OrderNumberDisplaySettings = {
  showPreparingNumbers: true,
  showPickupNumbers: true,
  overflowPriority: "latest",
  mediaPercent: 35,
  media: [],
};

const copySettings = (value: OrderNumberDisplaySettings): OrderNumberDisplaySettings => ({
  ...value,
  media: value.media.map((item) => ({ ...item })),
});

function OrderDisplayContent() {
  const { circleId: authCircleId, checkPermission } = useAuth();
  const circleId = authCircleId ?? "";
  const queryClient = useQueryClient();
  const { data: circle, isLoading, isError, refetch } = useQuery({
    queryKey: ["circle", circleId],
    queryFn: () => circleApi.get(circleId),
    enabled: !!circleId,
  });
  const saved = useMemo(() => parseCircleSettings(circle?.settings).orderNumberDisplay, [circle?.settings]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [snapshot, setSnapshot] = useState(DEFAULT_SETTINGS);
  const [storingMedia, setStoringMedia] = useState(false);

  useEffect(() => {
    if (!circle) return;
    const next = copySettings(saved);
    setSettings(next);
    setSnapshot(next);
  }, [circle?.id, circle?.settings, saved]);

  const isDirty = JSON.stringify(settings) !== JSON.stringify(snapshot);
  const saveMutation = useMutation({
    mutationFn: async (next: OrderNumberDisplaySettings) => {
      if (!next.showPreparingNumbers && !next.showPickupNumbers) throw new Error("表示する番号を1つ以上選んでください");
      await circleApi.updateSettings(circleId, { orderNumberDisplay: next });
    },
    onSuccess: async (_result, next) => {
      const copy = copySettings(next);
      setSettings(copy);
      setSnapshot(copy);
      await queryClient.invalidateQueries({ queryKey: ["circle", circleId] });
      toast.success("番号表示を保存しました");
    },
    onError: (error: any) => toast.error(error.message || "番号表示を保存できませんでした"),
  });
  useUnsavedChanges({
    isDirty,
    onSave: async () => { await saveMutation.mutateAsync(settings); },
    onDiscard: () => setSettings(copySettings(snapshot)),
  });

  const addMedia = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!files.length) return;
    const accepted = files.filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const video = ["mp4", "webm", "mov"].includes(ext);
      const image = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
      if (!video && !image) { toast.error(file.name + ": 対応形式の画像・動画を選んでください"); return false; }
      // 2026-10-21: ファイルは端末内にだけ保存するため、小さな通信向け容量制限を置かず100GBを上限とする。
      if (file.size > 100 * 1024 * 1024 * 1024) {
        toast.error(file.name + ": 1ファイル100GB以下にしてください");
        return false;
      }
      return true;
    });
    if (!accepted.length) return;
    if (settings.media.length + accepted.length > 20) {
      toast.error("登録できるメディアは20件までです");
      return;
    }
    setStoringMedia(true);
    const added: OrderNumberDisplayMedia[] = [];
    try {
      let availableBytes = await estimateAvailableLocalStorageBytes();
      for (const file of accepted) {
        if (availableBytes !== null && file.size > availableBytes) {
          throw new Error(`${file.name}: この端末のブラウザーに空き容量が足りません。保存済みメディアを削除するか、小さいファイルを選んでください`);
        }
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const id = crypto.randomUUID();
        await saveLocalDisplayMedia(id, file);
        if (availableBytes !== null) availableBytes = Math.max(0, availableBytes - file.size);
        added.push({
          id,
          name: file.name,
          kind: file.type.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext) ? "video" : "image",
          durationSeconds: 8,
        });
      }
      setSettings((current) => ({ ...current, media: [...current.media, ...added] }));
      toast.success(added.length + "件をこの端末に保存しました。最後に設定を保存してください。");
    } catch (error: any) {
      await Promise.allSettled(added.map((item) => deleteLocalDisplayMedia(item.id)));
      toast.error(error.message || "端末内にメディアを保存できませんでした");
    } finally {
      setStoringMedia(false);
    }
  };

  const removeMedia = async (id: string) => {
    try {
      await deleteLocalDisplayMedia(id);
      setSettings((current) => ({ ...current, media: current.media.filter((item) => item.id !== id) }));
    } catch (error: any) {
      toast.error(error.message || "端末内メディアを削除できませんでした");
    }
  };

  const moveMedia = (index: number, delta: -1 | 1) => setSettings((current) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= current.media.length) return current;
    const media = [...current.media];
    [media[index], media[nextIndex]] = [media[nextIndex]!, media[index]!];
    return { ...current, media };
  });
  const canWrite = checkPermission("circle:write");

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !circle) return <div className="space-y-3"><p role="alert">番号表示設定を読み込めませんでした。</p><Button variant="outline" onClick={() => void refetch()}>再読み込み</Button></div>;

  return (
    <DashboardLayout title="番号表示" subtitle="厨房・プロジェクターに表示する番号とメディアを設定" type="circle" actions={
      <Button onClick={() => saveMutation.mutate(settings)} disabled={!isDirty || saveMutation.isPending || !canWrite} className="min-h-11 border-thick border-border font-mono">
        <Save className="mr-2 h-4 w-4" />{saveMutation.isPending ? "保存中…" : "設定を保存"}
      </Button>
    }>
      {!canWrite ? <p role="alert" className="border-thick border-warning bg-warning/10 p-4 text-sm">番号表示設定を変更する権限がありません。</p> : (
        <div className="space-y-6 font-mono">
          <Card className="rounded-none border-thick border-border shadow-none">
            <CardHeader className="border-b-thick border-border">
              <CardTitle className="flex items-center gap-2 text-sm font-black"><MonitorPlay className="h-4 w-4" />表示する番号</CardTitle>
              <CardDescription className="text-xs">完成して受け渡していない注文は「受け取り待ち」に表示します。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
              <label className="flex min-h-14 cursor-pointer items-start gap-3 border-thick border-border p-3">
                <Checkbox checked={settings.showPreparingNumbers} onCheckedChange={(checked) => setSettings((s) => ({ ...s, showPreparingNumbers: checked === true }))} className="mt-0.5" />
                <span><b className="block text-xs">作成中</b><small className="text-muted-foreground">受付・調理中の番号</small></span>
              </label>
              <label className="flex min-h-14 cursor-pointer items-start gap-3 border-thick border-border p-3">
                <Checkbox checked={settings.showPickupNumbers} onCheckedChange={(checked) => setSettings((s) => ({ ...s, showPickupNumbers: checked === true }))} className="mt-0.5" />
                <span><b className="block text-xs">受け取り待ち</b><small className="text-muted-foreground">完成して、まだ渡していない番号</small></span>
              </label>
              {!settings.showPreparingNumbers && !settings.showPickupNumbers && <p className="text-xs text-destructive sm:col-span-2">表示する番号を1つ以上選んでください。</p>}
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="text-xs font-black">画面に入りきらないときの優先順</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["latest", "oldest"] as const).map((priority) => (
                    <label key={priority} className="flex min-h-11 cursor-pointer items-center gap-2 border-thick border-border px-3 text-xs font-bold">
                      <input type="radio" name="overflowPriority" checked={settings.overflowPriority === priority} onChange={() => setSettings((s) => ({ ...s, overflowPriority: priority }))} />
                      {priority === "latest" ? "最新の番号を優先" : "古い番号を優先"}
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">選んだ順で並び、先に見える位置へ表示します。残りの番号もスクロールして確認できます。</p>
              </fieldset>
            </CardContent>
          </Card>

          <Card className="rounded-none border-thick border-border shadow-none">
            <CardHeader className="flex flex-col gap-3 border-b-thick border-border sm:flex-row sm:items-center sm:justify-between">
              <div><CardTitle className="flex items-center gap-2 text-sm font-black"><Film className="h-4 w-4" />表示メディア</CardTitle><CardDescription className="mt-1 text-xs">番号表示画面で、選んだメディアを順番に繰り返し再生します。</CardDescription></div>
              <label className="inline-flex min-h-11 cursor-pointer items-center justify-center border-thick border-border bg-primary px-4 text-xs font-black text-primary-foreground hover:bg-background hover:text-foreground">
                <FolderOpen className="mr-2 h-4 w-4" />{storingMedia ? "端末に追加中…" : "画像・動画を選ぶ"}
                <input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime" className="sr-only" disabled={storingMedia || settings.media.length >= 20} onChange={(event) => void addMedia(event)} />
              </label>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <p className="text-[10px] text-muted-foreground">ファイルはこの端末のブラウザー内に保存し、サーバーへ送信しません。再生する端末ごとに選択してください。1ファイル最大100GBですが、実際に保存できる量はOSとブラウザーがこの端末に割り当てた空き容量までです。画像は2〜60秒、動画は再生終了後に次へ進みます。JPG、PNG、GIF、WebP、MP4、WebM、MOV。</p>
              <fieldset className="space-y-2 border-thin border-border p-3" disabled={settings.media.length === 0}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <legend className="text-xs font-black">番号とメディアの表示比率</legend>
                  <span className="text-[10px] font-bold tabular-nums">番号 {100 - settings.mediaPercent}% · メディア {settings.mediaPercent}%</span>
                </div>
                <label htmlFor="order-display-media-percent" className="sr-only">メディアに使う画面の割合</label>
                <input
                  id="order-display-media-percent"
                  type="range"
                  min={20}
                  max={80}
                  step={5}
                  value={settings.mediaPercent}
                  onChange={(event) => setSettings((current) => ({ ...current, mediaPercent: Number(event.target.value) }))}
                  className="w-full accent-primary disabled:opacity-50"
                  aria-valuetext={`メディア${settings.mediaPercent}パーセント、番号${100 - settings.mediaPercent}パーセント`}
                />
                <p className="text-[10px] leading-snug text-muted-foreground">表示端末とメディアの縦横比を比べ、横並びまたは上下に自動調整します。メディア未登録時は追加後に調整できます。</p>
              </fieldset>
              {settings.media.length === 0 ? (
                <div className="flex min-h-36 flex-col items-center justify-center gap-2 border-thick border-dashed border-border p-4 text-center text-xs text-muted-foreground"><ImageIcon className="h-6 w-6" />表示する画像・動画はまだありません</div>
              ) : (
                <ol className="space-y-2">
                  {settings.media.map((item, index) => (
                    <li key={item.id} className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 border-thin border-border p-2">
                      <span className="flex h-10 w-10 items-center justify-center border-thin border-border bg-muted text-[10px] font-black">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <p className="break-all text-xs font-bold">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">{item.kind === "video" ? "動画 · 最後まで再生" : "画像"}</p>
                        {item.kind === "image" && <label className="mt-1 flex items-center gap-2 text-[10px]">表示秒数 <Input type="number" inputMode="numeric" min={2} max={60} value={item.durationSeconds} onChange={(event) => setSettings((s) => ({ ...s, media: s.media.map((entry) => entry.id === item.id ? { ...entry, durationSeconds: Math.max(2, Math.min(60, Number(event.target.value) || 2)) } : entry) }))} className="h-8 w-20 border-thin border-border" />秒</label>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="icon" aria-label="上へ移動" disabled={index === 0} onClick={() => moveMedia(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                        <Button type="button" variant="outline" size="icon" aria-label="下へ移動" disabled={index === settings.media.length - 1} onClick={() => moveMedia(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                        <Button type="button" variant="destructive" size="icon" aria-label="表示メディアから削除" onClick={() => void removeMedia(item.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function OrderDisplaySettingsPage() {
  return <OrderDisplayContent />;
}
