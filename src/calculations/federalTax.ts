import {
  BRACKET_ROUNDING,
  DEDUCTION_ROUNDING,
  LATEST_FEDERAL_TAX_YEAR,
  NIIT,
  SENIOR_DEDUCTION,
  SOCIAL_SECURITY_TAXATION,
  type Bracket,
  type FederalTaxYear,
} from '../data/federalTax';
import type { FilingStatus, Scenario } from '../types';
import { filingStatusForYear, otherIncomeFactor, peopleAge65ForTax, socialSecurityForYear } from './household';

const floorTo = (v: number, step: number) => Math.floor(v / step) * step;

/**
 * Tax parameters for a year. The latest published year is returned as published;
 * later years are indexed at the inflation rate with the statutory rounding
 * (brackets and capital-gains thresholds down to $25, deductions down to $50).
 * Earlier years use the latest published year.
 */
export function taxParametersForYear(
  year: number,
  inflationRate: number,
  base: FederalTaxYear = LATEST_FEDERAL_TAX_YEAR,
): { params: FederalTaxYear; projected: boolean } {
  if (year <= base.year) return { params: base, projected: false };
  const g = Math.pow(1 + inflationRate, year - base.year);
  const idxBrackets = (bs: Bracket[]) =>
    bs.map((b) => ({ rate: b.rate, upTo: b.upTo === Infinity ? Infinity : floorTo(b.upTo * g, BRACKET_ROUNDING) }));
  const idxCg = (c: { zeroUpTo: number; fifteenUpTo: number }) => ({
    zeroUpTo: floorTo(c.zeroUpTo * g, BRACKET_ROUNDING),
    fifteenUpTo: floorTo(c.fifteenUpTo * g, BRACKET_ROUNDING),
  });
  return {
    projected: true,
    params: {
      year,
      brackets: { single: idxBrackets(base.brackets.single), joint: idxBrackets(base.brackets.joint) },
      standardDeduction: {
        single: floorTo(base.standardDeduction.single * g, DEDUCTION_ROUNDING),
        joint: floorTo(base.standardDeduction.joint * g, DEDUCTION_ROUNDING),
      },
      additional65: {
        single: floorTo(base.additional65.single * g, DEDUCTION_ROUNDING),
        marriedPerPerson: floorTo(base.additional65.marriedPerPerson * g, DEDUCTION_ROUNDING),
      },
      capitalGains: { single: idxCg(base.capitalGains.single), joint: idxCg(base.capitalGains.joint) },
      source: `Projected from ${base.year} at ${(inflationRate * 100).toFixed(1)}% a year`,
    },
  };
}

/** One year of household income, as it would appear on the return. */
export interface HouseholdIncome {
  year: number;
  filingStatus: FilingStatus;
  /**
   * Ordinary income other than Social Security: other ordinary income, taxable
   * IRA distributions, and Roth conversions, minus deductible IRA contributions.
   */
  ordinaryIncome: number;
  qualifiedIncome: number;
  /**
   * Investment income already counted in ordinaryIncome that is net investment
   * income for the NIIT (interest from the modeled cash account). IRA
   * distributions and conversions are never net investment income.
   */
  ordinaryInvestmentIncome?: number;
  taxExemptInterest: number;
  /** Gross Social Security benefits. */
  socialSecurity: number;
  /** People on the return who are 65 or older by the end of the year. */
  peopleAge65: number;
  itemizedDeductions: number;
  stateTaxRate: number;
  inflationRate: number;
}

export interface TaxResult {
  taxableSocialSecurity: number;
  agi: number;
  /** AGI + tax-exempt interest: the MAGI used for IRMAA. */
  irmaaMagi: number;
  /** Larger of itemized and standard (+ age-65 additions). */
  baseDeduction: number;
  usedItemized: boolean;
  seniorDeduction: number;
  taxableIncome: number;
  ordinaryTaxableIncome: number;
  ordinaryTax: number;
  qualifiedTax: number;
  niit: number;
  federalTax: number;
  stateTax: number;
  totalTax: number;
  /** Rate of the bracket the last dollar of ordinary taxable income falls in (0 if none). */
  bracketRate: number;
  /** Top of that bracket (taxable income). */
  bracketTop: number;
  projectedParameters: boolean;
}

/** Taxable portion of Social Security benefits (IRC §86). */
export function taxableSocialSecurity(
  benefits: number,
  otherAgi: number,
  taxExemptInterest: number,
  status: FilingStatus,
): number {
  if (benefits <= 0) return 0;
  const provisional = otherAgi + taxExemptInterest + 0.5 * benefits;
  const base = SOCIAL_SECURITY_TAXATION.base[status];
  const adjusted = SOCIAL_SECURITY_TAXATION.adjusted[status];
  if (provisional <= base) return 0;
  if (provisional <= adjusted) return Math.min(0.5 * benefits, 0.5 * (provisional - base));
  return Math.min(0.85 * benefits, 0.85 * (provisional - adjusted) + Math.min(0.5 * benefits, 0.5 * (adjusted - base)));
}

