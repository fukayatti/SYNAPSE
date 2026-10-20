import type { RegisterDisplaySnapshot } from "@fesflow/config/register-display-contract";

export const REGISTER_DISPLAY_CHANNEL = "fesflow-register-display-v1";

let registerDisplayChannel: BroadcastChannel | null = null;

// 2026-10-21: 同一端末はBroadcastChannelで即時更新し、別端末は期限付きAPI共有へフォールバックする。
export function publishRegisterDisplaySnapshot(sessionId: string, snapshot: RegisterDisplaySnapshot, revision: number) {
  if (typeof BroadcastChannel === "undefined") return;
  registerDisplayChannel ??= new BroadcastChannel(REGISTER_DISPLAY_CHANNEL);
  registerDisplayChannel.postMessage({ sessionId, snapshot, revision, sentAt: Date.now() });
}
