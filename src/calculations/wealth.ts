import type { ProjectionResult, YearTotals } from '../types';

export interface WealthPoint {
  year: number;
  age: number;
  baseline: number;
  strategy: number;
}

export interface WealthComparison {
  points: WealthPoint[];
  endBaseline: number;
  endStrategy: number;
  /**
   * First age from which the strategy's after-tax value is at least the
   * baseline's in every remaining year. Null if that never happens.
   */
  breakevenAge: number | null;
  breakevenYear: number | null;
  /** True when the strategy is behind at some point before the breakeven (so the breakeven is a crossing). */
  crossesOver: boolean;
  /** True when the two paths are the same every year (no strategy entered). */
  identical: boolean;
}

/**
 * Compares after-tax value (Roth + taxable account + cash + pre-tax balance
 * after the heirs' tax rate) year by year.
 */
export function compareWealth(
  baseline: ProjectionResult,
  strategy: ProjectionResult,
  /**
   * Heirs' rates to value pre-tax money at, per path. When omitted, each year's
   * afterTaxValue (at the entered heirs' rate) is used. When heirs' tax is
   * estimated from their income, each path passes its own average rate, since a
   * larger inherited IRA is taxed at higher brackets.
   */
  rates?: { baseline: number; strategy: number },
): WealthComparison {
  const value = (t: YearTotals | undefined, rate: number | undefined) =>
    !t ? 0 : rate === undefined ? t.afterTaxValue : t.endBalanceRoth + t.endBalanceTaxable + t.endBalanceCash + t.endBalancePretax * (1 - rate);
  const points: WealthPoint[] = strategy.years.map((s, i) => ({
    year: s.year,
    age: s.age,
    baseline: value(baseline.years[i]?.totals, rates?.baseline),
    strategy: value(s.totals, rates?.strategy),
  }));
  let breakevenIdx: number | null = null;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i]!.strategy + 0.5 >= points[i]!.baseline) breakevenIdx = i;
    else break;
  }
  const last = points[points.length - 1];
  const be = breakevenIdx === null ? null : points[breakevenIdx]!;
  return {
    points,
    endBaseline: last?.baseline ?? 0,
    endStrategy: last?.strategy ?? 0,
    breakevenAge: be?.age ?? null,
    breakevenYear: be?.year ?? null,
    crossesOver: breakevenIdx !== null && breakevenIdx > 0,
    identical: points.every((p) => Math.abs(p.strategy - p.baseline) < 0.5),
  };
}
