import type { ProjectionResult } from '../types';

export interface YearPoint {
  year: number;
  age: number;
  amount: number;
}

export interface ProjectionSummary {
  firstRmd: YearPoint | null;
  peakRmd: YearPoint | null;
  totalRequiredRmd: number;
  totalTaxableDistributions: number;
  totalQcd: number;
  totalConversions: number;
  /**
   * Annualized growth of the calculated RMD (by distribution year, so April 1
   * timing does not distort it) from the first to the last RMD year.
   */
  rmdAnnualGrowth: number | null;
  endingPretax: number;
  endingRoth: number;
  endingTotal: number;
}

export function summarize(result: ProjectionResult): ProjectionSummary {
  const ys = result.years;
  let firstRmd: YearPoint | null = null;
  let peakRmd: YearPoint | null = null;
  let totalRequiredRmd = 0;
  let totalTaxableDistributions = 0;
  let totalQcd = 0;
  let totalConversions = 0;
  for (const y of ys) {
    const t = y.totals;
    if (!firstRmd && t.requiredRmd > 0) firstRmd = { year: y.year, age: y.age, amount: t.requiredRmd };
    if (t.requiredRmd > 0 && (!peakRmd || t.requiredRmd > peakRmd.amount)) {
      peakRmd = { year: y.year, age: y.age, amount: t.requiredRmd };
    }
    totalRequiredRmd += t.requiredRmd;
    totalTaxableDistributions += t.taxableDistribution;
    totalQcd += t.qcd;
    totalConversions += t.conversionGross;
  }

  const rmdYears = ys.filter((y) => y.totals.rmdForYear > 0);
  let rmdAnnualGrowth: number | null = null;
  if (rmdYears.length >= 2) {
    const first = rmdYears[0]!;
    const last = rmdYears[rmdYears.length - 1]!;
    const span = last.year - first.year;
    rmdAnnualGrowth = Math.pow(last.totals.rmdForYear / first.totals.rmdForYear, 1 / span) - 1;
  }

  const end = ys[ys.length - 1]?.totals;
  return {
    firstRmd,
    peakRmd,
    totalRequiredRmd,
    totalTaxableDistributions,
    totalQcd,
    totalConversions,
    rmdAnnualGrowth,
    endingPretax: end?.endBalancePretax ?? 0,
    endingRoth: end?.endBalanceRoth ?? 0,
    endingTotal: end?.endBalanceTotal ?? 0,
  };
}
