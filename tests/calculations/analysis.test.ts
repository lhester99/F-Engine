import { describe, expect, it } from 'vitest';
import { buildFindings } from '../../src/calculations/findings';
import {
  annualIrmaaSurcharge,
  incomeByYear,
  irmaaScheduleForYear,
  irmaaTier,
  summarizeIrmaa,
} from '../../src/calculations/irmaa';
import { runComparison, runProjection } from '../../src/calculations/projection';
import { summarize } from '../../src/calculations/summary';
import { compareTaxes, validateAnalysis } from '../../src/calculations/taxComparison';
import { IRMAA_2026 } from '../../src/data/irmaa';
import { DEFAULT_ANALYSIS } from '../../src/utils/defaultScenario';
import type { ProjectionResult } from '../../src/types';
import { scenario } from './helpers';

const year = (r: ProjectionResult, y: number) => r.years.find((x) => x.year === y)!;

describe('QCD offset for deductible IRA contributions after 70½', () => {
  // Born 1951-01-15: 70½ on 2021-07-15. Age 75 in 2026 (24.6), 76 in 2027 (23.7).
  // $2,460,000 → 2026 RMD $100,000. Deductible contribution $7,000/yr; QCD $20,000/yr; return 0%.
  // 2026: offset pool 7,000 → $7,000 of the QCD is taxable.
  //   taxable = (100,000 − 20,000) + 7,000 = 87,000; distributions = 100,000
  //   end = 2,460,000 − 100,000 + 7,000 = 2,367,000
  // 2027: RMD = 2,367,000 / 23.7 = 99,873.42; pool 7,000 again
  //   taxable = 99,873.42 − 20,000 + 7,000 = 86,873.42
  const make = (deductible: boolean) =>
    runProjection(
      scenario({
        dob: '1951-01-15',
        endAge: 76,
        traditional: [2_460_000],
        tradContribution: { annualAmount: 7_000, throughAge: 76, deductible },
        strategy: { recurringQcds: [{ id: 'q', personId: 'p1', annualAmount: 20_000, startAge: 75, endAge: 76 }] },
      }),
    );

  it('makes part of the QCD taxable without changing the RMD it satisfies', () => {
    const r = make(true);
    const p = year(r, 2026).people[0]!;
    expect(p.requiredRmd).toBeCloseTo(100_000, 6);
    expect(p.qcd).toBe(20_000);
    expect(p.qcdTowardRmd).toBe(20_000);
    expect(p.qcdNotExcluded).toBe(7_000);
    expect(p.taxableDistribution).toBeCloseTo(87_000, 6);
    expect(p.totalDistributions).toBeCloseTo(100_000, 6); // QCD counted once
    expect(year(r, 2026).totals.endBalancePretax).toBeCloseTo(2_367_000, 6);
    expect(year(r, 2027).totals.requiredRmd).toBeCloseTo(99_873.42, 2);
    expect(year(r, 2027).totals.taxableDistribution).toBeCloseTo(86_873.42, 2);
    expect(r.messages.some((m) => m.code === 'qcd-contribution-offset')).toBe(true);
  });

  it('does not apply to non-deductible contributions', () => {
    const p = year(make(false), 2026).people[0]!;
    expect(p.qcdNotExcluded).toBe(0);
    expect(p.taxableDistribution).toBeCloseTo(80_000, 6);
    expect(p.deductibleContributions).toBe(0);
  });

  it('ignores contributions for years before the 70½ year and carries unused offset forward', () => {
    // Born 1957-01-10: 70½ on 2027-07-10. $5,000 deductible contributions in 2026 (age 69) and 2027 (age 70).
    // QCD $3,000 in 2027 and $10,000 in 2028.
    // 2026 contribution does not count. 2027 pool = 5,000 → 3,000 taxable, 2,000 carried.
    // 2028: no contribution (through age 70) → 2,000 of the $10,000 QCD is taxable.
    const r = runProjection(
      scenario({
        dob: '1957-01-10',
        endAge: 71,
        traditional: [500_000],
        tradContribution: { annualAmount: 5_000, throughAge: 70, deductible: true },
        strategy: {
          oneTimeQcds: [
            { id: 'a', personId: 'p1', year: 2027, amount: 3_000 },
            { id: 'b', personId: 'p1', year: 2028, amount: 10_000 },
          ],
        },
      }),
    );
    expect(year(r, 2027).people[0]!.qcdNotExcluded).toBe(3_000);
    expect(year(r, 2028).people[0]!.qcdNotExcluded).toBe(2_000);
    expect(year(r, 2028).people[0]!.taxableDistribution).toBe(2_000);
  });

  it('adds Traditional IRA contributions after the RMD, raising next year’s RMD basis', () => {
    // Born 1953-03-01, first RMD 2026. $1,000,000, 0% return, $10,000 contribution.
    // 2026 RMD = 1,000,000 / 26.5; end = 1,000,000 − 37,735.85 + 10,000 = 972,264.15
    const r = runProjection(
      scenario({ dob: '1953-03-01', endAge: 74, tradContribution: { annualAmount: 10_000, throughAge: 80 } }),
    );
    expect(year(r, 2026).totals.requiredRmd).toBeCloseTo(1_000_000 / 26.5, 8);
    expect(year(r, 2026).totals.endBalancePretax).toBeCloseTo(972_264.15, 2);
    expect(year(r, 2027).totals.requiredRmd).toBeCloseTo(972_264.150943 / 25.5, 4);
  });
});

