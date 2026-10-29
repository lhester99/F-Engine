import type { QcdLimitSettings } from '../data/qcdLimits';

/** All account types the engine knows about. Phase 1 UI exposes Traditional and Roth IRAs only. */
export type AccountType =
  | 'traditional_ira'
  | 'roth_ira'
  | 'sep_ira'
  | 'simple_ira'
  | '401k'
  | '403b'
  | 'roth_401k';

export interface Person {
  id: string;
  /** Generic, non-identifying label such as "Client" or "Spouse". Never a name. */
  label: string;
  /** ISO date, YYYY-MM-DD. */
  dateOfBirth: string;
  /** Delay the first RMD to April 1 of the following year. */
  delayFirstRmd: boolean;
}

export interface ContributionRule {
  annualAmount: number;
  /** Contributions are made in every projection year through this age (inclusive). */
  throughAge: number;
  /**
   * Pre-tax accounts only: whether the contribution is tax-deductible. Deductible
   * contributions for years ending on or after age 70½ reduce later QCD exclusions
   * (IRC §408(d)(8)(A)). Defaults to true. Ignored for Roth accounts.
   */
  deductible?: boolean;
}

export interface Account {
  id: string;
  ownerId: string;
  type: AccountType;
  /** Generic label such as "Traditional IRA 1". */
  label: string;
  /** Account balance on December 31 of the year before the first projection year. */
  priorYearEndBalance: number;
  contribution?: ContributionRule;
}

export type ReturnAssumption =
  | { mode: 'single'; annualReturn: number }
  | { mode: 'allocation'; stockWeight: number; stockReturn: number; bondReturn: number };

/** Extra pre-tax withdrawals beyond the RMD, taken from Traditional IRAs. */
export interface ExtraWithdrawalRule {
  personId: string;
  annualAmount: number;
  startAge: number;
  endAge: number;
}

export interface ConversionEntry {
  personId: string;
  year: number;
  /** Gross amount leaving the Traditional IRA(s), including any tax withheld. */
  amount: number;
}

export interface RecurringQcdRule {
  id: string;
  personId: string;
  annualAmount: number;
  startAge: number;
  endAge: number;
}

export interface OneTimeQcd {
  id: string;
  personId: string;
  year: number;
  amount: number;
}

/** Planning levers that differ between the baseline and a strategy. */
/**
 * Convert, each year in the age range, as much as keeps ordinary taxable income
 * within the chosen federal bracket, optionally also keeping MAGI at or below an
 * IRMAA tier. Amounts are recalculated whenever any input changes.
 */
export interface BracketFillRule {
  id: string;
  personId: string;
  startAge: number;
  endAge: number;
  /** Fill to the top of the bracket with this rate, e.g. 0.24. */
  bracketRate: number;
  /** Highest IRMAA tier allowed for the premium year two years later (0 = no surcharge); null = no IRMAA limit. */
  irmaaMaxTier: number | null;
}

export interface Strategy {
  conversions: ConversionEntry[];
  bracketFills: BracketFillRule[];
  /** Fraction (0–1) of each conversion withheld for taxes rather than deposited to the Roth IRA. */
  conversionWithholdingRate: number;
  recurringQcds: RecurringQcdRule[];
  oneTimeQcds: OneTimeQcd[];
}

export type FilingStatus = 'single' | 'joint';

/**
 * Household income and tax assumptions. All dollar amounts are in
 * first-projection-year dollars and grow at inflationRate; they are entered,
 * never calculated.
 */
export interface AnalysisSettings {
  filingStatus: FilingStatus;
  /** Spouse's date of birth (YYYY-MM-DD) when filing jointly; used for age-65 deductions and Medicare. */
  spouseDateOfBirth: string;
  /** Household Social Security benefits per year, before tax. */
  socialSecurityBenefit: number;
  /** Client's age when the Social Security benefits above begin (already-claimed clients: current age or lower). */
  socialSecurityStartAge: number;
  /** Pensions, wages, interest, and other ordinary income. */
  otherOrdinaryIncome: number;
  /** Qualified dividends and long-term capital gains. */
  qualifiedInvestmentIncome: number;
  /** Tax-exempt interest (counts toward Social Security taxation and IRMAA). */
  taxExemptInterest: number;
  /** Itemized deductions; the larger of these and the standard deduction is used. */
  itemizedDeductions: number;
  /** Flat state income tax rate, applied to income other than Social Security. */
  stateTaxRate: number;
  /** Grows entered income and deductions, and indexes tax brackets and IRMAA after the latest published year. */
  inflationRate: number;
  /** Tax rate assumed for whoever eventually withdraws the pre-tax balance left at the end (usually heirs). */
  heirsTaxRate: number;
  /** Annual rate used to express future dollars in present value (ignored when discountMatchesReturn). */
  discountRate: number;
  /**
   * Use the investment return as the discount rate. With a flat tax rate this
   * makes a Roth conversion tax-neutral in present value, the standard result.
   */
  discountMatchesReturn: boolean;
}

