import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { PushNotificationControl } from "@/components/PushNotificationControl";
import { useVisitor } from "@/hooks/useVisitor";
import { visitorApi } from "@/lib/api";

export default function VisitorNotificationsPage() {
	const { userId } = useVisitor();
	const queryClient = useQueryClient();
	const notifications = useQuery({
		queryKey: ["visitorNotifications", userId],
		queryFn: () => visitorApi.notifications(userId!),
		enabled: Boolean(userId),
		networkMode: "always",
		retry: false,
	});
	const markRead = useMutation({
		mutationFn: (id: string) => visitorApi.markNotificationRead(userId!, id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["visitorNotifications", userId] }),
		onError: (error) => toast.error(error instanceof Error ? error.message : "既読にできませんでした"),
	});

	return (
		<main className="mx-auto w-full max-w-3xl min-w-0 space-y-5 px-3 py-5 sm:px-4">
			<header className="flex min-w-0 items-start gap-3 border-b-thick border-border pb-3">
				<Bell className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
				<div className="min-w-0 flex-1">
					<h1 className="text-lg font-black">通知</h1>
					<p className="mt-1 text-xs leading-relaxed text-muted-foreground">注文やイベントからのお知らせを確認できます。</p>
				</div>
			</header>

			<PushNotificationControl ownerType="visitor" />

			{notifications.isLoading ? (
				<div className="space-y-3">{[1, 2].map((item) => <Skeleton key={item} className="h-24" />)}</div>
			) : notifications.isError ? (
				<ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
			) : notifications.data?.length ? (
				<div className="space-y-3">
					{notifications.data.map((item) => {
						const href = item.href.startsWith("/") && !item.href.startsWith("//") ? item.href : "/visitor/notifications";
						return (
							<article key={item.id} className={`min-w-0 border-thick border-border p-3 ${item.readAt ? "bg-background" : "bg-primary/5"}`}>
								<div className="flex min-w-0 items-start justify-between gap-3">
									<div className="min-w-0 flex-1 space-y-1">
										<p className="break-words text-sm font-black">{item.title}</p>
										<p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{item.message}</p>
										<p className="text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString("ja-JP")}</p>
										<Link to={href} className="inline-flex min-h-10 items-center text-xs font-bold underline underline-offset-2">内容を確認</Link>
									</div>
									{!item.readAt && (
										<Button type="button" variant="outline" aria-label={`${item.title}を既読にする`} disabled={markRead.isPending} onClick={() => markRead.mutate(item.id)} className="min-h-10 shrink-0 gap-1 rounded-none border-thick border-border px-2 text-[10px]">
											<Check className="h-3.5 w-3.5" aria-hidden="true" />既読
										</Button>
									)}
								</div>
							</article>
						);
					})}
				</div>
			) : (
				<EmptyState icon={Bell} message="通知はありません" />
			)}
		</main>
	);
}
