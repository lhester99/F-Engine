import type { ReturnAssumption } from '../types';

/** Annual return implied by the assumption: a single rate, or a stock/bond weighted average. */
export function effectiveAnnualReturn(assumption: ReturnAssumption): number {
  if (assumption.mode === 'single') return assumption.annualReturn;
  const { stockWeight, stockReturn, bondReturn } = assumption;
  return stockWeight * stockReturn + (1 - stockWeight) * bondReturn;
}
