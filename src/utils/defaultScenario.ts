import { DEFAULT_QCD_LIMIT_SETTINGS } from '../data/qcdLimits';
import { emptyStrategy } from '../strategies/schedule';
import type { Scenario } from '../types';

export const PRIMARY_ID = 'client';

/**
 * Hypothetical starting scenario. Contains no client-identifying information.
 * The projection starts in the current calendar year, using balances as of
 * December 31 of the prior year.
 */
export function defaultScenario(startYear = new Date().getFullYear()): Scenario {
  return {
    startYear,
    people: [{ id: PRIMARY_ID, label: 'Client', dateOfBirth: '1956-06-15', delayFirstRmd: false }],
    accounts: [
      { id: 'trad-1', ownerId: PRIMARY_ID, type: 'traditional_ira', label: 'Traditional IRA 1', priorYearEndBalance: 1_400_000 },
      { id: 'trad-2', ownerId: PRIMARY_ID, type: 'traditional_ira', label: 'Traditional IRA 2', priorYearEndBalance: 350_000 },
      {
        id: 'roth-1',
        ownerId: PRIMARY_ID,
        type: 'roth_ira',
        label: 'Roth IRA',
        priorYearEndBalance: 150_000,
        contribution: { annualAmount: 0, throughAge: 75 },
      },
    ],
    endAge: 95,
    returns: { mode: 'single', annualReturn: 0.06 },
    extraWithdrawals: [{ personId: PRIMARY_ID, annualAmount: 0, startAge: 70, endAge: 95 }],
    qcdLimits: DEFAULT_QCD_LIMIT_SETTINGS,
    strategy: emptyStrategy(),
  };
}