export interface Scenario {
  /** First projection year. Balances are as of December 31 of the prior year. */
  startYear: number;
  people: Person[];
  accounts: Account[];
  /** Projection runs through the year the primary person (people[0]) attains this age. */
  endAge: number;
  returns: ReturnAssumption;
  extraWithdrawals: ExtraWithdrawalRule[];
  qcdLimits: QcdLimitSettings;
  strategy: Strategy;
  analysis: AnalysisSettings;
}

export type MessageSeverity = 'error' | 'warning' | 'info';

export interface EngineMessage {
  severity: MessageSeverity;
  code: string;
  text: string;
  year?: number;
  personId?: string;
  /** Input field the message refers to, for inline display. */
  field?: string;
}

export interface AccountYear {
  accountId: string;
  type: AccountType;
  priorYearEndBalance: number;
  /** RMD computed on this account for this year (0 if none). */
  rmdComputed: number;
  qcd: number;
  /** Taxable RMD (including any deferred prior-year RMD) taken from this account. */
  rmdTaxableWithdrawal: number;
  extraWithdrawal: number;
  conversionOut: number;
  /** Conversion proceeds deposited (Roth accounts only). */
  conversionIn: number;
  contribution: number;
  growth: number;
  endBalance: number;
}

export interface PersonYear {
  personId: string;
  age: number;
  isRmdYear: boolean;
  isFirstRmdYear: boolean;
  /** Uniform Lifetime Table divisor used this year, or null if no RMD is due. */
  distributionPeriod: number | null;
  /** RMD for this distribution year, computed from the prior December 31 balance. */
  rmdForYear: number;
  /** Portion of last year's first RMD that was deferred to April 1 of this year. */
  deferredRmdFromPriorYear: number;
  /** Portion of this year's first RMD deferred to April 1 of next year. */
  rmdDeferredToNextYear: number;
  /** Amount the IRS requires to be distributed in this calendar year. */
  requiredRmd: number;
  qcd: number;
  /** QCD dollars that counted toward the required RMD. */
  qcdTowardRmd: number;
  /**
   * QCD dollars that are taxable because of deductible IRA contributions made
   * for years on or after age 70½ (IRC §408(d)(8)(A)). Included in taxableDistribution.
   */
  qcdNotExcluded: number;
  /** Deductible pre-tax IRA contributions this year (reduce AGI/MAGI). */
  deductibleContributions: number;
  /** Taxable distributions: RMD not covered by QCDs, plus extra withdrawals, plus any QCD amount made taxable by the contribution offset. */
  taxableDistribution: number;
  rmdTaxableWithdrawal: number;
  extraWithdrawal: number;
  /** All distributions other than conversions (QCDs + taxable distributions). */
  totalDistributions: number;
  conversionRequested: number;
  /** How the year's conversion was set: a fixed amount, a fill-to-bracket rule, or none. */
  conversionMethod: 'none' | 'fixed' | 'fill';
  conversionGross: number;
  conversionWithheld: number;
  conversionToRoth: number;
  /** Required RMD that could not be distributed because the accounts ran out. */
  rmdShortfall: number;
}

export interface YearTotals {
  priorBalancePretax: number;
  priorBalanceRoth: number;
  requiredRmd: number;
  rmdForYear: number;
  deferredRmdFromPriorYear: number;
  rmdDeferredToNextYear: number;
  qcd: number;
  qcdNotExcluded: number;
  taxableDistribution: number;
  extraWithdrawal: number;
  totalDistributions: number;
  deductibleContributions: number;
  conversionGross: number;
  conversionWithheld: number;
  contributions: number;
  growth: number;
  endBalancePretax: number;
  endBalanceRoth: number;
  endBalanceTotal: number;
}

export interface YearResult {
  year: number;
  /** Age of the primary person in this year. */
  age: number;
  /** Return rate applied this year. */
  returnRate: number;
  people: PersonYear[];
  accounts: AccountYear[];
  totals: YearTotals;
  messages: EngineMessage[];
}

export interface ProjectionResult {
  ok: boolean;
  /** Input validation errors; when present, years is empty. */
  errors: EngineMessage[];
  years: YearResult[];
  /** All year-level messages (warnings, blocked conversions, capped QCDs). */
  messages: EngineMessage[];
}
