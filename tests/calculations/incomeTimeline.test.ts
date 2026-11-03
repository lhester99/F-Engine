import { describe, expect, it } from 'vitest';
import { computeTax, householdIncomeForYear } from '../../src/calculations/federalTax';
import { incomeItemForYear, incomeItemsForYear } from '../../src/calculations/income';
import { incomeByYear } from '../../src/calculations/irmaa';
import { runProjection } from '../../src/calculations/projection';
import type { IncomeItem, Scenario } from '../../src/types';
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
const item = (patch: Partial<IncomeItem>): IncomeItem => ({
  id: 'i',
  kind: 'wages',
  ownerId: 'p1',
  amount: 100_000,
  startAge: null,
  endAge: null,
  growsWithInflation: true,
  survivorShare: 0,
  ...patch,
});
// Client born 1962: age 64 in 2026.
const base = (items: IncomeItem[], extra: Partial<Parameters<typeof scenario>[0]> = {}): Scenario => ({
  ...scenario({ dob: '1962-06-01', endAge: 75, traditional: [1_000_000], analysis: { ...NONE, inflationRate: 0.03 }, cashFlow: EMPTY_SIDE, ...extra }),
  incomeItems: items,
});

describe('income timeline', () => {
  it('pays an item only between its start and end ages (the owner’s ages)', () => {
    const s = base([item({ startAge: 66, endAge: 68 })]);
    expect(incomeItemForYear(s, s.incomeItems![0]!, 2027)).toBe(0); // age 65
    expect(incomeItemForYear(s, s.incomeItems![0]!, 2028)).toBeGreaterThan(0); // 66
    expect(incomeItemForYear(s, s.incomeItems![0]!, 2030)).toBeGreaterThan(0); // 68
    expect(incomeItemForYear(s, s.incomeItems![0]!, 2031)).toBe(0); // 69
  });

  it('grows with inflation from today, or stays a fixed amount', () => {
    const s = base([item({ id: 'a' }), item({ id: 'b', growsWithInflation: false })]);
    expect(incomeItemForYear(s, s.incomeItems![0]!, 2028)).toBeCloseTo(100_000 * 1.03 ** 2, 6);
    expect(incomeItemForYear(s, s.incomeItems![1]!, 2028)).toBe(100_000);
  });

  it('continues at the survivor share after the owner’s death', () => {
    const s = base([item({ kind: 'pension', survivorShare: 0.5, growsWithInflation: false })], {
      spouse: { dob: '1964-01-01' },
      survivorship: { enabled: true, firstDeathPersonId: 'p1', deathAge: 66 },
    });
    expect(incomeItemForYear(s, s.incomeItems![0]!, 2028)).toBe(100_000); // death year: full amount
    expect(incomeItemForYear(s, s.incomeItems![0]!, 2029)).toBe(50_000);
  });

  it('counts rental, interest, and non-qualified annuity income toward the NIIT, not wages or pensions', () => {
    const s = base([
      item({ id: 'w', kind: 'wages', amount: 280_000, growsWithInflation: false }),
      item({ id: 'r', kind: 'rental', amount: 20_000, growsWithInflation: false }),
    ]);
    const t = incomeItemsForYear(s, 2026);
    expect(t.ordinary).toBe(300_000);
    expect(t.netInvestment).toBe(20_000);
    // Single: MAGI 300,000 is 100,000 over $200,000; NIIT on the smaller, the $20,000 of rental income.
    const tax = computeTax(householdIncomeForYear(s, 2026, { taxableIra: 0, conversion: 0, deductibleContributions: 0 }));
    expect(tax.niit).toBeCloseTo(0.038 * 20_000, 6);
  });

  it('opens room to convert when wages stop (a fill-to-bracket conversion grows in the gap year)', () => {
    const s = base([item({ amount: 150_000, endAge: 65, growsWithInflation: false })], {
      strategy: { bracketFills: [{ id: 'f', personId: 'p1', startAge: 64, endAge: 67, bracketRate: 0.22, irmaaMaxTier: null }] },
    });
    const r = runProjection(s);
    const conv = (y: number) => r.years.find((x) => x.year === y)!.totals.conversionGross;
    // Ages 64–65: $150,000 of wages already fills most of the 22% bracket. Age 66: wages stop.
    expect(conv(2028)).toBeGreaterThan(conv(2027) + 100_000);
    const inc = incomeByYear(r, s);
    expect(inc.find((y) => y.year === 2027)!.timelineIncome).toBe(150_000);
    expect(inc.find((y) => y.year === 2028)!.timelineIncome).toBe(0);
  });
});