describe('IRMAA', () => {
  it.each([
    [109_000, 'single', 0], // at the threshold: not more than it
    [109_001, 'single', 1],
    [137_001, 'single', 2],
    [171_001, 'single', 3],
    [205_001, 'single', 4],
    [499_999, 'single', 4],
    [500_000, 'single', 5], // top tier applies at the bound
    [218_000, 'joint', 0],
    [218_001, 'joint', 1],
    [750_000, 'joint', 5],
  ] as const)('MAGI %i (%s) → tier %i in 2026', (magi, status, tier) => {
    expect(irmaaTier(magi, status, IRMAA_2026)).toBe(tier);
  });

  it('computes annual surcharges per enrollee', () => {
    // Tier 2: Part B $202.90 + Part D $37.50 = $240.40/month → $2,884.80/yr each.
    expect(annualIrmaaSurcharge(2, IRMAA_2026, 1)).toBeCloseTo(2_884.8, 6);
    expect(annualIrmaaSurcharge(2, IRMAA_2026, 2)).toBeCloseTo(5_769.6, 6);
    expect(annualIrmaaSurcharge(0, IRMAA_2026, 2)).toBe(0);
  });

  it('projects later years: indexed and rounded to $1,000, top tier fixed through 2027', () => {
    expect(irmaaScheduleForYear(2025, 0.03)).toBeNull();
    expect(irmaaScheduleForYear(2026, 0.03)!.projected).toBe(false);
    const y2027 = irmaaScheduleForYear(2027, 0.03)!.schedule;
    // 109,000 × 1.03 = 112,270 → 112,000; 218,000 × 1.03 = 224,540 → 225,000
    expect(y2027.tiers[0]!.single).toBe(112_000);
    expect(y2027.tiers[0]!.joint).toBe(225_000);
    expect(y2027.tiers[4]!.single).toBe(500_000);
    const y2028 = irmaaScheduleForYear(2028, 0.03)!.schedule;
    // 109,000 × 1.0609 = 115,638 → 116,000; top 500,000 × 1.03 = 515,000
    expect(y2028.tiers[0]!.single).toBe(116_000);
    expect(y2028.tiers[4]!.single).toBe(515_000);
    expect(y2028.tiers[1]!.partB).toBeCloseTo(202.9 * 1.0609, 8);
  });

  it('builds MAGI with a two-year lookback and only once Medicare applies', () => {
    // Born 1958 (68 in 2026). Other income $100,000, 0% inflation; convert $50,000 in 2026.
    // MAGI 2026 = 100,000 + 50,000 = 150,000 → 2028 premiums in tier 2 ($2,884.80).
    const s = scenario({
      dob: '1958-05-05',
      endAge: 70,
      traditional: [800_000],
      analysis: { otherIncome: 100_000, inflationRate: 0, filingStatus: 'single', medicareEnrollees: 1 },
      strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 50_000 }] },
    });
    const income = incomeByYear(runProjection(s), s);
    expect(income[0]).toMatchObject({ year: 2026, premiumYear: 2028, magi: 150_000, tier: 2, medicareApplies: true });
    expect(income[0]!.annualSurcharge).toBeCloseTo(2_884.8, 6);
    expect(income[1]!.tier).toBe(0);
    // Premium years 2028 only are inside a projection that ends in 2028.
    expect(summarizeIrmaa(income, 2028)).toEqual({ yearsWithSurcharge: 1, highestTier: 2, totalSurcharge: income[0]!.annualSurcharge });

    const young = scenario({ dob: '1965-01-01', endAge: 63, traditional: [800_000], analysis: { otherIncome: 400_000 } });
    expect(incomeByYear(runProjection(young), young)[0]!.medicareApplies).toBe(false);
    expect(incomeByYear(runProjection(young), young)[0]!.tier).toBe(0);
  });

  it('subtracts deductible contributions from MAGI', () => {
    const s = scenario({
      dob: '1962-01-01',
      endAge: 64,
      traditional: [100_000],
      tradContribution: { annualAmount: 8_000, throughAge: 70 },
      analysis: { otherIncome: 120_000, inflationRate: 0 },
    });
    expect(incomeByYear(runProjection(s), s)[0]!.magi).toBe(112_000);
  });
});

