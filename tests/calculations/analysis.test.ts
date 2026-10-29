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
import { compareTaxes } from '../../src/calculations/taxComparison';
import { compareWealth } from '../../src/calculations/wealth';
import { validateAnalysis } from '../../src/calculations/validate';
import { IRMAA_2026 } from '../../src/data/irmaa';
import { DEFAULT_ANALYSIS } from '../../src/utils/defaultScenario';
import type { ProjectionResult } from '../../src/types';
import { scenario } from './helpers';

const year = (r: ProjectionResult, y: number) => r.years.find((x) => x.year === y)!;

/** No household income outside the IRAs, so hand calculations stay simple. */
const NO_OTHER_INCOME = {
  socialSecurityBenefit: 0,
  otherOrdinaryIncome: 0,
  qualifiedInvestmentIncome: 0,
  taxExemptInterest: 0,
  itemizedDeductions: 0,
  stateTaxRate: 0,
};

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
      analysis: { ...NO_OTHER_INCOME, otherOrdinaryIncome: 100_000, inflationRate: 0 },
      strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 50_000 }] },
    });
    const income = incomeByYear(runProjection(s), s);
    expect(income[0]).toMatchObject({ year: 2026, premiumYear: 2028, magi: 150_000, tier: 2, medicareApplies: true });
    expect(income[0]!.annualSurcharge).toBeCloseTo(2_884.8, 6);
    expect(income[1]!.tier).toBe(0);
    // Premium years 2028 only are inside a projection that ends in 2028.
    expect(summarizeIrmaa(income, 2028)).toEqual({ yearsWithSurcharge: 1, highestTier: 2, totalSurcharge: income[0]!.annualSurcharge });

    const young = scenario({ dob: '1965-01-01', endAge: 63, traditional: [800_000], analysis: { ...NO_OTHER_INCOME, otherOrdinaryIncome: 400_000 } });
    expect(incomeByYear(runProjection(young), young)[0]!.medicareApplies).toBe(false);
    expect(incomeByYear(runProjection(young), young)[0]!.tier).toBe(0);
  });

  it('subtracts deductible contributions from MAGI', () => {
    const s = scenario({
      dob: '1962-01-01',
      endAge: 64,
      traditional: [100_000],
      tradContribution: { annualAmount: 8_000, throughAge: 70 },
      analysis: { ...NO_OTHER_INCOME, otherOrdinaryIncome: 120_000, inflationRate: 0 },
    });
    expect(incomeByYear(runProjection(s), s)[0]!.magi).toBe(112_000);
  });
});

describe('estimated tax comparison', () => {
  it('hand-calculated: one $100,000 conversion before RMD age', () => {
    // Born 1965 (ages 61–62 in 2026–2027), single, no other income, $1,000,000, 0% return, 0% discount.
    // Convert $100,000 in 2026: AGI 100,000 − 16,100 standard deduction = 83,900 taxable
    //   tax = 1,240 + 4,560 + (83,900 − 50,400) × 22% = 13,170
    // Heirs at 24%: baseline 1,000,000 → 240,000; strategy 900,000 → 216,000
    // Net = 240,000 − (13,170 + 216,000) = 10,830 lower. Breakeven heirs' rate = 13,170 / 100,000 = 13.17%.
    const s = scenario({
      dob: '1965-01-01',
      endAge: 62,
      traditional: [1_000_000],
      strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 100_000 }] },
      analysis: { ...NO_OTHER_INCOME, heirsTaxRate: 0.24, discountRate: 0, discountMatchesReturn: false },
    });
    const { baseline, strategy } = runComparison(s);
    const t = compareTaxes(baseline, strategy, s);
    expect(t.baseline.lifetime).toBe(0);
    expect(t.strategy.federal).toBeCloseTo(13_170, 6);
    expect(t.baseline.heirsTax).toBeCloseTo(240_000, 6);
    expect(t.strategy.heirsTax).toBeCloseTo(216_000, 6);
    expect(t.taxPaidEarlier).toBeCloseTo(13_170, 6);
    expect(t.taxAvoidedLater).toBeCloseTo(24_000, 6);
    expect(t.netTax).toBeCloseTo(10_830, 6);
    expect(t.netTaxPv).toBeCloseTo(10_830, 6);
    expect(t.breakevenHeirsRate!).toBeCloseTo(0.1317, 8);
  });

  it('keeps the identity: net = avoided later − paid earlier', () => {
    const s = scenario({
      dob: '1956-06-15',
      endAge: 95,
      rate: 0.06,
      traditional: [1_750_000],
      strategy: { conversions: [2026, 2027, 2028].map((y) => ({ personId: 'p1', year: y, amount: 120_000 })) },
    });
    const { baseline, strategy } = runComparison(s);
    const t = compareTaxes(baseline, strategy, s);
    expect(t.netTax).toBeCloseTo(t.taxAvoidedLater - t.taxPaidEarlier, 4);
    expect(t.netTaxPv).toBeCloseTo(t.taxAvoidedLaterPv - t.taxPaidEarlierPv, 4);
    expect(t.discountRate).toBe(0.06);
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

  it('with no strategy, nothing differs and there is no breakeven', () => {
    const s = scenario({ dob: '1955-01-01', endAge: 95, rate: 0.05 });
    const { baseline, strategy } = runComparison(s);
    const t = compareTaxes(baseline, strategy, s);
    expect(t.netTax).toBe(0);
    expect(t.breakevenHeirsRate).toBeNull();
  });

  it('counts the IRMAA difference caused by a conversion', () => {
    const s = scenario({
      dob: '1958-05-05',
      endAge: 70,
      traditional: [800_000],
      analysis: { ...NO_OTHER_INCOME, otherOrdinaryIncome: 100_000, inflationRate: 0 },
      strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 50_000 }] },
    });
    const { baseline, strategy } = runComparison(s);
    const t = compareTaxes(baseline, strategy, s);
    expect(t.baseline.irmaa).toBe(0);
    expect(t.strategy.irmaa).toBeCloseTo(2_884.8, 6);
  });

  it('validates the assumptions', () => {
    expect(validateAnalysis(DEFAULT_ANALYSIS)).toHaveLength(0);
    expect(
      validateAnalysis({ ...DEFAULT_ANALYSIS, heirsTaxRate: 1.2, otherOrdinaryIncome: -1 }).map((m) => m.code),
    ).toEqual(expect.arrayContaining(['heirs-rate', 'otherOrdinaryIncome']));
  });
});

