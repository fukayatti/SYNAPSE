import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { circleApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { RefreshCw, Radio } from "lucide-react";
import { CongestionMonitor } from "./CongestionMonitor";

export function CongestionTab({ eventId }: { eventId: string }) {
  const [live, setLive] = useState(false);
  const {
    data: circles,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["circles", eventId],
    queryFn: () => circleApi.list(eventId),
    enabled: !!eventId,
    refetchInterval: live ? 15_000 : 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setLive((value) => !value)}
          aria-pressed={live}
          className={`flex min-h-10 items-center gap-1.5 border-thick px-3 font-mono text-[11px] uppercase transition-colors ${
            live ? "border-accent bg-accent text-accent-foreground" : "border-border hover:bg-muted"
          }`}
          title="ONで15秒ごとに自動更新"
        >
          <Radio className={`h-3.5 w-3.5 ${live ? "animate-pulse" : ""}`} /> LIVE {live ? "ON" : "OFF"}
        </button>
        <Button
          type="button"
          variant="outline"
          onClick={() => { void refetch(); }}
          disabled={isFetching}
          className="min-h-10 border-thick"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> 更新
        </Button>
      </div>
      <CongestionMonitor
        circles={circles}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => { void refetch(); }}
      />
    </div>
  );
}
