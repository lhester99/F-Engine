import { useMemo } from 'react';
import { runComparison } from '../calculations/projection';
import { summarize } from '../calculations/summary';
import type { Scenario } from '../types';

/** Runs the baseline and strategy projections whenever the scenario changes. */
export function useProjection(scenario: Scenario) {
  return useMemo(() => {
    const { baseline, strategy } = runComparison(scenario);
    return { baseline, strategy, baselineSummary: summarize(baseline), strategySummary: summarize(strategy) };
  }, [scenario]);
}
