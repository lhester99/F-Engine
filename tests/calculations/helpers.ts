import { DEFAULT_QCD_LIMIT_SETTINGS } from '../../src/data/qcdLimits';
import { emptyStrategy } from '../../src/strategies/schedule';
import { DEFAULT_ANALYSIS, DEFAULT_HEIRS, DEFAULT_SURVIVORSHIP } from '../../src/utils/defaultScenario';
import type { Account, AnalysisSettings, CashFlowSettings, ContributionRule, HeirSettings, Scenario, Strategy, SurvivorshipSettings } from '../../src/types';

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
  /**
   * Household assumptions. For convenience, socialSecurityBenefit and
   * socialSecurityStartAge here set the client's own Social Security.
   */
  analysis?: Partial<AnalysisSettings> & { socialSecurityBenefit?: number; socialSecurityStartAge?: number };
  cashFlow?: Partial<CashFlowSettings>;
  /** Adds a spouse "p2" with these values (Traditional IRA "s0", Roth IRA "sroth"). */
  spouse?: { dob: string; traditional?: number; roth?: number; ss?: number; ssAge?: number };
  /** Whether the spouse is the sole beneficiary of the client's IRAs (default true). */
  spouseIsSoleBeneficiary?: boolean;
  survivorship?: Partial<SurvivorshipSettings>;
  heirs?: Partial<HeirSettings>;
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
  if (o.spouse) {
    accounts.push(
      { id: 's0', ownerId: 'p2', type: 'traditional_ira', label: 'Spouse Traditional IRA', priorYearEndBalance: o.spouse.traditional ?? 0 },
      { id: 'sroth', ownerId: 'p2', type: 'roth_ira', label: 'Spouse Roth IRA', priorYearEndBalance: o.spouse.roth ?? 0 },
    );
  }
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
    people: [
      {
        id: 'p1',
        label: 'Client',
        dateOfBirth: o.dob,
        delayFirstRmd: o.delayFirstRmd ?? false,
        socialSecurityBenefit: o.analysis?.socialSecurityBenefit ?? 36_000,
        socialSecurityStartAge: o.analysis?.socialSecurityStartAge ?? 67,
        spouseIsSoleBeneficiary: o.spouseIsSoleBeneficiary,
      },
      ...(o.spouse
        ? [
            {
              id: 'p2',
              label: 'Spouse',
              dateOfBirth: o.spouse.dob,
              delayFirstRmd: false,
              socialSecurityBenefit: o.spouse.ss ?? 0,
              socialSecurityStartAge: o.spouse.ssAge ?? 67,
            },
          ]
        : []),
    ],
    accounts,
    endAge: o.endAge,
    returns: { mode: 'single', annualReturn: o.rate ?? 0 },
    extraWithdrawals: o.extra ? [{ personId: 'p1', ...o.extra }] : [],
    qcdLimits: DEFAULT_QCD_LIMIT_SETTINGS,
    strategy: { ...emptyStrategy(), ...o.strategy },
    analysis: { ...DEFAULT_ANALYSIS, ...withoutPersonFields(o.analysis) },
    cashFlow: { ...TEST_CASH_FLOW, ...o.cashFlow },
    survivorship: { ...DEFAULT_SURVIVORSHIP, firstDeathPersonId: 'p1', ...o.survivorship },
    heirs: { ...DEFAULT_HEIRS, ...o.heirs },
  };
}

function withoutPersonFields(a: TestScenarioOptions['analysis']): Partial<AnalysisSettings> {
  if (!a) return {};
  const { socialSecurityBenefit: _b, socialSecurityStartAge: _s, ...rest } = a;
  return rest;
}
