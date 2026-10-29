import type { ProjectionResult, Scenario } from '../types';
import type { TaxComparison } from './taxComparison';
import type { WealthComparison } from './wealth';

/** One side (no strategy or strategy) of a stacked before/after bar. */
export interface ImpactBar {
  pretax: number;
  roth: number;
  /** Taxable account + cash. */
  outside: number;
  total: number;
}

export interface ImpactPair {
  baseline: ImpactBar;
  strategy: ImpactBar;
}

export interface Impact {
  /** Last projection year and the client's age then. */
  endYear: number;
  endAge: number;
  /** Dividing by this converts end-of-projection dollars to today's dollars. */
  inflationFactor: number;
  /** Account balances on December 31 of the last year (pre-tax still owes tax). */
  mix: ImpactPair;
  /** After-tax value at the end: pre-tax counted after the heirs' rate (entered, or each path's average). */
  afterTax: ImpactPair;
  /** What heirs keep, present value: pre-tax after heirs' tax, Roth after its growth, taxable and cash. */
  heirs: ImpactPair;
}

const bar = (pretax: number, roth: number, outside: number): ImpactBar => ({ pretax, roth, outside, total: pretax + roth + outside });

/**
 * Before/after figures for the impact charts, from results already computed
 * elsewhere (no new modeling). Totals match the Wealth tab (after-tax value at
 * the end) and the Heirs tab (what heirs keep, present value).
 */
export function computeImpact(
  baseline: ProjectionResult,
  strategy: ProjectionResult,
  tax: TaxComparison,
  wealth: WealthComparison,
  scenario: Scenario,
): Impact | null {
  const b = baseline.years[baseline.years.length - 1];
  const s = strategy.years[strategy.years.length - 1];
  if (!b || !s) return null;
  const mixOf = (t: typeof b.totals) => bar(t.endBalancePretax, t.endBalanceRoth, t.endBalanceTaxable + t.endBalanceCash);
  // After-tax value = Roth + outside + pre-tax after heirs' tax; the pre-tax part is the remainder of the
  // Wealth tab's total, so the two always agree.
  const afterTaxOf = (t: typeof b.totals, total: number) => {
    const outside = t.endBalanceTaxable + t.endBalanceCash;
    return bar(total - t.endBalanceRoth - outside, t.endBalanceRoth, outside);
  };
  const heirsOf = (l: TaxComparison['baseline']['legacy']) => {
    const pretax = l.withdrawalsPv - l.heirsTaxPv;
    return bar(pretax, l.rothAtWithdrawalPv, l.netToHeirsPv - pretax - l.rothAtWithdrawalPv);
  };
  return {
    endYear: s.year,
    endAge: s.age,
    // Balances are as of December 31 of the last year: (last − start + 1) years of inflation.
    inflationFactor: Math.pow(1 + scenario.analysis.inflationRate, s.year - scenario.startYear + 1),
    mix: { baseline: mixOf(b.totals), strategy: mixOf(s.totals) },
    afterTax: { baseline: afterTaxOf(b.totals, wealth.endBaseline), strategy: afterTaxOf(s.totals, wealth.endStrategy) },
    heirs: { baseline: heirsOf(tax.baseline.legacy), strategy: heirsOf(tax.strategy.legacy) },
  };
}

/** Converts a bar to today's dollars. */
export function inTodaysDollars(b: ImpactBar, factor: number): ImpactBar {
  return bar(b.pretax / factor, b.roth / factor, b.outside / factor);
}
