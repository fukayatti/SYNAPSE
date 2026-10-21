// 2026-10-21: DBでは日付・サークル込みの一意番号を保ち、店頭ではサークル内の連番だけを見せる。
export function displayOrderNumber(orderNumber: string): string {
  const sequence = orderNumber.split("-").pop();
  return sequence && /^\d+$/.test(sequence) ? sequence : orderNumber;
}
