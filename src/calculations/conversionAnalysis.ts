import type { ProjectionResult, Scenario } from '../types';
import { computeTax } from './federalTax';
import { filingStatusForYear } from './household';
import { irmaaScheduleForYear, irmaaTier, surchargeForIncome, type IncomeYear } from './irmaa';
import type { TaxComparison } from './taxComparison';
import type { WealthComparison } from './wealth';

/** One conversion year: the tax the household pays anyway, and what the conversion adds. */
export interface ConversionYear {
  year: number;
  age: number;
  conversion: number;
  /** Federal + state tax that year without the conversion (everything else unchanged). */
  taxWithout: number;
  /** Federal + state tax that year with the conversion. */
  taxWith: number;
  /** taxWith − taxWithout: includes knock-on effects (more Social Security taxed, senior deduction lost). */
  addedTax: number;
  bracketWithout: number;
  bracketWith: number;
  /** Medicare surcharge (IRMAA) the conversion adds, paid in the premium year two years later. */
  addedIrmaa: number;
  premiumYear: number;
  irmaaTierWithout: number;
  irmaaTierWith: number;
  /** addedTax + addedIrmaa. */
  totalAdded: number;
  /** totalAdded ÷ conversion: cost per dollar converted. */
  ratePerDollar: number;
  /** Where the conversion tax was paid from (from the projection). */
  paidFromTaxable: number;
  paidFromCash: number;
  withheld: number;
}

/** One bar of the chart: federal + state tax by year, with and without the strategy. */
export interface ConversionChartYear {
  year: number;
  age: number;
  /** No strategy at all. */
  baselineTax: number;
  /** With the strategy, the part it would pay without this year's conversion. */
  strategyBase: number;
  /** With the strategy, the part this year's conversion adds. */
  strategyAdded: number;
}

export interface ConversionAnalysis {
  years: ConversionYear[];
  chart: ConversionChartYear[];
  totalConverted: number;
  totalAddedTax: number;
  totalAddedIrmaa: number;
  totalAdded: number;
  /** totalAdded ÷ totalConverted. */
  averageRate: number;
  firstAge: number | null;
  lastAge: number | null;
  /**
   * Overall breakeven tax rate: the rate on the pre-tax money left at the end
   * (taxed to heirs over 10 years) at which the plan's total estimated tax, in
   * present value, equals no strategy. See taxComparison.ts. 0 = lower at any
   * rate; null = no breakeven.
   */
  breakevenRate: number | null;
  /** The rate assumed for that money (entered heirs' rate, or the heirs' estimated average). */
  assumedLaterRate: number;
  /** First age/year from which after-tax wealth with the plan stays at or above no strategy. */
  breakevenAge: number | null;
  breakevenYear: number | null;
  /** True if the plan is behind first and then catches up (false: ahead from the start). */
  crossesOver: boolean;
  /** Later-year tax (federal + state) that is lower with the strategy than without, summed. */
  laterTaxReduced: number;
}

/**
 * Cost of each year's Roth conversion, measured as that year's tax with the
 * conversion minus the same year's tax without it (all other income, deductions,
 * and side-account income unchanged), plus the Medicare surcharge it triggers.
 * Tax on gains realized when shares are sold to pay the conversion tax is part
 * of the year's total tax but is not counted as conversion cost here.
 */
export function analyzeConversions(
  scenario: Scenario,
  strategy: ProjectionResult,
  baselineIncome: IncomeYear[],
  strategyIncome: IncomeYear[],
  tax: TaxComparison,
  wealth: WealthComparison,
): ConversionAnalysis {
  const years: ConversionYear[] = [];
  const chart: ConversionChartYear[] = [];
  strategyIncome.forEach((si, i) => {
    const conversion = si.conversion;
    const withoutTax = conversion > 0 ? computeTax({ ...si.income, ordinaryIncome: si.income.ordinaryIncome - conversion }) : si.tax;
    const added = si.tax.totalTax - withoutTax.totalTax;
    chart.push({
      year: si.year,
      age: si.age,
      baselineTax: baselineIncome[i]?.tax.totalTax ?? 0,
      strategyBase: withoutTax.totalTax,
      strategyAdded: added,
    });
    if (conversion <= 0) return;
    const irmaaWithout = surchargeForIncome(scenario, si.year, withoutTax.irmaaMagi);
    const addedIrmaa = si.annualSurcharge - irmaaWithout;
    const h = strategy.years[i]!.household;
    const totalAdded = added + addedIrmaa;
    years.push({
      year: si.year,
      age: si.age,
      conversion,
      taxWithout: withoutTax.totalTax,
      taxWith: si.tax.totalTax,
      addedTax: added,
      bracketWithout: withoutTax.bracketRate,
      bracketWith: si.tax.bracketRate,
      addedIrmaa,
      premiumYear: si.premiumYear,
      irmaaTierWithout: tierFor(scenario, si, withoutTax.irmaaMagi),
      irmaaTierWith: si.tier,
      totalAdded,
      ratePerDollar: totalAdded / conversion,
      paidFromTaxable: h.conversionTaxFromTaxable,
      paidFromCash: h.conversionTaxFromCash,
      withheld: h.conversionTaxWithheld,
    });
  });
  const sum = (f: (y: ConversionYear) => number) => years.reduce((s, y) => s + f(y), 0);
  const totalConverted = sum((y) => y.conversion);
  const totalAdded = sum((y) => y.totalAdded);
  const lastConversionYear = years[years.length - 1]?.year ?? Infinity;
  const laterTaxReduced = chart
    .filter((c) => c.year > lastConversionYear)
    .reduce((s, c) => s + Math.max(0, c.baselineTax - (c.strategyBase + c.strategyAdded)), 0);
  return {
    years,
    chart,
    totalConverted,
    totalAddedTax: sum((y) => y.addedTax),
    totalAddedIrmaa: sum((y) => y.addedIrmaa),
    totalAdded,
    averageRate: totalConverted > 0 ? totalAdded / totalConverted : 0,
    firstAge: years[0]?.age ?? null,
    lastAge: years[years.length - 1]?.age ?? null,
    breakevenRate: tax.breakevenHeirsRate,
    assumedLaterRate: scenario.heirs.mode === 'income' ? tax.strategy.legacy.effectiveRate : scenario.analysis.heirsTaxRate,
    breakevenAge: wealth.breakevenAge,
    breakevenYear: wealth.breakevenYear,
    crossesOver: wealth.crossesOver,
    laterTaxReduced,
  };
}

/** IRMAA tier for a MAGI in the same income year (0 when nobody is on Medicare in the premium year). */
function tierFor(scenario: Scenario, si: IncomeYear, magi: number): number {
  if (!si.medicareApplies) return 0;
  const schedule = irmaaScheduleForYear(si.premiumYear, scenario.analysis.inflationRate)?.schedule;
  return schedule ? irmaaTier(magi, filingStatusForYear(scenario, si.year), schedule) : 0;
}
