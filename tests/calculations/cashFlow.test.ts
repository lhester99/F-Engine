import { describe, expect, it } from 'vitest';
import { runComparison, runProjection } from '../../src/calculations/projection';
import { compareWealth } from '../../src/calculations/wealth';
import type { ProjectionResult } from '../../src/types';
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
const year = (r: ProjectionResult, y: number) => r.years.find((x) => x.year === y)!;

/** Born 1962 (age 64 in 2026), single, no other income, $400,000 IRA, 0% return, $100,000 conversion in 2026. */
const conversionCase = (cashFlow: object, source: 'withhold' | 'taxable' | 'cash') =>
  runProjection(
    scenario({
      dob: '1962-01-02',
      endAge: 64,
      traditional: [400_000],
      analysis: NONE,
      cashFlow: { ...EMPTY_SIDE, ...cashFlow },
      strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 100_000 }], conversionTaxSource: source },
    }),
  );

describe('paying the conversion tax', () => {
  // Tax on a $100,000 conversion with no other income: 13,170 (see federalTax tests).
  it('from the taxable account: the full conversion reaches the Roth IRA', () => {
    const r = conversionCase({ taxableBalance: 50_000, taxableBasis: 50_000 }, 'taxable');
    const h = year(r, 2026).household;
    expect(h.conversionTax).toBeCloseTo(13_170, 6);
    expect(h.conversionTaxFromTaxable).toBeCloseTo(13_170, 6);
    expect(h.taxableEnd).toBeCloseTo(36_830, 6);
    expect(year(r, 2026).totals.endBalanceRoth).toBe(100_000);
  });

  it('from cash, falling back to withholding when cash runs out', () => {
    // Cash 5,000 pays part; the other 8,170 is withheld → Roth receives 91,830.
    const r = conversionCase({ cashBalance: 5_000 }, 'cash');
    const h = year(r, 2026).household;
    expect(h.conversionTaxFromCash).toBe(5_000);
    expect(h.conversionTaxWithheld).toBeCloseTo(8_170, 6);
    expect(year(r, 2026).totals.endBalanceRoth).toBeCloseTo(91_830, 6);
    expect(r.messages.some((m) => m.code === 'conversion-tax-fallback')).toBe(true);
  });

  it('taxes gains realized by selling to pay the tax, until it settles', () => {
    // Taxable account 100,000 with basis 50,000: half of every dollar sold is gain, taxed at 15%
    // (ordinary income of 83,900 already fills the 0% band).
    // Withdrawal w = 13,170 + 15% × 0.5 × w → w = 13,170 / 0.925 = 14,237.84; gain = 7,118.92.
    const r = conversionCase({ taxableBalance: 100_000, taxableBasis: 50_000 }, 'taxable');
    const h = year(r, 2026).household;
    expect(h.withdrawnTaxable).toBeCloseTo(14_237.84, 2);
    expect(h.realizedGain).toBeCloseTo(7_118.92, 2);
    expect(h.conversionTax).toBeCloseTo(14_237.84, 2);
    expect(h.taxableBasisEnd).toBeCloseTo(50_000 - 7_118.92, 2);
    expect(year(r, 2026).totals.sideQualifiedIncome).toBeCloseTo(7_118.92, 2);
  });
});

describe('unneeded RMDs', () => {
  // Born 1951, age 75 in 2026, single, no other income. $2,460,000 → RMD $100,000.
  // Deductions: 16,100 + 2,050 + senior (6,000 − 6% × 25,000 = 4,500) = 22,650 → taxable 77,350
  // Tax = 1,240 + 4,560 + 26,950 × 22% = 11,729.
  const rmdCase = (spending: number) =>
    runProjection(
      scenario({
        dob: '1951-01-15',
        endAge: 75,
        traditional: [2_460_000],
        analysis: NONE,
        cashFlow: { ...EMPTY_SIDE, spendingFromIra: spending },
      }),
    );

  it('pays its own tax and the rest is invested in the taxable account', () => {
    const h = year(rmdCase(0), 2026).household;
    expect(h.iraCashReceived).toBeCloseTo(100_000, 6);
    expect(h.taxOnModeledIncome).toBeCloseTo(11_729, 6);
    expect(h.invested).toBeCloseTo(88_271, 6);
    expect(h.taxableEnd).toBeCloseTo(88_271, 6);
    expect(h.taxableBasisEnd).toBeCloseTo(88_271, 6);
  });

  it('spending comes out before investing', () => {
    const h = year(rmdCase(30_000), 2026).household;
    expect(h.spending).toBe(30_000);
    expect(h.invested).toBeCloseTo(58_271, 6);
  });

  it('spending not covered by RMDs comes from the taxable account, cash, then the Roth IRA', () => {
    // No pre-tax money; Roth $100,000; spend $20,000.
    const r = runProjection(
      scenario({
        dob: '1960-03-01',
        endAge: 66,
        traditional: [0],
        roth: 100_000,
        analysis: NONE,
        cashFlow: { ...EMPTY_SIDE, spendingFromIra: 20_000 },
      }),
    );
    expect(year(r, 2026).household.withdrawnRoth).toBe(20_000);
    expect(year(r, 2026).totals.endBalanceRoth).toBe(80_000);
  });
});

