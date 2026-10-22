import type { WorkerEnv } from "@fesflow/db";

type D1 = WorkerEnv["DB"];

/**
 * 2026-10-03: status変更を期待する旧状態で条件更新し、スタンプ付与も同じD1 batchにまとめる。
 * 旧状態の読取後に別リクエストが先行した場合は上書きせず、D1呼出しを1往復に保つ。
 */
export async function updateOrderStatus(
  db: D1,
  input: {
    orderId: string;
    expectedStatus: string;
    nextStatus: string;
    expectedPaymentStatus?: "paid" | "unpaid";
    refund?: { id: string; refundedBy: string | null; refundedAt: number };
    stamp?: { id: string; userId: string; circleId: string };
  },
): Promise<boolean> {
  const now = Date.now();
  const statements = input.refund
    ? [
        db.prepare(`UPDATE orders SET status=?, payment_status='refunded', updated_at=?
          WHERE id=? AND status=? AND payment_status='paid'`)
          .bind(input.nextStatus, now, input.orderId, input.expectedStatus),
        // 2026-10-22: 返金額と元の決済方法はDB注文から読み、取消更新と同じbatch内で一度だけ記録する。
        db.prepare(`INSERT INTO order_refund
          (id, order_id, amount, original_payment_method, refunded_by, refunded_at)
          SELECT ?, id, total_price, payment_method, ?, ? FROM orders
          WHERE id=? AND status='cancelled' AND payment_status='refunded' AND changes()=1`)
          .bind(input.refund.id, input.refund.refundedBy, input.refund.refundedAt, input.orderId),
      ]
    : [
        db.prepare(input.expectedPaymentStatus
          ? "UPDATE orders SET status=?, updated_at=? WHERE id=? AND status=? AND payment_status=?"
          : "UPDATE orders SET status=?, updated_at=? WHERE id=? AND status=?")
          .bind(...(input.expectedPaymentStatus
            ? [input.nextStatus, now, input.orderId, input.expectedStatus, input.expectedPaymentStatus]
            : [input.nextStatus, now, input.orderId, input.expectedStatus])),
      ];

  if (input.stamp) {
    statements.push(
      // 2026-10-22: 注文登録ではなく実会計を基準にするため、未会計モバイル注文にはスタンプを付けない。
      db.prepare(`INSERT INTO user_stamp (id,user_id,circle_id)
        SELECT ?,?,? WHERE changes()=1
          AND EXISTS (SELECT 1 FROM orders WHERE id=? AND payment_status='paid')
        ON CONFLICT(user_id,circle_id) DO NOTHING`)
        .bind(input.stamp.id, input.stamp.userId, input.stamp.circleId, input.orderId),
    );
  }

  const results = await db.batch(statements);
  return results[0]?.meta.changes === 1;
}
