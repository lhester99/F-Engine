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
  /** This person's Social Security benefit per year before tax, in today's dollars (entered, never projected). */
  socialSecurityBenefit: number;
  /** This person's age when that benefit begins (already claiming: current age or lower). */
  socialSecurityStartAge: number;
}

/**
 * The first death between spouses. In the death year the couple still files
 * jointly and the deceased's RMD for that year is taken in full. From January 1
 * of the next year the survivor rolls the deceased's IRAs into their own
 * (spousal rollover), files single, and keeps the larger Social Security benefit.
 */
export interface SurvivorshipSettings {
  enabled: boolean;
  /** Spouse who dies first. */
  firstDeathPersonId: string;
  /** That spouse's age in the year of death. */
  deathAge: number;
  /** Other entered income that continues for the survivor, as a fraction (e.g. a pension's survivor benefit). */
  otherIncomeAfter: number;
  /** Spending from IRA withdrawals that continues for the survivor, as a fraction. */
  spendingAfter: number;
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

/** How the income tax caused by a Roth conversion is paid. */
export type ConversionTaxSource = 'withhold' | 'taxable' | 'cash';

export interface Strategy {
  conversions: ConversionEntry[];
  bracketFills: BracketFillRule[];
  /**
   * Withheld from the conversion (less reaches the Roth IRA), or paid from the
   * taxable account or cash. If the chosen account runs short, the other account
   * is used, then withholding.
   */
  conversionTaxSource: ConversionTaxSource;
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
  /** Pensions, wages, interest, and other ordinary income (household). */
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
  /** Heirs' tax rate on the inherited pre-tax IRA (used when heirs.mode is 'rate'). */
  heirsTaxRate: number;
  /** Annual rate used to express future dollars in present value (ignored when discountMatchesReturn). */
  discountRate: number;
  /**
   * Use the investment return as the discount rate. With a flat tax rate this
   * makes a Roth conversion tax-neutral in present value, the standard result.
   */
  discountMatchesReturn: boolean;
}

/**
 * Accounts outside the IRAs that hold unneeded RMD money and pay taxes, plus
 * how much of the IRA withdrawals the client spends.
 */
export interface CashFlowSettings {
  /** Taxable brokerage account balance at the start of the projection. */
  taxableBalance: number;
  /** Cost basis of that account. */
  taxableBasis: number;
  /** Share of the taxable account paid out each year as qualified dividends (taxed each year). Its total return is the investment return. */
  taxableYield: number;
  cashBalance: number;
  /** Interest rate on cash, taxed as ordinary income. */
  cashRate: number;
  /** Amount of IRA withdrawals the client spends each year, in today's dollars (grows with inflation). */
  spendingFromIra: number;
}

/**
 * Heirs who inherit at the end of the projection (the last death). Non-spouse
 * heirs must empty an inherited IRA within 10 years; the app withdraws it evenly.
 */
export interface HeirSettings {
  /** 'rate': heirs' tax is the entered heirs' tax rate. 'income': estimated from each heir's brackets. */
  mode: 'rate' | 'income';
  /** Number of heirs sharing equally (income mode). */
  count: number;
  /** Each heir's other taxable income per year, in today's dollars (income mode). */
  otherIncome: number;
  filingStatus: FilingStatus;
  /** Heirs' flat state income tax rate (income mode). */
  stateTaxRate: number;
}

export interface Scenario {
  /** First projection year. Balances are as of December 31 of the prior year. */
  startYear: number;
  /** One person, or two spouses filing jointly. people[0] is the client. */
  people: Person[];
  accounts: Account[];
  /** Projection runs through the year the client (people[0]) would attain this age, even if the client dies first. */
  endAge: number;
  returns: ReturnAssumption;
  extraWithdrawals: ExtraWithdrawalRule[];
  qcdLimits: QcdLimitSettings;
  strategy: Strategy;
  analysis: AnalysisSettings;
  cashFlow: CashFlowSettings;
  survivorship: SurvivorshipSettings;
  heirs: HeirSettings;
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
  /** Tax-free withdrawals (Roth IRA) used to cover spending. */
  withdrawal: number;
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
  /** Qualified dividends and realized gains from the taxable account (taxed this year). */
  sideQualifiedIncome: number;
  /** Interest on cash (ordinary income). */
  sideOrdinaryIncome: number;
  endBalanceTaxable: number;
  endBalanceCash: number;
  /**
   * Roth + taxable account + cash + pre-tax balance after the heirs' tax rate.
   * Taxable gains are not taxed here (heirs receive a step-up in basis).
   */
  afterTaxValue: number;
  growth: number;
  endBalancePretax: number;
  endBalanceRoth: number;
  /** IRAs + taxable account + cash. */
  endBalanceTotal: number;
}

/** Household money flows outside the IRAs for one year. */
export interface HouseholdCashFlow {
  taxableStart: number;
  taxableBasisStart: number;
  cashStart: number;
  dividends: number;
  cashInterest: number;
  realizedGain: number;
  /** Federal + state tax caused by IRA income, conversions, and these accounts (total minus tax on entered income alone). */
  taxOnModeledIncome: number;
  /** The part of that tax caused by the Roth conversion. */
  conversionTax: number;
  conversionTaxWithheld: number;
  conversionTaxFromTaxable: number;
  conversionTaxFromCash: number;
  /** IRMAA surcharge caused by modeled income two years earlier, paid this year. */
  irmaaPaid: number;
  /** Cash received from taxable IRA withdrawals (RMDs and extra withdrawals). */
  iraCashReceived: number;
  spending: number;
  spendingShortfall: number;
  /** Left-over IRA withdrawals invested in the taxable account. */
  invested: number;
  withdrawnTaxable: number;
  withdrawnCash: number;
  withdrawnRoth: number;
  taxableGrowth: number;
  cashGrowth: number;
  taxableEnd: number;
  taxableBasisEnd: number;
  cashEnd: number;
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
  household: HouseholdCashFlow;
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
