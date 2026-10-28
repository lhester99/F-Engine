import { DEFAULT_QCD_LIMIT_SETTINGS } from '../data/qcdLimits';
import { emptyStrategy } from '../strategies/schedule';
import type { AnalysisSettings, Scenario } from '../types';

export const PRIMARY_ID = 'client';

/**
 * Default tax and IRMAA assumptions. Both tax rates start equal so the
 * comparison begins neutral; the advisor sets them for the client.
 */
export const DEFAULT_ANALYSIS: AnalysisSettings = {
  filingStatus: 'single',
  medicareEnrollees: 1,
  otherIncome: 60_000,
  inflationRate: 0.025,
  addedIncomeTaxRate: 0.24,
  avoidedIncomeTaxRate: 0.24,
  discountRate: 0.04,
  discountMatchesReturn: true,
};

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
      {
        id: 'trad-1',
        ownerId: PRIMARY_ID,
        type: 'traditional_ira',
        label: 'Traditional IRA 1',
        priorYearEndBalance: 1_400_000,
        contribution: { annualAmount: 0, throughAge: 72, deductible: true },
      },
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
    analysis: { ...DEFAULT_ANALYSIS },
  };
}
