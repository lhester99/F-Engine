import { DEFAULT_QCD_LIMIT_SETTINGS } from '../data/qcdLimits';
import { emptyStrategy } from '../strategies/schedule';
import type { Account, AnalysisSettings, CashFlowSettings, HeirSettings, Person, Scenario, SurvivorshipSettings } from '../types';

export const PRIMARY_ID = 'client';
export const SPOUSE_ID = 'spouse';

/** Default heirs: tax at the entered heirs' rate; income-mode fields prefilled for two working-age heirs. */
export const DEFAULT_HEIRS: HeirSettings = {
  mode: 'rate',
  count: 2,
  otherIncome: 150_000,
  filingStatus: 'joint',
  stateTaxRate: 0,
};

/** Default first-death settings (off until the advisor turns it on). */
export const DEFAULT_SURVIVORSHIP: SurvivorshipSettings = {
  enabled: false,
  firstDeathPersonId: PRIMARY_ID,
  deathAge: 85,
  otherIncomeAfter: 1,
  spendingAfter: 1,
};

/** A hypothetical spouse two years younger than the client, with one Traditional IRA and a Roth IRA. */
export function defaultSpouse(clientDob: string): { person: Person; accounts: Account[] } {
  const year = Number(clientDob.slice(0, 4));
  const dob = Number.isFinite(year) ? `${year + 2}${clientDob.slice(4)}` : '1958-06-15';
  return {
    person: {
      id: SPOUSE_ID,
      label: 'Spouse',
      dateOfBirth: dob,
      delayFirstRmd: false,
      socialSecurityBenefit: 24_000,
      socialSecurityStartAge: 67,
    },
    accounts: [
      { id: 'spouse-trad-1', ownerId: SPOUSE_ID, type: 'traditional_ira', label: 'Spouse Traditional IRA 1', priorYearEndBalance: 400_000 },
      { id: 'spouse-roth-1', ownerId: SPOUSE_ID, type: 'roth_ira', label: 'Spouse Roth IRA', priorYearEndBalance: 0 },
    ],
  };
}

/** Default taxable account, cash, and spending for the hypothetical client. */
export const DEFAULT_CASH_FLOW: CashFlowSettings = {
  taxableBalance: 250_000,
  taxableBasis: 200_000,
  taxableYield: 0.02,
  cashBalance: 50_000,
  cashRate: 0.03,
  spendingFromIra: 0,
};

/** Default household income and tax assumptions for the hypothetical client. */
export const DEFAULT_ANALYSIS: AnalysisSettings = {
  otherOrdinaryIncome: 15_000,
  qualifiedInvestmentIncome: 0,
  taxExemptInterest: 0,
  itemizedDeductions: 0,
  stateTaxRate: 0,
  inflationRate: 0.025,
  heirsTaxRate: 0.24,
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
    people: [
      {
        id: PRIMARY_ID,
        label: 'Client',
        dateOfBirth: '1956-06-15',
        delayFirstRmd: false,
        socialSecurityBenefit: 36_000,
        socialSecurityStartAge: 67,
      },
    ],
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
    cashFlow: { ...DEFAULT_CASH_FLOW },
    survivorship: { ...DEFAULT_SURVIVORSHIP },
    heirs: { ...DEFAULT_HEIRS },
  };
}
