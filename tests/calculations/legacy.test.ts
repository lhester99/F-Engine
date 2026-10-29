import { describe, expect, it } from 'vitest';
import { computeLegacy } from '../../src/calculations/legacy';
import { runComparison, runProjection } from '../../src/calculations/projection';
import { compareTaxes } from '../../src/calculations/taxComparison';
import { compareWealth } from '../../src/calculations/wealth';
import { scenario } from './helpers';

const NONE = {
  socialSecurityBenefit: 0,
  otherOrdinaryIncome: 0,
  qualifiedInvestmentIncome: 0,
  taxExemptInterest: 0,
  itemizedDeductions: 0,
  stateTaxRate: 0,
};
const EMPTY_SIDE = { taxableBalance: 0, taxableBasis: 0, taxableYield: 0, cashBalance: 0, cashRate: 0, spendingFromIra: 0 };

describe('heirs under the 10-year rule', () => {
  it('withdraws the inherited IRA evenly over 10 years at the heirs’ rate', () => {
    // Born 1965, one projection year (2026) at 5%: $1,000,000 → $1,050,000 inherited at the end of 2026.
    // Year k withdraws balance ÷ (11 − k): w1 = 105,000; the rest grows 5%, so w_k = 105,000 × 1.05^(k−1).
    // Total = 105,000 × (1.05^10 − 1) / 0.05 = 1,320,678.72; heirs' tax at 24% = 316,962.89.
    // Discounting at the 5% return, the withdrawals are worth exactly the inherited balance.
    const s = scenario({
      dob: '1965-01-01',
      endAge: 61,
      rate: 0.05,
      traditional: [1_000_000],
      analysis: { ...NONE, heirsTaxRate: 0.24 },
      cashFlow: EMPTY_SIDE,
    });
    const r = runProjection(s);
    const l = computeLegacy(r, s, 0.05);
    expect(l.inheritanceYear).toBe(2026);
    expect(l.pretax).toBeCloseTo(1_050_000, 6);
    expect(l.schedule).toHaveLength(10);
    expect(l.schedule[0]!.withdrawal).toBeCloseTo(105_000, 6);
    expect(l.schedule[1]!.withdrawal).toBeCloseTo(110_250, 6);
    expect(l.schedule[9]!.withdrawal).toBeCloseTo(105_000 * 1.05 ** 9, 4);
    expect(l.withdrawals).toBeCloseTo(1_320_678.72, 2);
    expect(l.heirsTax).toBeCloseTo(316_962.89, 2);
    expect(l.withdrawalsPv).toBeCloseTo(1_050_000 / 1.05, 4);
    expect(l.effectiveRate).toBeCloseTo(0.24, 10);
    expect(l.netToHeirsPv).toBeCloseTo((1_050_000 * 0.76) / 1.05, 4);
  });

  const incomeCase = (count: number) => {
    // $1,000,000 inherited, 0% return and inflation → $100,000 a year in total.
    // Each heir: $150,000 other income, married filing jointly → 150,000 − 32,200 = 117,800 taxable (22% bracket).
    const s = scenario({
      dob: '1965-01-01',
      endAge: 61,
      traditional: [1_000_000],
      analysis: { ...NONE, inflationRate: 0 },
      cashFlow: EMPTY_SIDE,
      heirs: { mode: 'income', count, otherIncome: 150_000, filingStatus: 'joint', stateTaxRate: 0 },
    });
    return computeLegacy(runProjection(s), s, 0);
  };

  it('two heirs: $50,000 each a year stays in the 22% bracket', () => {
    // 117,800 + 50,000 = 167,800 < 211,400 → 50,000 × 22% = 11,000 per heir → 22,000 a year.
    const l = incomeCase(2);
    expect(l.schedule[0]!.perHeirWithdrawal).toBeCloseTo(50_000, 6);
    expect(l.schedule[0]!.tax).toBeCloseTo(22_000, 6);
    expect(l.heirsTax).toBeCloseTo(220_000, 6);
    expect(l.effectiveRate).toBeCloseTo(0.22, 10);
    expect(l.highestBracket).toBe(0.22);
  });

  it('one heir: $100,000 a year pushes into the 24% bracket', () => {
    // 117,800 + 100,000 = 217,800: 93,600 × 22% + 6,400 × 24% = 20,592 + 1,536 = 22,128 a year.
    const l = incomeCase(1);
    expect(l.schedule[0]!.tax).toBeCloseTo(22_128, 6);
    expect(l.schedule[0]!.perHeirTaxableIncome).toBeCloseTo(217_800, 6);
    expect(l.highestBracket).toBe(0.24);
    expect(l.effectiveRate).toBeCloseTo(0.22128, 10);
  });

  it('feeds heirs’ tax into the tax comparison and after-tax value', () => {
    const s = scenario({
      dob: '1965-01-01',
      endAge: 62,
      traditional: [1_000_000],
      analysis: { ...NONE, inflationRate: 0, discountMatchesReturn: false, discountRate: 0 },
      cashFlow: { ...EMPTY_SIDE, taxableBalance: 200_000, taxableBasis: 200_000 },
      heirs: { mode: 'income', count: 1, otherIncome: 150_000, filingStatus: 'joint', stateTaxRate: 0 },
      strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 300_000 }] },
    });
    const { baseline, strategy } = runComparison(s);
    const t = compareTaxes(baseline, strategy, s);
    // Baseline leaves $1,000,000 pre-tax (one heir, 24% top bracket); strategy leaves $700,000 ($70,000 a year, 22%).
    expect(t.baseline.legacy.highestBracket).toBe(0.24);
    expect(t.strategy.legacy.highestBracket).toBe(0.22);
    expect(t.strategy.legacy.effectiveRate).toBeLessThan(t.baseline.legacy.effectiveRate);
    expect(t.baseline.heirsTax).toBeCloseTo(t.baseline.legacy.heirsTax, 6);
    const w = compareWealth(baseline, strategy, { baseline: t.baseline.legacy.effectiveRate, strategy: t.strategy.legacy.effectiveRate });
    const last = baseline.years[baseline.years.length - 1]!.totals;
    expect(w.endBaseline).toBeCloseTo(
      last.endBalanceRoth + last.endBalanceTaxable + last.endBalanceCash + last.endBalancePretax * (1 - t.baseline.legacy.effectiveRate),
      6,
    );
  });

  it('rejects invalid heir inputs in income mode', () => {
    const r = runProjection(scenario({ dob: '1965-01-01', endAge: 61, heirs: { mode: 'income', count: 0, otherIncome: -1 } }));
    expect(r.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['heirs-count', 'heirs-income']));
  });
});