describe('taxable account and cash', () => {
  it('taxes dividends each year and adds them to basis', () => {
    // 100,000 at 5% return with a 2% yield: dividends 2,000 (0% rate with no other income);
    // end 105,000, basis 102,000.
    const r = runProjection(
      scenario({
        dob: '1962-01-01',
        endAge: 64,
        rate: 0.05,
        traditional: [0],
        analysis: NONE,
        cashFlow: { ...EMPTY_SIDE, taxableBalance: 100_000, taxableBasis: 100_000, taxableYield: 0.02 },
      }),
    );
    const h = year(r, 2026).household;
    expect(h.dividends).toBe(2_000);
    expect(h.taxOnModeledIncome).toBe(0);
    expect(h.taxableEnd).toBeCloseTo(105_000, 6);
    expect(h.taxableBasisEnd).toBeCloseTo(102_000, 6);
  });

  it('pays the IRMAA increase two years after the income that caused it', () => {
    // Born 1958, other income 100,000 (0% inflation); converting 50,000 in 2026 → MAGI 150,000 → tier 2 in 2028.
    // Entered income alone (100,000) is below tier 1, so the whole $2,884.80 is caused by the conversion.
    const r = runProjection(
      scenario({
        dob: '1958-05-05',
        endAge: 70,
        traditional: [800_000],
        analysis: { ...NONE, otherOrdinaryIncome: 100_000, inflationRate: 0 },
        cashFlow: { ...EMPTY_SIDE, taxableBalance: 1_000_000, taxableBasis: 1_000_000 },
        strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 50_000 }] },
      }),
    );
    expect(year(r, 2026).household.irmaaPaid).toBe(0);
    expect(year(r, 2028).household.irmaaPaid).toBeCloseTo(2_884.8, 6);
  });
});

describe('after-tax value and breakeven age', () => {
  it('values pre-tax money at the heirs’ rate', () => {
    // $1,000,000 pre-tax, nothing else, 0% return, heirs at 24% → 760,000.
    const r = runProjection(
      scenario({ dob: '1965-01-01', endAge: 62, traditional: [1_000_000], analysis: { ...NONE, heirsTaxRate: 0.24 }, cashFlow: EMPTY_SIDE }),
    );
    expect(year(r, 2026).totals.afterTaxValue).toBeCloseTo(760_000, 6);
  });

  it('a conversion taxed below the heirs’ rate is ahead right away; above it, never at 0% growth', () => {
    // Converting 100,000 costs 13,170 (13.2%) vs. 24,000 of heirs' tax avoided → +10,830 immediately.
    const make = (heirs: number) => {
      const s = scenario({
        dob: '1965-01-01',
        endAge: 62,
        traditional: [1_000_000],
        analysis: { ...NONE, heirsTaxRate: heirs },
        cashFlow: { ...EMPTY_SIDE, taxableBalance: 100_000, taxableBasis: 100_000 },
        strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 100_000 }] },
      });
      const { baseline, strategy } = runComparison(s);
      return compareWealth(baseline, strategy);
    };
    const ahead = make(0.24);
    expect(ahead.endStrategy - ahead.endBaseline).toBeCloseTo(10_830, 6);
    expect(ahead.breakevenAge).toBe(61);
    expect(ahead.crossesOver).toBe(false);
    const behind = make(0.1);
    expect(behind.breakevenAge).toBeNull();
  });

  it('finds the age where a strategy that starts behind pulls ahead', () => {
    const points = [
      { totals: { afterTaxValue: 100 } },
      { totals: { afterTaxValue: 110 } },
      { totals: { afterTaxValue: 120 } },
    ];
    const strat = [90, 112, 125];
    const mk = (vals: number[]) =>
      ({ years: vals.map((v, i) => ({ year: 2026 + i, age: 70 + i, totals: { afterTaxValue: v } })) }) as unknown as ProjectionResult;
    const w = compareWealth(mk(points.map((p) => p.totals.afterTaxValue)), mk(strat));
    expect(w.breakevenAge).toBe(71);
    expect(w.crossesOver).toBe(true);
  });
});