describe('findings', () => {
  it('treats conversions from a fill-to-bracket rule as a strategy', () => {
    const sc = scenario({
      dob: '1956-06-15',
      endAge: 95,
      rate: 0.06,
      traditional: [1_750_000],
      strategy: { bracketFills: [{ id: 'f', personId: 'p1', startAge: 70, endAge: 72, bracketRate: 0.24, irmaaMaxTier: null }] },
    });
    const { baseline, strategy: st } = runComparison(sc);
    const f = buildFindings({
      scenario: sc,
      baseline,
      strategy: st,
      baselineSummary: summarize(baseline),
      strategySummary: summarize(st),
      tax: compareTaxes(baseline, st, sc),
      baselineIrmaa: null,
      strategyIrmaa: null,
      baselineIncome: incomeByYear(baseline, sc),
      strategyIncome: incomeByYear(st, sc),
    });
    expect(f.find((x) => x.id === 'strategy')!.text).toMatch(/^This strategy/);
    expect(f.find((x) => x.id === 'brackets')!.text).toContain('income reaches the 24% federal bracket');
  });


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
      baselineIncome: incomeByYear(baseline, s),
      strategyIncome: incomeByYear(st, s),
      wealth: compareWealth(baseline, st),
    });
  };

  it('describes size and growth, and says when no strategy is entered', () => {
    const f = build();
    expect(f.map((x) => x.id)).toEqual(['size', 'excess', 'strategy']);
    const by = (id: string) => f.find((x) => x.id === id)!.text;
    expect(by('size')).toMatch(/^Without a strategy, required RMDs start at \$[\d,]+ at age 73 \(2029\)/);
    expect(by('excess')).toMatch(/^Without a strategy, \$[\d,]+ of IRA withdrawals is left after taxes over the projection and goes into the taxable account/);
    expect(by('strategy')).toMatch(/No Roth conversions or QCDs/);
  });

  it('describes the strategy, income shift, tax trade-off, and IRMAA in neutral terms', () => {
    const f = build({
      conversions: [70, 71, 72].map((a) => ({ personId: 'p1', year: 1956 + a, amount: 100_000 })),
      recurringQcds: [{ id: 'q', personId: 'p1', annualAmount: 20_000, startAge: 73, endAge: 95 }],
    });
    expect(f.map((x) => x.id)).toEqual(['size', 'excess', 'strategy', 'shift', 'brackets', 'tax', 'wealth', 'irmaa']);
    const by = (id: string) => f.find((x) => x.id === id)!.text;
    expect(by('strategy')).toMatch(/lowers the peak RMD by \$[\d,]+ \(\d+%\)/);
    expect(by('shift')).toContain('Conversions move $300,000 of taxable income into ages 70–72.');
    expect(by('brackets')).toMatch(/^In conversion years \(ages 70–72\), income reaches the \d+% federal bracket\./);
    expect(by('tax')).toMatch(/^The strategy adds about \$[\d,]+ of federal, state, and IRMAA costs/);
    expect(by('tax')).toContain('it does not count the gifts themselves');
    expect(by('wealth')).toMatch(/^At age 95, after-tax value is \$[\d,]+ with the strategy and \$[\d,]+ without it/);
    const all = f.map((x) => x.text).join(' ').toLowerCase();
    expect(all).not.toMatch(/sav(e|ed|ing)/);
    expect(all).not.toMatch(/better|recommend/);
  });
});
