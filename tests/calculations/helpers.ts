import { DEFAULT_QCD_LIMIT_SETTINGS } from '../../src/data/qcdLimits';
import { emptyStrategy } from '../../src/strategies/schedule';
import { DEFAULT_ANALYSIS } from '../../src/utils/defaultScenario';
import type { Account, AnalysisSettings, CashFlowSettings, ContributionRule, Scenario, Strategy } from '../../src/types';

export interface TestScenarioOptions {
  dob: string;
  startYear?: number;
  endAge: number;
  rate?: number;
  traditional?: number[];
  roth?: number;
  rothContribution?: { annualAmount: number; throughAge: number };
  delayFirstRmd?: boolean;
  strategy?: Partial<Strategy>;
  extra?: { annualAmount: number; startAge: number; endAge: number };
  /** Contribution to the first Traditional IRA ("t0"). */
  tradContribution?: ContributionRule;
  analysis?: Partial<AnalysisSettings>;
  cashFlow?: Partial<CashFlowSettings>;
}

/**
 * Test default: a large taxable account with no dividends, so taxes are always
 * paid from outside the IRAs and IRA balances match the hand calculations.
 */
export const TEST_CASH_FLOW: CashFlowSettings = {
  taxableBalance: 100_000_000,
  taxableBasis: 100_000_000,
  taxableYield: 0,
  cashBalance: 0,
  cashRate: 0,
  spendingFromIra: 0,
};

/** Builds a one-person scenario with Traditional IRAs "t0", "t1", … and a Roth IRA "roth". */
export function scenario(o: TestScenarioOptions): Scenario {
  const accounts: Account[] = (o.traditional ?? [1_000_000]).map((bal, i) => ({
    id: `t${i}`,
    ownerId: 'p1',
    type: 'traditional_ira',
    label: `Traditional IRA ${i + 1}`,
    priorYearEndBalance: bal,
    contribution: i === 0 ? o.tradContribution : undefined,
  }));
  accounts.push({
    id: 'roth',
    ownerId: 'p1',
    type: 'roth_ira',
    label: 'Roth IRA',
    priorYearEndBalance: o.roth ?? 0,
    contribution: o.rothContribution,
  });
  return {
    startYear: o.startYear ?? 2026,
    people: [{ id: 'p1', label: 'Client', dateOfBirth: o.dob, delayFirstRmd: o.delayFirstRmd ?? false }],
    accounts,
    endAge: o.endAge,
    returns: { mode: 'single', annualReturn: o.rate ?? 0 },
    extraWithdrawals: o.extra ? [{ personId: 'p1', ...o.extra }] : [],
    qcdLimits: DEFAULT_QCD_LIMIT_SETTINGS,
    strategy: { ...emptyStrategy(), ...o.strategy },
    analysis: { ...DEFAULT_ANALYSIS, ...o.analysis },
    cashFlow: { ...TEST_CASH_FLOW, ...o.cashFlow },
  };
}
