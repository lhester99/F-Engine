import {
  IRMAA_THRESHOLD_ROUNDING,
  IRMAA_TOP_TIER_FIXED_THROUGH,
  LATEST_IRMAA_SCHEDULE,
  type IrmaaSchedule,
} from '../data/irmaa';
import type { AnalysisSettings, FilingStatus, ProjectionResult, Scenario } from '../types';
import { computeTax, householdIncomeForYear, marginalRate, type HouseholdIncome, type TaxResult } from './federalTax';
import { filingStatusForYear, peopleAge65 } from './household';

/** Medicare eligibility age used to decide whether IRMAA can apply in a premium year. */
export const MEDICARE_AGE = 65;
/** IRMAA for a premium year is based on MAGI from this many years earlier. */
export const IRMAA_LOOKBACK_YEARS = 2;

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/**
 * IRMAA schedule for a premium year. The latest published year is returned as
 * published. Later years are projected: thresholds grow at the assumed
 * inflation rate and are rounded to the nearest $1,000 as the statute requires;
 * the top tier stays at its statutory amount through 2027; surcharges grow at
 * the same rate. Earlier years are not modeled and return null.
 */
export function irmaaScheduleForYear(
  premiumYear: number,
  inflationRate: number,
  base: IrmaaSchedule = LATEST_IRMAA_SCHEDULE,
): { schedule: IrmaaSchedule; projected: boolean } | null {
  if (premiumYear < base.premiumYear) return null;
  if (premiumYear === base.premiumYear) return { schedule: base, projected: false };
  const yearsOut = premiumYear - base.premiumYear;
  const growth = Math.pow(1 + inflationRate, yearsOut);
  const lastIdx = base.tiers.length - 1;
  const topYearsOut = Math.max(0, premiumYear - Math.max(base.premiumYear, IRMAA_TOP_TIER_FIXED_THROUGH));
  const topGrowth = Math.pow(1 + inflationRate, topYearsOut);
  return {
    projected: true,
    schedule: {
      premiumYear,
      standardPartB: base.standardPartB * growth,
      source: `Projected from ${base.premiumYear} at ${(inflationRate * 100).toFixed(1)}% a year`,
      tiers: base.tiers.map((t, i) => {
        const g = i === lastIdx ? topGrowth : growth;
        return {
          single: roundTo(t.single * g, IRMAA_THRESHOLD_ROUNDING),
          joint: roundTo(t.joint * g, IRMAA_THRESHOLD_ROUNDING),
          partB: t.partB * growth,
          partD: t.partD * growth,
        };
      }),
    },
  };
}

/**
 * IRMAA tier (0 = no surcharge, 1–5) for a MAGI. Tiers 1–4 apply when MAGI is
 * more than the lower bound; the top tier applies at or above its bound.
 */
export function irmaaTier(magi: number, filingStatus: FilingStatus, schedule: IrmaaSchedule): number {
  let tier = 0;
  const last = schedule.tiers.length - 1;
  schedule.tiers.forEach((t, i) => {
    const bound = filingStatus === 'joint' ? t.joint : t.single;
    if (i === last ? magi >= bound : magi > bound) tier = i + 1;
  });
  return tier;
}

/** Annual surcharge for a tier: (Part B + Part D monthly) × 12 × number of enrollees. */
export function annualIrmaaSurcharge(tier: number, schedule: IrmaaSchedule, enrollees: number): number {
  if (tier <= 0) return 0;
  const t = schedule.tiers[tier - 1]!;
  return (t.partB + t.partD) * 12 * enrollees;
}

