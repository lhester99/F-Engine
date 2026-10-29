import type { ProjectionResult, Scenario } from '../types';
import { incomeByYear, type IncomeYear } from './irmaa';
import { computeLegacy, type Legacy } from './legacy';
import { effectiveAnnualReturn } from './returns';

/**
 * Estimated tax comparison, strategy vs. no strategy. Each year's federal and
 * state income tax comes from the bracket-based estimate; IRMAA surcharges are
 * counted in their premium year (premium years after the projection are not
 * counted). Pre-tax money left at the end of the projection is withdrawn by
 * heirs over 10 years and taxed as legacy.ts describes. Present values
 * discount to the start of the first projection year.
 */
export interface TaxTotals {
  federal: number;
  state: number;
  irmaa: number;
  /** federal + state + IRMAA during the projection. */
  lifetime: number;
  lifetimePv: number;
  /** Pre-tax balance left at the end. */
  endingPretax: number;
  /** Heirs' tax on the inherited pre-tax IRA over the 10-year window (see legacy.ts). */
  heirsTax: number;
  heirsTaxPv: number;
  /** The heirs' 10-year withdrawal schedule and what they keep. */
  legacy: Legacy;
  /** lifetime + heirs' tax. */
  total: number;
  totalPv: number;
}

export interface TaxComparison {
  baseline: TaxTotals;
  strategy: TaxTotals;
  /** Sum of the years in which the strategy's tax is higher (mostly conversion years). */
  taxPaidEarlier: number;
  taxPaidEarlierPv: number;
  /** Sum of the years in which the strategy's tax is lower, plus lower heirs' tax. */
  taxAvoidedLater: number;
  taxAvoidedLaterPv: number;
  /** baseline total − strategy total. Positive: the strategy's estimated total tax is lower. */
  netTax: number;
  netTaxPv: number;
  /**
   * Heirs' tax rate at which the present-value totals are equal. 0 means the
   * strategy's tax is lower even if heirs pay no tax; null means no breakeven
   * (the strategy does not leave less pre-tax money, or there is no strategy).
   */
  breakevenHeirsRate: number | null;
  /** QCD dollars excluded from income (strategy − baseline); the gifts themselves are not a cost here. */
  qcdExcludedIncome: number;
  discountRate: number;
}

function totals(
  income: IncomeYear[],
  result: ProjectionResult,
  scenario: Scenario,
  df: (t: number) => number,
  discountRate: number,
): TaxTotals {
  const start = scenario.startYear;
  const last = result.years[result.years.length - 1];
  const lastYear = last?.year ?? start;
  let federal = 0;
  let state = 0;
  let irmaa = 0;
  let lifetimePv = 0;
  for (const y of income) {
    federal += y.tax.federalTax;
    state += y.tax.stateTax;
    lifetimePv += y.tax.totalTax * df(y.year - start);
    if (y.premiumYear <= lastYear) {
      irmaa += y.annualSurcharge;
      lifetimePv += y.annualSurcharge * df(y.premiumYear - start);
    }
  }
  const endingPretax = last?.totals.endBalancePretax ?? 0;
  const legacy = computeLegacy(result, scenario, discountRate);
  const heirsTax = legacy.heirsTax;
  const heirsTaxPv = legacy.heirsTaxPv;
  const lifetime = federal + state + irmaa;
  return {
    federal,
    state,
    irmaa,
    lifetime,
    lifetimePv,
    endingPretax,
    heirsTax,
    heirsTaxPv,
    legacy,
    total: lifetime + heirsTax,
    totalPv: lifetimePv + heirsTaxPv,
  };
}

export function compareTaxes(baseline: ProjectionResult, strategy: ProjectionResult, scenario: Scenario): TaxComparison {
  const a = scenario.analysis;
  const start = scenario.startYear;
  const discountRate = a.discountMatchesReturn ? effectiveAnnualReturn(scenario.returns) : a.discountRate;
  const df = (t: number) => 1 / Math.pow(1 + discountRate, t);

  const bIncome = incomeByYear(baseline, scenario);
  const sIncome = incomeByYear(strategy, scenario);
  const b = totals(bIncome, baseline, scenario, df, discountRate);
  const s = totals(sIncome, strategy, scenario, df, discountRate);
  const lastYear = strategy.years[strategy.years.length - 1]?.year ?? start;

  // Year-by-year differences, with each IRMAA surcharge placed in its premium year.
  const flows = new Map<number, number>();
  const addFlow = (year: number, v: number) => flows.set(year, (flows.get(year) ?? 0) + v);
  sIncome.forEach((sy, i) => {
    const by = bIncome[i]!;
    addFlow(sy.year, sy.tax.totalTax - by.tax.totalTax);
    if (sy.premiumYear <= lastYear) addFlow(sy.premiumYear, sy.annualSurcharge - by.annualSurcharge);
  });
  s.legacy.schedule.forEach((sy, k) => addFlow(sy.year, sy.tax - (b.legacy.schedule[k]?.tax ?? 0)));

  let earlier = 0;
  let earlierPv = 0;
  let later = 0;
  let laterPv = 0;
  for (const [year, v] of flows) {
    if (v > 0) {
      earlier += v;
      earlierPv += v * df(year - start);
    } else {
      later -= v;
      laterPv -= v * df(year - start);
    }
  }

  const lifetimeDiffPv = s.lifetimePv - b.lifetimePv;
  // Heirs' tax is (rate × inherited withdrawals) at a flat rate, so the breakeven flat rate
  // compares the lifetime difference with the difference in inherited withdrawals.
  const pretaxDiffPv = b.legacy.withdrawalsPv - s.legacy.withdrawalsPv;
  let breakevenHeirsRate: number | null = null;
  if (pretaxDiffPv > 0.5) breakevenHeirsRate = Math.max(0, lifetimeDiffPv / pretaxDiffPv);
  else if (lifetimeDiffPv < -0.5) breakevenHeirsRate = 0;

  const qcdIn = (r: ProjectionResult) => r.years.reduce((x, y) => x + y.totals.qcd - y.totals.qcdNotExcluded, 0);
  return {
    baseline: b,
    strategy: s,
    taxPaidEarlier: earlier,
    taxPaidEarlierPv: earlierPv,
    taxAvoidedLater: later,
    taxAvoidedLaterPv: laterPv,
    netTax: b.total - s.total,
    netTaxPv: b.totalPv - s.totalPv,
    breakevenHeirsRate,
    qcdExcludedIncome: qcdIn(strategy) - qcdIn(baseline),
    discountRate,
  };
}
