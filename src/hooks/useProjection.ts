import { useMemo } from 'react';
import { buildFindings } from '../calculations/findings';
import { incomeByYear, summarizeIrmaa } from '../calculations/irmaa';
import { runComparison } from '../calculations/projection';
import { summarize } from '../calculations/summary';
import { compareTaxes } from '../calculations/taxComparison';
import { compareWealth } from '../calculations/wealth';
import type { Scenario } from '../types';

/** Runs the baseline and strategy projections, and the tax analyses built on them, whenever the scenario changes. */
export function useProjection(scenario: Scenario) {
  return useMemo(() => {
    const { baseline, strategy } = runComparison(scenario);
    const baselineSummary = summarize(baseline);
    const strategySummary = summarize(strategy);
    const ok = strategy.ok && baseline.ok;
    const lastYear = strategy.years[strategy.years.length - 1]?.year ?? scenario.startYear;
    const baselineIncome = ok ? incomeByYear(baseline, scenario) : [];
    const strategyIncome = ok ? incomeByYear(strategy, scenario) : [];
    const baselineIrmaa = ok ? summarizeIrmaa(baselineIncome, lastYear) : null;
    const strategyIrmaa = ok ? summarizeIrmaa(strategyIncome, lastYear) : null;
    const tax = ok ? compareTaxes(baseline, strategy, scenario) : null;
    const wealth = ok ? compareWealth(baseline, strategy) : null;
    const findings = ok
      ? buildFindings({
          scenario,
          baseline,
          strategy,
          baselineSummary,
          strategySummary,
          tax,
          baselineIrmaa,
          strategyIrmaa,
          baselineIncome,
          strategyIncome,
          wealth,
        })
      : [];
    return {
      baseline,
      strategy,
      baselineSummary,
      strategySummary,
      baselineIncome,
      strategyIncome,
      baselineIrmaa,
      strategyIrmaa,
      tax,
      wealth,
      findings,
    };
  }, [scenario]);
}