describe('estimated tax comparison', () => {
  it('hand-calculated: one $100,000 conversion before RMD age', () => {
    // Born 1965, ages 61–62 (2026–2027), $1,000,000, 0% return. Convert $100,000 in 2026.
    // Added income: +100,000 in 2026 (t = 0) → PV 100,000.
    // Ending pre-tax balance: 900,000 vs 1,000,000 → −100,000 avoided, at t = 2 → PV 100,000 / 1.04² = 92,455.62.
    // Rates 22% added / 24% avoided, discount 4%.
    //   tax on added = 22,000; tax avoided = 24,000; net = +2,000
    //   PV: 22,000 vs 24,000 / 1.0816 = 22,189.35 → net PV = 189.35
    //   breakeven = 0.22 × 100,000 / 92,455.62 = 23.795%
    const s = scenario({
      dob: '1965-01-01',
      endAge: 62,
      traditional: [1_000_000],
      strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 100_000 }] },
      analysis: { addedIncomeTaxRate: 0.22, avoidedIncomeTaxRate: 0.24, discountRate: 0.04, discountMatchesReturn: false, otherIncome: 0 },
    });
    const { baseline, strategy } = runComparison(s);
    const t = compareTaxes(baseline, strategy, s);
    expect(t.addedIncome).toBeCloseTo(100_000, 6);
    expect(t.avoidedIncome).toBeCloseTo(100_000, 6);
    expect(t.endingPretaxDifference).toBeCloseTo(-100_000, 6);
    expect(t.avoidedIncomePv).toBeCloseTo(92_455.62, 2);
    expect(t.taxOnAdded).toBeCloseTo(22_000, 6);
    expect(t.taxAvoided).toBeCloseTo(24_000, 6);
    expect(t.netTax).toBeCloseTo(2_000, 6);
    expect(t.netTaxPv).toBeCloseTo(189.35, 2);
    expect(t.breakevenAvoidedRate!).toBeCloseTo(0.237952, 6);
    expect(t.irmaaDifference).toBe(0);
  });

  it('a conversion is tax-neutral when both rates are equal and the discount rate equals the return', () => {
    // Standard result: converting X costs t·X now; leaving it costs t·X·(1+r)^n later, worth t·X today at discount r.
    // Holds with RMDs too, because every pre-tax dollar's eventual tax has present value t × that dollar.
    const s = scenario({
      dob: '1956-06-15',
      endAge: 95,
      rate: 0.06,
      traditional: [1_750_000],
      strategy: { conversions: [2026, 2027, 2028, 2029, 2030].map((y) => ({ personId: 'p1', year: y, amount: 100_000 })) },
      analysis: { addedIncomeTaxRate: 0.24, avoidedIncomeTaxRate: 0.24, discountMatchesReturn: true },
    });
    const { baseline, strategy } = runComparison(s);
    const t = compareTaxes(baseline, strategy, s);
    expect(t.discountRate).toBe(0.06);
    expect(t.addedIncome).toBeGreaterThan(100_000);
    expect(Math.abs(t.netTaxPv)).toBeLessThan(0.01);
    expect(t.breakevenAvoidedRate!).toBeCloseTo(0.24, 10);
  });

  it('reports QCD gifts within avoided income', () => {
    const s = scenario({
      dob: '1951-01-15',
      endAge: 76,
      traditional: [2_460_000],
      strategy: { recurringQcds: [{ id: 'q', personId: 'p1', annualAmount: 20_000, startAge: 75, endAge: 76 }] },
    });
    const { baseline, strategy } = runComparison(s);
    expect(compareTaxes(baseline, strategy, s).qcdExcludedIncome).toBeCloseTo(40_000, 6);
  });

  it('with no strategy, nothing is added or avoided', () => {
    const s = scenario({ dob: '1955-01-01', endAge: 95, rate: 0.05 });
    const { baseline, strategy } = runComparison(s);
    const t = compareTaxes(baseline, strategy, s);
    expect(t.netTax).toBe(0);
    expect(t.breakevenAvoidedRate).toBeNull();
  });

  it('counts the IRMAA difference caused by a conversion', () => {
    const s = scenario({
      dob: '1958-05-05',
      endAge: 70,
      traditional: [800_000],
      analysis: { otherIncome: 100_000, inflationRate: 0, discountRate: 0.04, discountMatchesReturn: false },
      strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 50_000 }] },
    });
    const { baseline, strategy } = runComparison(s);
    const t = compareTaxes(baseline, strategy, s);
    expect(t.baselineIrmaa).toBe(0);
    expect(t.strategyIrmaa).toBeCloseTo(2_884.8, 6);
    expect(t.irmaaDifference).toBeCloseTo(-2_884.8, 6);
    expect(t.irmaaDifferencePv).toBeCloseTo(-2_884.8 / 1.04 ** 2, 6);
  });

  it('validates the assumptions', () => {
    expect(validateAnalysis(DEFAULT_ANALYSIS)).toHaveLength(0);
    expect(validateAnalysis({ ...DEFAULT_ANALYSIS, addedIncomeTaxRate: 1.2, otherIncome: -1 }).map((m) => m.code)).toEqual(
      expect.arrayContaining(['tax-rate', 'other-income']),
    );
  });
});