/** Tax on ordinary taxable income through the brackets. */
export function bracketTax(income: number, brackets: Bracket[]): number {
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    if (income <= lower) break;
    tax += (Math.min(income, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return tax;
}

/**
 * Estimated federal and state income tax for one year. Federal: Social
 * Security taxation, the larger of standard (+ age-65 additions) or itemized
 * deductions, the 2025–2028 senior deduction with its phase-out, ordinary
 * brackets, 0/15/20% rates on qualified income stacked on top of ordinary
 * income, and the 3.8% net investment income tax (on qualified income and
 * modeled cash interest).
 * State: a flat rate on AGI excluding Social Security. No credits, AMT, or
 * other items.
 */
export function computeTax(h: HouseholdIncome): TaxResult {
  const { params, projected } = taxParametersForYear(h.year, h.inflationRate);
  const status = h.filingStatus;
  const otherAgi = h.ordinaryIncome + h.qualifiedIncome;
  const ssTaxable = taxableSocialSecurity(h.socialSecurity, otherAgi, h.taxExemptInterest, status);
  const agi = otherAgi + ssTaxable;

  const add65 = status === 'joint' ? params.additional65.marriedPerPerson : params.additional65.single;
  const standard = params.standardDeduction[status] + add65 * h.peopleAge65;
  const usedItemized = h.itemizedDeductions > standard;
  const baseDeduction = usedItemized ? h.itemizedDeductions : standard;

  let seniorDeduction = 0;
  if (h.year >= SENIOR_DEDUCTION.firstYear && h.year <= SENIOR_DEDUCTION.lastYear && h.peopleAge65 > 0) {
    const reduction = SENIOR_DEDUCTION.phaseOutRate * Math.max(0, agi - SENIOR_DEDUCTION.phaseOutStart[status]);
    seniorDeduction = Math.max(0, SENIOR_DEDUCTION.perPerson - reduction) * h.peopleAge65;
  }

  const taxableIncome = Math.max(0, agi - baseDeduction - seniorDeduction);
  const qualifiedInTaxable = Math.min(Math.max(0, h.qualifiedIncome), taxableIncome);
  const ordinaryTaxableIncome = taxableIncome - qualifiedInTaxable;
  const brackets = params.brackets[status];
  const ordinaryTax = bracketTax(ordinaryTaxableIncome, brackets);

  // Qualified income fills the capital-gains bands starting where ordinary income ends.
  const cg = params.capitalGains[status];
  const atZero = Math.max(0, Math.min(taxableIncome, cg.zeroUpTo) - ordinaryTaxableIncome);
  const atFifteen = Math.max(0, Math.min(taxableIncome, cg.fifteenUpTo) - Math.max(ordinaryTaxableIncome, cg.zeroUpTo));
  const atTwenty = Math.max(0, qualifiedInTaxable - atZero - atFifteen);
  const qualifiedTax = atFifteen * 0.15 + atTwenty * 0.2;

  const netInvestmentIncome = Math.max(0, h.qualifiedIncome) + Math.max(0, h.ordinaryInvestmentIncome ?? 0);
  const niit = NIIT.rate * Math.min(netInvestmentIncome, Math.max(0, agi - NIIT.threshold[status]));
  const federalTax = ordinaryTax + qualifiedTax + niit;
  const stateTax = Math.max(0, h.stateTaxRate * (agi - ssTaxable));

  const bracket =
    ordinaryTaxableIncome <= 0 ? undefined : brackets.find((b) => ordinaryTaxableIncome <= b.upTo) ?? brackets[brackets.length - 1];
  return {
    taxableSocialSecurity: ssTaxable,
    agi,
    irmaaMagi: agi + h.taxExemptInterest,
    baseDeduction,
    usedItemized,
    seniorDeduction,
    taxableIncome,
    ordinaryTaxableIncome,
    ordinaryTax,
    qualifiedTax,
    niit,
    federalTax,
    stateTax,
    totalTax: federalTax + stateTax,
    bracketRate: bracket?.rate ?? 0,
    bracketTop: bracket?.upTo ?? brackets[0]!.upTo,
    projectedParameters: projected,
  };
}

/**
 * Effective marginal rate (federal + state) on the next `step` dollars of
 * ordinary income. Captures Social Security taxation, the senior-deduction
 * phase-out, capital-gains stacking, and NIIT, so it can exceed the bracket rate.
 */
export function marginalRate(h: HouseholdIncome, step = 1_000): number {
  const base = computeTax(h).totalTax;
  const more = computeTax({ ...h, ordinaryIncome: h.ordinaryIncome + step }).totalTax;
  return (more - base) / step;
}

/** IRA-related amounts for one person-year or household-year. */
export interface IraIncome {
  taxableIra: number;
  conversion: number;
  deductibleContributions: number;
}

/** Income from the taxable and cash accounts. */
export interface SideIncome {
  /** Qualified dividends and realized long-term gains. */
  qualified: number;
  /** Interest (ordinary income). */
  ordinary: number;
}

export const NO_SIDE_INCOME: SideIncome = { qualified: 0, ordinary: 0 };

/** Builds the year's household income from the entered assumptions plus the projected IRA amounts. */
export function householdIncomeForYear(
  scenario: Scenario,
  year: number,
  ira: IraIncome,
  side: SideIncome = NO_SIDE_INCOME,
): HouseholdIncome {
  const a = scenario.analysis;
  const g = Math.pow(1 + a.inflationRate, year - scenario.startYear);
  return {
    year,
    filingStatus: filingStatusForYear(scenario, year),
    ordinaryIncome:
      a.otherOrdinaryIncome * g * otherIncomeFactor(scenario, year) + ira.taxableIra + ira.conversion - ira.deductibleContributions + side.ordinary,
    qualifiedIncome: a.qualifiedInvestmentIncome * g * otherIncomeFactor(scenario, year) + side.qualified,
    ordinaryInvestmentIncome: side.ordinary,
    taxExemptInterest: a.taxExemptInterest * g * otherIncomeFactor(scenario, year),
    socialSecurity: socialSecurityForYear(scenario, year),
    peopleAge65: peopleAge65ForTax(scenario, year),
    itemizedDeductions: a.itemizedDeductions * g,
    stateTaxRate: a.stateTaxRate,
    inflationRate: a.inflationRate,
  };
}
