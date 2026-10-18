import { Ticket } from "lucide-react";
import type { Event } from "@/lib/api";
import { StampRallySettingsCard } from "@/components/event/StampRallySettingsCard";
import { StampRallyUsageDashboard } from "@/components/event/StampRallyUsageDashboard";

export function StampRallyTab({ eventId, event, onOpenStoreAreas }: { eventId: string; event: Event; onOpenStoreAreas: () => void }) {
  return (
    <div className="space-y-5 font-mono text-foreground">
      <header className="space-y-1 border-b-thick border-border pb-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <Ticket className="h-4 w-4" /> スタンプラリー
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          会場エリア、利用条件、景品交換場所を設定します。来場者はマイページの「スタンプラリー」から進み具合を確認できます。
        </p>
      </header>
      <StampRallySettingsCard eventId={eventId} event={event} onOpenStoreAreas={onOpenStoreAreas} />
      <StampRallyUsageDashboard eventId={eventId} />
    </div>
  );
}
