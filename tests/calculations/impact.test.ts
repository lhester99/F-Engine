import { describe, expect, it } from 'vitest';
import { computeImpact, inTodaysDollars } from '../../src/calculations/impact';
import { runComparison } from '../../src/calculations/projection';
import { compareTaxes } from '../../src/calculations/taxComparison';
import { compareWealth } from '../../src/calculations/wealth';
import { scenario } from './helpers';

const build = () => {
  const s = scenario({
    dob: '1955-03-01',
    endAge: 90,
    rate: 0.05,
    traditional: [1_500_000],
    roth: 100_000,
    strategy: { conversions: [71, 72, 73].map((a) => ({ personId: 'p1', year: 1955 + a, amount: 100_000 })) },
  });
  const { baseline, strategy } = runComparison(s);
  const tax = compareTaxes(baseline, strategy, s);
  const wealth = compareWealth(baseline, strategy);
  return { s, baseline, strategy, tax, wealth, impact: computeImpact(baseline, strategy, tax, wealth, s)! };
};

describe('impact figures', () => {
  it('match the projection, the Wealth tab, and the Heirs tab', () => {
    const { baseline, strategy, tax, wealth, impact } = build();
    const bEnd = baseline.years[baseline.years.length - 1]!.totals;
    const sEnd = strategy.years[strategy.years.length - 1]!.totals;
    expect(impact.endAge).toBe(90);
    expect(impact.mix.baseline.pretax).toBeCloseTo(bEnd.endBalancePretax, 6);
    expect(impact.mix.strategy.roth).toBeCloseTo(sEnd.endBalanceRoth, 6);
    expect(impact.mix.strategy.outside).toBeCloseTo(sEnd.endBalanceTaxable + sEnd.endBalanceCash, 6);
    // Conversions move money from pre-tax to Roth.
    expect(impact.mix.strategy.pretax).toBeLessThan(impact.mix.baseline.pretax);
    expect(impact.mix.strategy.roth).toBeGreaterThan(impact.mix.baseline.roth);
    expect(impact.afterTax.baseline.total).toBeCloseTo(wealth.endBaseline, 6);
    expect(impact.afterTax.strategy.total).toBeCloseTo(wealth.endStrategy, 6);
    // At the entered 24% heirs' rate, the pre-tax part is 76% of the pre-tax balance.
    expect(impact.afterTax.baseline.pretax).toBeCloseTo(bEnd.endBalancePretax * 0.76, 4);
    expect(impact.heirs.baseline.total).toBeCloseTo(tax.baseline.legacy.netToHeirsPv, 6);
    expect(impact.heirs.strategy.roth).toBeCloseTo(tax.strategy.legacy.rothAtWithdrawalPv, 6);
  });

  it("converts to today's dollars at the entered inflation rate", () => {
    const { s, impact } = build();
    // 2026 through 2045 is 20 years of inflation to December 31, 2045.
    expect(impact.endYear).toBe(2045);
    expect(impact.inflationFactor).toBeCloseTo((1 + s.analysis.inflationRate) ** 20, 10);
    const today = inTodaysDollars(impact.mix.strategy, impact.inflationFactor);
    expect(today.total).toBeCloseTo(impact.mix.strategy.total / impact.inflationFactor, 6);
  });
});
