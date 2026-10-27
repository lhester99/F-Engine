/**
 * Splits `amount` across accounts in proportion to their available balances,
 * never taking more than an account holds. Returns per-account amounts in the
 * same order as `available`. The total equals min(amount, sum(available)).
 */
export function allocateProRata(amount: number, available: readonly number[]): number[] {
  const total = available.reduce((s, v) => s + Math.max(0, v), 0);
  if (amount <= 0 || total <= 0) return available.map(() => 0);
  if (amount >= total) return available.map((v) => Math.max(0, v));
  return available.map((v) => (Math.max(0, v) / total) * amount);
}
