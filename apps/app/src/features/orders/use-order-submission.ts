import { useEffect, useState } from "react";
import type { CreateOrderInput } from "@fesflow/config/order-contract";
import { orderApi } from "@/lib/api";
import { createOrderSubmission, orderFingerprint } from "./submission";

// 2026-10-03: カート・来場者・サークル・支払方法の変更は別の会計として扱う。
// 2026-10-17: 同じ再送制御を使いながら、注文元に応じたAPI経路を呼び分ける。
export function useOrderSubmission(
  input: CreateOrderInput | null,
  send: typeof orderApi.create = orderApi.create,
) {
  const [submission] = useState(() => createOrderSubmission(send));
  const fingerprint = input ? orderFingerprint(input) : null;
  useEffect(() => submission.observeDraft(fingerprint), [submission, fingerprint]);
  return submission.submit;
}
