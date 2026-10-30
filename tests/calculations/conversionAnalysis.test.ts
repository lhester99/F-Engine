import { describe, expect, it } from 'vitest';
import { analyzeConversions } from '../../src/calculations/conversionAnalysis';
import { incomeByYear, surchargeForIncome } from '../../src/calculations/irmaa';
import { runComparison } from '../../src/calculations/projection';
import { compareTaxes } from '../../src/calculations/taxComparison';
import { compareWealth } from '../../src/calculations/wealth';
import type { Scenario } from '../../src/types';
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

const analyze = (s: Scenario) => {
  const { baseline, strategy } = runComparison(s);
  const bi = incomeByYear(baseline, s);
  const si = incomeByYear(strategy, s);
  const tax = compareTaxes(baseline, strategy, s);
  return { a: analyzeConversions(s, strategy, bi, si, tax, compareWealth(baseline, strategy)), tax, si };
};

describe('Roth conversion analysis', () => {
  it('a $100,000 conversion with no other income adds $13,170 (single, under 65, 2026)', () => {
    const { a } = analyze(
      scenario({
        dob: '1962-01-02',
        endAge: 64,
        traditional: [400_000],
        analysis: NONE,
        cashFlow: { ...EMPTY_SIDE, cashBalance: 50_000 },
        strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 100_000 }], conversionTaxSource: 'cash' },
      }),
    );
    expect(a.years).toHaveLength(1);
    const y = a.years[0]!;
    // Tax without the conversion: no income, so $0. With it: 10% and 12% and 22% brackets on $83,900.
    expect(y.taxWithout).toBe(0);
    expect(y.addedTax).toBeCloseTo(13_170, 6);
    expect(y.bracketWith).toBe(0.22);
    // Under 65 in 2028, so no Medicare surcharge.
    expect(y.addedIrmaa).toBe(0);
    expect(y.ratePerDollar).toBeCloseTo(0.1317, 10);
    expect(y.paidFromCash).toBeCloseTo(13_170, 6);
    expect(a.totalConverted).toBe(100_000);
    expect(a.averageRate).toBeCloseTo(0.1317, 10);
    expect(a.chart[0]!.strategyBase + a.chart[0]!.strategyAdded).toBeCloseTo(13_170, 6);
  });

  it('counts the Medicare surcharge a conversion triggers two years later', () => {
    // Age 70, no other income: a $150,000 conversion lifts MAGI from $0 into a surcharge tier.
    const s = scenario({
      dob: '1956-03-01',
      endAge: 72,
      traditional: [1_000_000],
      analysis: NONE,
      cashFlow: { ...EMPTY_SIDE, cashBalance: 100_000 },
      strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 150_000 }], conversionTaxSource: 'cash' },
    });
    const { a, si } = analyze(s);
    const y = a.years[0]!;
    expect(y.irmaaTierWithout).toBe(0);
    expect(y.irmaaTierWith).toBeGreaterThan(0);
    expect(y.addedIrmaa).toBeCloseTo(surchargeForIncome(s, 2026, si[0]!.magi), 6);
    expect(y.addedIrmaa).toBeGreaterThan(0);
    expect(y.premiumYear).toBe(2028);
    expect(y.totalAdded).toBeCloseTo(y.addedTax + y.addedIrmaa, 6);
    expect(a.totalAddedIrmaa).toBeCloseTo(y.addedIrmaa, 6);
  });

  it('uses the plan-wide breakeven rate and breakeven age', () => {
    const s = scenario({
      dob: '1956-03-01',
      endAge: 95,
      rate: 0.05,
      traditional: [1_500_000],
      strategy: { conversions: [70, 71, 72].map((age) => ({ personId: 'p1', year: 1956 + age, amount: 100_000 })) },
    });
    const { a, tax } = analyze(s);
    expect(a.years.map((y) => y.age)).toEqual([70, 71, 72]);
    expect(a.firstAge).toBe(70);
    expect(a.lastAge).toBe(72);
    expect(a.breakevenRate).toBe(tax.breakevenHeirsRate);
    expect(a.assumedLaterRate).toBe(s.analysis.heirsTaxRate);
    // Later RMDs are smaller, so some later years' tax is lower.
    expect(a.laterTaxReduced).toBeGreaterThan(0);
  });
});
