import type { ConversionTaxSource, Scenario } from '../types';
import { computeTax, householdIncomeForYear, NO_SIDE_INCOME, type IraIncome } from './federalTax';
import { surchargeForIncome } from './irmaa';

export interface SideBalances {
  taxable: number;
  basis: number;
  cash: number;
}

export interface SettleInput {
  scenario: Scenario;
  year: number;
  /** The year's household IRA income (taxable distributions, conversions, deductible contributions). */
  ira: IraIncome;
  /** Cash actually received from taxable IRA withdrawals (RMDs and extra withdrawals). */
  iraCash: number;
  start: SideBalances;
  /** Roth IRA balance available after the year's conversions and contributions. */
  rothAvailable: number;
  /** IRMAA surcharge caused by modeled income two years earlier, due this year. */
  irmaaDue: number;
  spendingTarget: number;
  source: ConversionTaxSource;
}

export interface SettleResult {
  dividends: number;
  cashInterest: number;
  realizedGain: number;
  taxOnModeledIncome: number;
  conversionTax: number;
  conversionTaxWithheld: number;
  conversionTaxFromTaxable: number;
  conversionTaxFromCash: number;
  /** True when the chosen account could not cover the conversion tax. */
  conversionTaxFellBack: boolean;
  irmaaPaid: number;
  spending: number;
  spendingShortfall: number;
  invested: number;
  withdrawnTaxable: number;
  withdrawnCash: number;
  withdrawnRoth: number;
  /** Balances after the year's flows, before growth. */
  after: SideBalances;
  /** MAGI used for this year's IRMAA, and the surcharge it causes two years later beyond entered income alone. */
  magi: number;
  irmaaScheduled: number;
}

const MAX_ITERATIONS = 50;

/**
 * Settles one year's household cash flows outside the IRAs. Order:
 *   1) IRA withdrawals pay the tax on modeled income other than the conversion
 *      tax, any IRMAA due, and spending; what is left is invested in the
 *      taxable account;
 *   2) the conversion tax is paid from the chosen source (then the other
 *      account, then withheld from the conversion);
 *   3) any amount still owed comes from the taxable account, then cash, then
 *      the Roth IRA (tax-free).
 * Tax on modeled income = total tax − tax on the entered income alone, so the
 * client's other income is assumed to pay its own tax. Selling from the
 * taxable account realizes gains in proportion to unrealized gain; because those
 * gains are taxed, the year is recalculated until the realized gain settles.
 */
export function settleHouseholdYear(i: SettleInput): SettleResult {
  const cf = i.scenario.cashFlow;
  const dividends = i.start.taxable * cf.taxableYield;
  const cashInterest = i.start.cash * cf.cashRate;
  const enteredTax = computeTax(
    householdIncomeForYear(i.scenario, i.year, { taxableIra: 0, conversion: 0, deductibleContributions: 0 }, NO_SIDE_INCOME),
  ).totalTax;

  let gain = 0;
  let result: SettleResult | null = null;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const side = { qualified: dividends + gain, ordinary: cashInterest };
    const allIncome = householdIncomeForYear(i.scenario, i.year, i.ira, side);
    const all = computeTax(allIncome).totalTax;
    const noConv = computeTax(householdIncomeForYear(i.scenario, i.year, { ...i.ira, conversion: 0 }, side)).totalTax;
    const conversionTax = Math.max(0, all - noConv);
    const restTax = Math.max(0, noConv - enteredTax);

    let taxable = i.start.taxable;
    let basis = i.start.basis;
    let cash = i.start.cash;
    let roth = i.rothAvailable;
    let realized = 0;
    let withdrawnTaxable = 0;
    let withdrawnCash = 0;
    let withdrawnRoth = 0;
    const fromTaxable = (want: number) => {
      const w = Math.min(Math.max(0, want), Math.max(0, taxable));
      if (w <= 0) return 0;
      const basisShare = taxable > 0 ? Math.min(1, basis / taxable) : 1;
      realized += w * (1 - basisShare);
      basis -= w * basisShare;
      taxable -= w;
      withdrawnTaxable += w;
      return w;
    };
    const fromCash = (want: number) => {
      const w = Math.min(Math.max(0, want), Math.max(0, cash));
      cash -= w;
      withdrawnCash += w;
      return w;
    };
    const fromRoth = (want: number) => {
      const w = Math.min(Math.max(0, want), Math.max(0, roth));
      roth -= w;
      withdrawnRoth += w;
      return w;
    };

    // 1) IRA cash pays the rest of the tax, IRMAA, and spending; any excess is invested.
    let need = restTax + i.irmaaDue + i.spendingTarget;
    const paidFromIra = Math.min(i.iraCash, need);
    need -= paidFromIra;
    const invested = i.iraCash - paidFromIra;
    taxable += invested;
    basis += invested;

    // 2) Conversion tax, from the chosen source (which now includes any newly invested IRA cash).
    let convFromTaxable = 0;
    let convFromCash = 0;
    let convWithheld = 0;
    if (i.source === 'withhold') convWithheld = conversionTax;
    else {
      let owed = conversionTax;
      if (i.source === 'taxable') {
        convFromTaxable = fromTaxable(owed);
        owed -= convFromTaxable;
        convFromCash = fromCash(owed);
        owed -= convFromCash;
      } else {
        convFromCash = fromCash(owed);
        owed -= convFromCash;
        convFromTaxable = fromTaxable(owed);
        owed -= convFromTaxable;
      }
      convWithheld = Math.max(0, owed);
    }

    // 3) Anything still owed: taxable account, then cash, then Roth.
    need -= fromTaxable(need);
    need -= fromCash(need);
    need -= fromRoth(need);
    const unpaid = Math.max(0, need);
    // Unpaid amounts reduce spending first; taxes and IRMAA are always counted as paid.
    const spendingShortfall = Math.min(unpaid, i.spendingTarget);

    const magi = computeTax(allIncome).irmaaMagi;
    const enteredMagi = computeTax(
      householdIncomeForYear(i.scenario, i.year, { taxableIra: 0, conversion: 0, deductibleContributions: 0 }, NO_SIDE_INCOME),
    ).irmaaMagi;
    result = {
      dividends,
      cashInterest,
      realizedGain: realized,
      taxOnModeledIncome: conversionTax + restTax,
      conversionTax,
      conversionTaxWithheld: convWithheld,
      conversionTaxFromTaxable: convFromTaxable,
      conversionTaxFromCash: convFromCash,
      conversionTaxFellBack: i.source !== 'withhold' && convWithheld > 0.5,
      irmaaPaid: i.irmaaDue,
      spending: i.spendingTarget - spendingShortfall,
      spendingShortfall,
      invested,
      withdrawnTaxable,
      withdrawnCash,
      withdrawnRoth,
      after: { taxable, basis, cash },
      magi,
      irmaaScheduled: Math.max(
        0,
        surchargeForIncome(i.scenario, i.year, magi) - surchargeForIncome(i.scenario, i.year, enteredMagi),
      ),
    };
    if (Math.abs(realized - gain) < 0.01) break;
    gain = realized;
  }
  return result!;
}
