import { useMemo } from 'react';
import { buildFindings } from '../calculations/findings';
import { incomeByYear, summarizeIrmaa } from '../calculations/irmaa';
import { runComparison } from '../calculations/projection';
import { summarize } from '../calculations/summary';
import { compareTaxes, validateAnalysis } from '../calculations/taxComparison';
import type { Scenario } from '../types';

/** Runs the baseline and strategy projections, and the analyses built on them, whenever the scenario changes. */
export function useProjection(scenario: Scenario) {
  return useMemo(() => {
    const { baseline, strategy } = runComparison(scenario);
    const baselineSummary = summarize(baseline);
    const strategySummary = summarize(strategy);
    const analysisErrors = validateAnalysis(scenario.analysis);
    const analysisOk = analysisErrors.length === 0 && strategy.ok && baseline.ok;
    const lastYear = strategy.years[strategy.years.length - 1]?.year ?? scenario.startYear;
    const baselineIncome = analysisOk ? incomeByYear(baseline, scenario) : [];
    const strategyIncome = analysisOk ? incomeByYear(strategy, scenario) : [];
    const baselineIrmaa = analysisOk ? summarizeIrmaa(baselineIncome, lastYear) : null;
    const strategyIrmaa = analysisOk ? summarizeIrmaa(strategyIncome, lastYear) : null;
    const tax = analysisOk ? compareTaxes(baseline, strategy, scenario) : null;
    const findings = strategy.ok
      ? buildFindings({ scenario, baseline, strategy, baselineSummary, strategySummary, tax, baselineIrmaa, strategyIrmaa })
      : [];
    return {
      baseline,
      strategy,
      baselineSummary,
      strategySummary,
      analysisErrors,
      baselineIncome,
      strategyIncome,
      baselineIrmaa,
      strategyIrmaa,
      tax,
      findings,
    };
  }, [scenario]);
}
