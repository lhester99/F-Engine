import type { AnalysisSettings, EngineMessage, ProjectionResult, Scenario } from '../types';
import { incomeByYear, type IncomeYear } from './irmaa';
import { effectiveAnnualReturn } from './returns';

/**
 * Estimated tax comparison at advisor-entered rates. This is not a tax
 * calculation: it applies two assumed marginal rates to the change in taxable
 * IRA income the strategy causes.
 *
 * Each year, Δ = (strategy taxable IRA distributions + conversions)
 *              − (baseline taxable IRA distributions + conversions).
 * Positive Δ is income the strategy adds (taxed at the "added" rate); negative
 * Δ is income it avoids (taxed at the "avoided" rate). The difference in
 * pre-tax balances left at the end of the projection is treated as one more
 * flow at the end, because that money is still taxable whenever it is
 * withdrawn. Present values discount each year back to the start of the first
 * projection year; the end balance is discounted one year past the last year.
 */
export interface TaxComparison {
  /** Taxable income the strategy adds (sum of positive Δ, plus a higher ending pre-tax balance if any). */
  addedIncome: number;
  /** Taxable income the strategy avoids (sum of negative Δ, plus a lower ending pre-tax balance). */
  avoidedIncome: number;
  addedIncomePv: number;
  avoidedIncomePv: number;
  /** Ending pre-tax balance, strategy minus baseline (negative = less pre-tax money left). */
  endingPretaxDifference: number;
  /**
   * QCD dollars excluded from income, strategy minus baseline. Part of avoided
   * income: the comparison counts the tax not paid, not the gifts themselves.
   */
  qcdExcludedIncome: number;
  /** Discount rate actually used. */
  discountRate: number;
  taxOnAdded: number;
  taxAvoided: number;
  /** taxAvoided − taxOnAdded. Positive means the strategy comes out ahead at the entered rates. */
  netTax: number;
  taxOnAddedPv: number;
  taxAvoidedPv: number;
  netTaxPv: number;
  /**
   * Rate on avoided income at which the present-value net is zero, holding the
   * added-income rate fixed. Null when the strategy adds or avoids no income.
   */
  breakevenAvoidedRate: number | null;
  /** IRMAA surcharges (premium years inside the projection), baseline minus strategy. */
  irmaaDifference: number;
  irmaaDifferencePv: number;
  baselineIrmaa: number;
  strategyIrmaa: number;
}

export function validateAnalysis(a: AnalysisSettings): EngineMessage[] {
  const out: EngineMessage[] = [];
  const bad = (code: string, text: string, field: string) => out.push({ severity: 'error', code, text, field });
  const isRate = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
  if (!Number.isFinite(a.otherIncome) || a.otherIncome < 0) bad('other-income', 'Other income must be zero or positive.', 'otherIncome');
  if (!Number.isFinite(a.inflationRate) || a.inflationRate <= -1) bad('inflation', 'Inflation must be greater than -100%.', 'inflationRate');
  if (!isRate(a.addedIncomeTaxRate)) bad('tax-rate', 'Tax rates must be between 0% and 100%.', 'addedIncomeTaxRate');
  if (!isRate(a.avoidedIncomeTaxRate)) bad('tax-rate', 'Tax rates must be between 0% and 100%.', 'avoidedIncomeTaxRate');
  if (!a.discountMatchesReturn && (!Number.isFinite(a.discountRate) || a.discountRate <= -1)) bad('discount', 'Discount rate must be greater than -100%.', 'discountRate');
  if (a.medicareEnrollees !== 1 && a.medicareEnrollees !== 2) bad('enrollees', 'Enter 1 or 2 people on Medicare.', 'medicareEnrollees');
  return out;
}

const irmaaInRange = (income: IncomeYear[], lastYear: number) =>
  income.filter((i) => i.premiumYear <= lastYear);

export function compareTaxes(
  baseline: ProjectionResult,
  strategy: ProjectionResult,
  scenario: Scenario,
): TaxComparison {
  const a = scenario.analysis;
  const start = scenario.startYear;
  const discountRate = a.discountMatchesReturn ? effectiveAnnualReturn(scenario.returns) : a.discountRate;
  const df = (yearsFromStart: number) => 1 / Math.pow(1 + discountRate, yearsFromStart);

  let added = 0;
  let avoided = 0;
  let addedPv = 0;
  let avoidedPv = 0;
  const add = (delta: number, t: number) => {
    if (delta > 0) {
      added += delta;
      addedPv += delta * df(t);
    } else if (delta < 0) {
      avoided += -delta;
      avoidedPv += -delta * df(t);
    }
  };

  strategy.years.forEach((s, i) => {
    const b = baseline.years[i];
    if (!b) return;
    const delta =
      s.totals.taxableDistribution + s.totals.conversionGross - (b.totals.taxableDistribution + b.totals.conversionGross);
    add(delta, s.year - start);
  });

  const lastS = strategy.years[strategy.years.length - 1];
  const lastB = baseline.years[baseline.years.length - 1];
  const endingPretaxDifference = lastS && lastB ? lastS.totals.endBalancePretax - lastB.totals.endBalancePretax : 0;
  if (lastS) add(endingPretaxDifference, lastS.year - start + 1);

  const lastYear = lastS?.year ?? start;
  const bIncome = irmaaInRange(incomeByYear(baseline, scenario), lastYear);
  const sIncome = irmaaInRange(incomeByYear(strategy, scenario), lastYear);
  const baselineIrmaa = bIncome.reduce((x, i) => x + i.annualSurcharge, 0);
  const strategyIrmaa = sIncome.reduce((x, i) => x + i.annualSurcharge, 0);
  const pvIrmaa = (rows: IncomeYear[]) => rows.reduce((x, i) => x + i.annualSurcharge * df(i.premiumYear - start), 0);

  const taxOnAdded = added * a.addedIncomeTaxRate;
  const taxAvoided = avoided * a.avoidedIncomeTaxRate;
  const taxOnAddedPv = addedPv * a.addedIncomeTaxRate;
  const taxAvoidedPv = avoidedPv * a.avoidedIncomeTaxRate;

  return {
    addedIncome: added,
    avoidedIncome: avoided,
    addedIncomePv: addedPv,
    avoidedIncomePv: avoidedPv,
    endingPretaxDifference,
    qcdExcludedIncome:
      strategy.years.reduce((x, y) => x + y.totals.qcd - y.totals.qcdNotExcluded, 0) -
      baseline.years.reduce((x, y) => x + y.totals.qcd - y.totals.qcdNotExcluded, 0),
    discountRate,
    taxOnAdded,
    taxAvoided,
    netTax: taxAvoided - taxOnAdded,
    taxOnAddedPv,
    taxAvoidedPv,
    netTaxPv: taxAvoidedPv - taxOnAddedPv,
    breakevenAvoidedRate: addedPv > 0 && avoidedPv > 0 ? (a.addedIncomeTaxRate * addedPv) / avoidedPv : null,
    irmaaDifference: baselineIrmaa - strategyIrmaa,
    irmaaDifferencePv: pvIrmaa(bIncome) - pvIrmaa(sIncome),
    baselineIrmaa,
    strategyIrmaa,
  };
}