describe('findings', () => {
  const build = (strategy = {}) => {
    const s = scenario({ dob: '1956-06-15', endAge: 95, rate: 0.06, traditional: [1_750_000], strategy });
    const { baseline, strategy: st } = runComparison(s);
    return buildFindings({
      scenario: s,
      baseline,
      strategy: st,
      baselineSummary: summarize(baseline),
      strategySummary: summarize(st),
      tax: compareTaxes(baseline, st, s),
      baselineIrmaa: summarizeIrmaa(incomeByYear(baseline, s), 2051),
      strategyIrmaa: summarizeIrmaa(incomeByYear(st, s), 2051),
    });
  };

  it('describes size and growth, and says when no strategy is entered', () => {
    const f = build();
    expect(f.map((x) => x.id)).toEqual(['size', 'strategy']);
    expect(f[0]!.text).toMatch(/^Without a strategy, required RMDs start at \$[\d,]+ at age 73 \(2029\)/);
    expect(f[1]!.text).toMatch(/No Roth conversions or QCDs/);
  });

  it('describes the strategy, income shift, tax trade-off, and IRMAA in neutral terms', () => {
    const f = build({
      conversions: [70, 71, 72].map((a) => ({ personId: 'p1', year: 1956 + a, amount: 100_000 })),
      recurringQcds: [{ id: 'q', personId: 'p1', annualAmount: 20_000, startAge: 73, endAge: 95 }],
    });
    expect(f.map((x) => x.id)).toEqual(['size', 'strategy', 'shift', 'tax', 'irmaa']);
    expect(f[1]!.text).toMatch(/lowers the peak RMD by \$[\d,]+ \(\d+%\)/);
    expect(f[2]!.text).toContain('Conversions move $300,000 of taxable income into ages 70–72.');
    expect(f[3]!.text).toMatch(/At the rates entered \(24% on added income, 24% on avoided income\), estimated income tax is/);
    expect(f[3]!.text).toContain('it does not count the gifts themselves');
    const all = f.map((x) => x.text).join(' ').toLowerCase();
    expect(all).not.toMatch(/sav(e|ed|ing)/);
    expect(all).not.toMatch(/better|recommend/);
  });
});
