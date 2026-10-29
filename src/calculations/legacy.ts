import type { ProjectionResult, Scenario } from '../types';
import { computeTax, type HouseholdIncome } from './federalTax';
import { effectiveAnnualReturn } from './returns';

/** Years a non-spouse designated beneficiary has to empty an inherited IRA (IRC §401(a)(9)(H)). */
export const TEN_YEAR_RULE = 10;

export interface LegacyYear {
  /** Calendar year of the heirs' withdrawal (1–10 years after the inheritance). */
  year: number;
  /** Year of the 10-year window, 1–10. */
  index: number;
  inheritedBalanceStart: number;
  /** Total withdrawn by all heirs this year (taxable). */
  withdrawal: number;
  perHeirWithdrawal: number;
  /** Each heir's ordinary taxable income with the withdrawal (income mode; 0 in rate mode). */
  perHeirTaxableIncome: number;
  /** Federal bracket an heir reaches (income mode; 0 in rate mode). */
  bracketRate: number;
  /** Tax on this year's withdrawals, all heirs. */
  tax: number;
}

export interface Legacy {
  /** Year-end of inheritance: the last projection year (assumed last death). */
  inheritanceYear: number;
  pretax: number;
  roth: number;
  /** Taxable account at inheritance; basis steps up, so no gain is taxed. */
  taxable: number;
  cash: number;
  schedule: LegacyYear[];
  withdrawals: number;
  heirsTax: number;
  /** Present values at the start of the first projection year. */
  withdrawalsPv: number;
  heirsTaxPv: number;
  /** heirsTaxPv / withdrawalsPv: the average heirs' rate, weighted by timing. */
  effectiveRate: number;
  /** Highest federal bracket an heir reaches (income mode). */
  highestBracket: number;
  /** Roth + taxable + cash + after-tax inherited IRA withdrawals, in present value. */
  netToHeirsPv: number;
}

/**
 * What heirs receive if they inherit everything at the end of the projection.
 * The inherited pre-tax IRA grows at the investment return and is withdrawn
 * evenly: each year takes the balance ÷ the years left, so it is empty after
 * 10 years. (This meets the annual RMDs required in years 1–9 when the owner
 * had begun RMDs, as long as each heir's single-life factor exceeds the years
 * left, which holds for heirs 81 or younger in the first year: the Single
 * Life Table gives 10.5 at 81 and 9.9 at 82, Treas. Reg. §1.401(a)(9)-9(b).) The Roth IRA passes tax-free; the
 * taxable account receives a step-up in basis.
 *
 * Heirs' tax: in 'rate' mode, withdrawals × the heirs' tax rate. In 'income'
 * mode, each heir's extra federal tax (brackets, standard deduction, under 65)
 * plus the heirs' state rate, on their share stacked on their own income.
 */
export function computeLegacy(result: ProjectionResult, scenario: Scenario, discountRate: number): Legacy {
  const last = result.years[result.years.length - 1];
  const L = last?.year ?? scenario.startYear - 1;
  const t = last?.totals;
  const pretax = t?.endBalancePretax ?? 0;
  const r = effectiveAnnualReturn(scenario.returns);
  const h = scenario.heirs;
  const infl = scenario.analysis.inflationRate;
  const count = Math.max(1, Math.round(h.count));
  const df = (year: number) => 1 / Math.pow(1 + discountRate, year - scenario.startYear);

  const heirIncome = (year: number, extra: number): HouseholdIncome => ({
    year,
    filingStatus: h.filingStatus,
    ordinaryIncome: h.otherIncome * Math.pow(1 + infl, year - scenario.startYear) + extra,
    qualifiedIncome: 0,
    taxExemptInterest: 0,
    socialSecurity: 0,
    peopleAge65: 0,
    itemizedDeductions: 0,
    stateTaxRate: h.stateTaxRate,
    inflationRate: infl,
  });

  const schedule: LegacyYear[] = [];
  let balance = pretax;
  for (let k = 1; k <= TEN_YEAR_RULE; k++) {
    const year = L + k;
    const withdrawal = balance / (TEN_YEAR_RULE + 1 - k);
    const perHeir = withdrawal / count;
    let tax: number;
    let perHeirTaxableIncome = 0;
    let bracketRate = 0;
    if (h.mode === 'rate') {
      tax = withdrawal * scenario.analysis.heirsTaxRate;
    } else {
      const without = computeTax(heirIncome(year, 0));
      const withIt = computeTax(heirIncome(year, perHeir));
      tax = (withIt.totalTax - without.totalTax) * count;
      perHeirTaxableIncome = withIt.ordinaryTaxableIncome;
      bracketRate = withIt.bracketRate;
    }
    schedule.push({ year, index: k, inheritedBalanceStart: balance, withdrawal, perHeirWithdrawal: perHeir, perHeirTaxableIncome, bracketRate, tax });
    balance = (balance - withdrawal) * (1 + r);
  }

  const withdrawals = schedule.reduce((s, y) => s + y.withdrawal, 0);
  const heirsTax = schedule.reduce((s, y) => s + y.tax, 0);
  // Withdrawals happen at the start of each year of the window; year k is k − 1 years after inheritance.
  const withdrawalsPv = schedule.reduce((s, y) => s + y.withdrawal * df(y.year), 0);
  const heirsTaxPv = schedule.reduce((s, y) => s + y.tax * df(y.year), 0);
  const roth = t?.endBalanceRoth ?? 0;
  const taxable = t?.endBalanceTaxable ?? 0;
  const cash = t?.endBalanceCash ?? 0;
  return {
    inheritanceYear: L,
    pretax,
    roth,
    taxable,
    cash,
    schedule,
    withdrawals,
    heirsTax,
    withdrawalsPv,
    heirsTaxPv,
    effectiveRate: withdrawalsPv > 0 ? heirsTaxPv / withdrawalsPv : h.mode === 'rate' ? scenario.analysis.heirsTaxRate : 0,
    highestBracket: Math.max(0, ...schedule.map((y) => y.bracketRate)),
    netToHeirsPv: (roth + taxable + cash) * df(L + 1) + withdrawalsPv - heirsTaxPv,
  };
}