export interface IncomeYear {
  /** Income (tax) year. */
  year: number;
  age: number;
  /** Taxable IRA distributions, including any taxable QCD portion. */
  taxableIra: number;
  conversion: number;
  deductibleContributions: number;
  income: HouseholdIncome;
  tax: TaxResult;
  /** Federal + state tax on the next $1,000 of ordinary income. */
  marginalRate: number;
  /** MAGI for IRMAA: AGI plus tax-exempt interest. */
  magi: number;
  /** Premium year this income determines (income year + 2). */
  premiumYear: number;
  /** False when nobody on the return is 65 or older in the premium year, so IRMAA does not apply. */
  medicareApplies: boolean;
  /** People on the return who are 65 or older in the premium year. */
  enrollees: number;
  tier: number;
  annualSurcharge: number;
  /** Thresholds used for the premium year (bounds for the filing status), lowest first. */
  thresholds: number[];
  thresholdsProjected: boolean;
}

/**
 * Household income, estimated tax, and the IRMAA result (for the premium year
 * two years later) for every projection year.
 */
export function incomeByYear(result: ProjectionResult, scenario: Scenario): IncomeYear[] {
  const a: AnalysisSettings = scenario.analysis;
  return result.years.map((y) => {
    const t = y.totals;
    const ira = { taxableIra: t.taxableDistribution, conversion: t.conversionGross, deductibleContributions: t.deductibleContributions };
    const income = householdIncomeForYear(scenario, y.year, ira, { qualified: t.sideQualifiedIncome, ordinary: t.sideOrdinaryIncome });
    const tax = computeTax(income);
    const premiumYear = y.year + IRMAA_LOOKBACK_YEARS;
    const enrollees = peopleAge65(scenario, premiumYear);
    const medicareApplies = enrollees > 0;
    const found = irmaaScheduleForYear(premiumYear, a.inflationRate);
    const schedule = found?.schedule;
    // The tier uses the filing status on the income year's return.
    const status = filingStatusForYear(scenario, y.year);
    const tier = schedule && medicareApplies ? irmaaTier(tax.irmaaMagi, status, schedule) : 0;
    return {
      year: y.year,
      age: y.age,
      ...ira,
      income,
      tax,
      marginalRate: marginalRate(income),
      magi: tax.irmaaMagi,
      premiumYear,
      medicareApplies,
      enrollees,
      tier,
      annualSurcharge: schedule ? annualIrmaaSurcharge(tier, schedule, enrollees) : 0,
      thresholds: schedule ? schedule.tiers.map((tr) => (status === 'joint' ? tr.joint : tr.single)) : [],
      thresholdsProjected: found?.projected ?? true,
    };
  });
}

/**
 * Annual IRMAA surcharge for the premium year two years after `incomeYear`, for a
 * given MAGI. Zero when nobody on the return will be 65 or older then.
 */
export function surchargeForIncome(scenario: Scenario, incomeYear: number, magi: number): number {
  const a = scenario.analysis;
  const premiumYear = incomeYear + IRMAA_LOOKBACK_YEARS;
  const enrollees = peopleAge65(scenario, premiumYear);
  const schedule = irmaaScheduleForYear(premiumYear, a.inflationRate)?.schedule;
  if (!schedule || enrollees === 0) return 0;
  return annualIrmaaSurcharge(irmaaTier(magi, filingStatusForYear(scenario, incomeYear), schedule), schedule, enrollees);
}

export interface IrmaaSummary {
  /** Income years whose MAGI puts the following premium year in a surcharge tier. */
  yearsWithSurcharge: number;
  highestTier: number;
  /** Total estimated surcharges for premium years that fall within the projection. */
  totalSurcharge: number;
}

/** Counts only premium years inside the projection (income in the last two years affects later premiums). */
export function summarizeIrmaa(income: IncomeYear[], lastProjectionYear: number): IrmaaSummary {
  const inRange = income.filter((i) => i.premiumYear <= lastProjectionYear);
  return {
    yearsWithSurcharge: inRange.filter((i) => i.tier > 0).length,
    highestTier: inRange.reduce((m, i) => Math.max(m, i.tier), 0),
    totalSurcharge: inRange.reduce((s, i) => s + i.annualSurcharge, 0),
  };
}
