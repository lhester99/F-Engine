import type { ProjectionResult, ReturnAssumption, Scenario, Strategy } from '../types';
import { incomeByYear, summarizeIrmaa, type IrmaaSummary } from './irmaa';
import { runComparison } from './projection';
import { summarize, type ProjectionSummary } from './summary';
import { compareTaxes, type TaxComparison, type TaxTotals } from './taxComparison';
import { compareWealth, type WealthComparison } from './wealth';

/** A saved set of planning levers. Client inputs always come from the current scenario. */
export interface SavedStrategy {
  id: string;
  /** Advisor-chosen label, e.g. "Convert $100K to 75". Kept in memory only. */
  name: string;
  strategy: Strategy;
  returns: ReturnAssumption;
}

export interface ScenarioMetrics {
  summary: ProjectionSummary;
  irmaa: IrmaaSummary;
  /** Estimated tax totals for this column. */
  taxTotals: TaxTotals;
  /** Comparison against no strategy; null for the baseline column. */
  tax: TaxComparison | null;
  /** After-tax value at the end of the projection. */
  afterTaxEnd: number;
  /** After-tax value comparison against no strategy; null for the baseline column. */
  wealth: WealthComparison | null;
}

export interface ComparisonColumn {
  id: string;
  name: string;
  metrics: ScenarioMetrics;
}

export function lastYearOf(r: ProjectionResult): number {
  return r.years[r.years.length - 1]?.year ?? 0;
}

/** Runs the scenario with the given levers and returns the metrics for one comparison column. */
export function metricsForStrategy(
  base: Scenario,
  levers: Pick<SavedStrategy, 'strategy' | 'returns'>,
): { baseline: ScenarioMetrics; strategy: ScenarioMetrics } | null {
  const scenario: Scenario = { ...base, strategy: levers.strategy, returns: levers.returns };
  const { baseline, strategy } = runComparison(scenario);
  if (!baseline.ok || !strategy.ok) return null;
  const last = lastYearOf(strategy);
  const tax = compareTaxes(baseline, strategy, scenario);
  const wealth = compareWealth(baseline, strategy);
  return {
    baseline: {
      summary: summarize(baseline),
      irmaa: summarizeIrmaa(incomeByYear(baseline, scenario), last),
      taxTotals: tax.baseline,
      tax: null,
      afterTaxEnd: wealth.endBaseline,
      wealth: null,
    },
    strategy: {
      summary: summarize(strategy),
      irmaa: summarizeIrmaa(incomeByYear(strategy, scenario), last),
      taxTotals: tax.strategy,
      tax,
      afterTaxEnd: wealth.endStrategy,
      wealth,
    },
  };
}
