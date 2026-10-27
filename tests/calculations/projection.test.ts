import { describe, expect, it } from 'vitest';
import { runComparison, runProjection } from '../../src/calculations/projection';
import { summarize } from '../../src/calculations/summary';
import type { ProjectionResult } from '../../src/types';
import { scenario } from './helpers';

const year = (r: ProjectionResult, y: number) => {
  const found = r.years.find((x) => x.year === y);
  if (!found) throw new Error(`no year ${y}`);
  return found;
};
const acct = (r: ProjectionResult, y: number, id: string) => year(r, y).accounts.find((a) => a.accountId === id)!;

describe('compounding with no withdrawals', () => {
  it('grows $100,000 at 5% before RMD age', () => {
    // Born 1965 → RMDs start at 75 (2040). Hand calc:
    // 2026: 100,000 × 1.05 = 105,000.00
    // 2027: 105,000 × 1.05 = 110,250.00
    // 2028: 110,250 × 1.05 = 115,762.50
    const r = runProjection(scenario({ dob: '1965-01-01', endAge: 63, rate: 0.05, traditional: [100_000] }));
    expect(r.ok).toBe(true);
    expect(r.years.map((y) => y.year)).toEqual([2026, 2027, 2028]);
    expect(r.years.map((y) => y.totals.requiredRmd)).toEqual([0, 0, 0]);
    expect(year(r, 2026).totals.endBalancePretax).toBeCloseTo(105_000, 6);
    expect(year(r, 2027).totals.endBalancePretax).toBeCloseTo(110_250, 6);
    expect(year(r, 2028).totals.endBalancePretax).toBeCloseTo(115_762.5, 6);
  });
});

describe('hand-calculated projection #1: RMDs from age 73 at 5%', () => {
  // Born 1953-03-01 → applicable age 73 → first RMD year 2026.
  // Balance Dec 31, 2025 = $1,000,000; return 5%.
  // 2026 age 73: RMD = 1,000,000 / 26.5      = 37,735.85; end = (1,000,000 − 37,735.85) × 1.05 = 1,010,377.36
  // 2027 age 74: RMD = 1,010,377.36 / 25.5   = 39,622.64; end = 970,754.72 × 1.05            = 1,019,292.45
  // 2028 age 75: RMD = 1,019,292.45 / 24.6   = 41,434.65; end = 977,857.80 × 1.05            = 1,026,750.69
  const r = runProjection(scenario({ dob: '1953-03-01', endAge: 75, rate: 0.05 }));
  it('matches the hand calculation', () => {
    expect(r.years.map((y) => y.people[0]!.distributionPeriod)).toEqual([26.5, 25.5, 24.6]);
    const expected = [
      [37_735.85, 1_010_377.36],
      [39_622.64, 1_019_292.45],
      [41_434.65, 1_026_750.69],
    ];
    r.years.forEach((y, i) => {
      expect(y.totals.requiredRmd).toBeCloseTo(expected[i]![0]!, 2);
      expect(y.totals.taxableDistribution).toBeCloseTo(expected[i]![0]!, 2);
      expect(y.totals.endBalancePretax).toBeCloseTo(expected[i]![1]!, 2);
    });
  });
  it('uses the prior Dec 31 balance, not the post-growth balance', () => {
    expect(year(r, 2027).accounts[0]!.priorYearEndBalance).toBeCloseTo(year(r, 2026).totals.endBalancePretax, 8);
    expect(year(r, 2026).totals.requiredRmd).toBeCloseTo(1_000_000 / 26.5, 8);
  });
  it('summarizes first, peak, and growth', () => {
    const s = summarize(r);
    expect(s.firstRmd).toMatchObject({ year: 2026, age: 73 });
    expect(s.peakRmd).toMatchObject({ year: 2028, age: 75 });
    // (41,434.65 / 37,735.85)^(1/2) − 1 ≈ 4.787%
    expect(s.rmdAnnualGrowth!).toBeCloseTo(Math.sqrt(41_434.6524 / 37_735.8491) - 1, 6);
  });
});

describe('Roth conversions', () => {
  it('hand-calculated projection #2: two-year conversion before RMD age', () => {
    // Born 1960-06-01 (RMDs at 75). Traditional $500,000, Roth $0, return 6%,
    // convert $50,000 in 2026 and 2027.
    // 2026: Trad (500,000 − 50,000) × 1.06 = 477,000; Roth 50,000 × 1.06 = 53,000
    // 2027: Trad (477,000 − 50,000) × 1.06 = 452,620; Roth (53,000 + 50,000) × 1.06 = 109,180
    const r = runProjection(
      scenario({
        dob: '1960-06-01',
        endAge: 67,
        rate: 0.06,
        traditional: [500_000],
        strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 50_000 }, { personId: 'p1', year: 2027, amount: 50_000 }] },
      }),
    );
    expect(year(r, 2026).totals.endBalancePretax).toBeCloseTo(477_000, 6);
    expect(year(r, 2026).totals.endBalanceRoth).toBeCloseTo(53_000, 6);
    expect(year(r, 2027).totals.endBalancePretax).toBeCloseTo(452_620, 6);
    expect(year(r, 2027).totals.endBalanceRoth).toBeCloseTo(109_180, 6);
    expect(year(r, 2027).totals.conversionGross).toBe(50_000);
    // Conversions are never counted as RMDs or taxable IRA distributions.
    expect(year(r, 2027).totals.requiredRmd).toBe(0);
    expect(year(r, 2027).totals.taxableDistribution).toBe(0);
  });

  it('single conversion with withholding deposits the net amount', () => {
    // $100,000 conversion, 20% withheld → $80,000 to the Roth IRA. Return 0%.
    const r = runProjection(
      scenario({
        dob: '1962-01-01',
        endAge: 64,
        traditional: [400_000],
        strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 100_000 }], conversionWithholdingRate: 0.2 },
      }),
    );
    const y = year(r, 2026);
    expect(y.totals.conversionGross).toBe(100_000);
    expect(y.totals.conversionWithheld).toBeCloseTo(20_000, 8);
    expect(y.totals.endBalancePretax).toBe(300_000);
    expect(y.totals.endBalanceRoth).toBeCloseTo(80_000, 8);
  });

  it('in an RMD year, satisfies the RMD first and blocks the excess', () => {
    // Born 1951 → age 75 in 2026 (24.6). $2,460,000 → RMD exactly $100,000.
    // Request a $3,000,000 conversion: only 2,460,000 − 100,000 = 2,360,000 may convert.
    const r = runProjection(
      scenario({
        dob: '1951-01-15',
        endAge: 75,
        traditional: [2_460_000],
        strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 3_000_000 }] },
      }),
    );
    const y = year(r, 2026);
    expect(y.totals.requiredRmd).toBeCloseTo(100_000, 6);
    expect(y.totals.taxableDistribution).toBeCloseTo(100_000, 6);
    expect(y.totals.conversionGross).toBeCloseTo(2_360_000, 6);
    expect(y.totals.endBalancePretax).toBeCloseTo(0, 6);
    expect(y.messages.some((m) => m.code === 'conversion-exceeds' && m.severity === 'error')).toBe(true);
  });

  it('a permissible conversion in an RMD year leaves the RMD intact', () => {
    const r = runProjection(
      scenario({
        dob: '1951-01-15',
        endAge: 75,
        traditional: [2_460_000],
        strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 200_000 }] },
      }),
    );
    const y = year(r, 2026);
    expect(y.totals.requiredRmd).toBeCloseTo(100_000, 6);
    expect(y.totals.conversionGross).toBe(200_000);
    expect(y.totals.endBalancePretax).toBeCloseTo(2_160_000, 6);
    expect(y.messages.filter((m) => m.severity === 'error')).toHaveLength(0);
  });
});

describe('QCDs', () => {
  it('$100,000 RMD with a $30,000 QCD → $70,000 taxable; balance reduced once by $100,000', () => {
    const r = runProjection(
      scenario({
        dob: '1951-01-15',
        endAge: 75,
        traditional: [2_460_000],
        strategy: { recurringQcds: [{ id: 'q', personId: 'p1', annualAmount: 30_000, startAge: 75, endAge: 75 }] },
      }),
    );
    const y = year(r, 2026);
    const p = y.people[0]!;
    expect(p.requiredRmd).toBeCloseTo(100_000, 6); // QCD does not reduce the required amount
    expect(p.qcd).toBe(30_000);
    expect(p.qcdTowardRmd).toBe(30_000);
    expect(p.taxableDistribution).toBeCloseTo(70_000, 6);
    expect(p.totalDistributions).toBeCloseTo(100_000, 6);
    expect(y.totals.endBalancePretax).toBeCloseTo(2_360_000, 6);
  });

  it('QCD before RMD age (after 70½) is a non-taxable distribution with no RMD', () => {
    // Born 1955-03-01: 70½ on 2025-09-01; RMDs start at 73 in 2028. Age 71 in 2026.
    const r = runProjection(
      scenario({
        dob: '1955-03-01',
        endAge: 71,
        traditional: [500_000],
        strategy: { oneTimeQcds: [{ id: 'q', personId: 'p1', year: 2026, amount: 20_000 }] },
      }),
    );
    const p = year(r, 2026).people[0]!;
    expect(p.requiredRmd).toBe(0);
    expect(p.qcd).toBe(20_000);
    expect(p.qcdTowardRmd).toBe(0);
    expect(p.taxableDistribution).toBe(0);
    expect(year(r, 2026).totals.endBalancePretax).toBe(480_000);
  });

  it('blocks QCDs before the year age 70½ is reached', () => {
    // Born 1957-01-10: 70½ on 2027-07-10.
    const r = runProjection(
      scenario({
        dob: '1957-01-10',
        endAge: 70,
        traditional: [500_000],
        strategy: { recurringQcds: [{ id: 'q', personId: 'p1', annualAmount: 10_000, startAge: 69, endAge: 70 }] },
      }),
    );
    expect(year(r, 2026).totals.qcd).toBe(0);
    expect(year(r, 2026).messages.some((m) => m.code === 'qcd-age')).toBe(true);
    // 2027 is the 70½ year: allowed, with a note about the date.
    expect(year(r, 2027).totals.qcd).toBe(10_000);
    expect(year(r, 2027).messages.some((m) => m.code === 'qcd-half-year')).toBe(true);
  });

  it('caps QCDs at the annual limit from data/', () => {
    const r = runProjection(
      scenario({
        dob: '1951-01-15',
        endAge: 75,
        traditional: [2_460_000],
        strategy: { oneTimeQcds: [{ id: 'q', personId: 'p1', year: 2026, amount: 150_000 }] },
      }),
    );
    const p = year(r, 2026).people[0]!;
    expect(p.qcd).toBe(111_000); // 2026 limit
    expect(p.qcdTowardRmd).toBeCloseTo(100_000, 6);
    expect(p.taxableDistribution).toBeCloseTo(0, 6);
    expect(year(r, 2026).messages.some((m) => m.code === 'qcd-limit')).toBe(true);
  });
});

describe('first-year April 1 deferral', () => {
  // Born 1953-03-01, first RMD year 2026, balance $1,000,000, return 5%.
  // 2026: RMD for 2026 = 1,000,000 / 26.5 = 37,735.85, all deferred; nothing required in 2026.
  //       end = 1,000,000 × 1.05 = 1,050,000.00
  // 2027: RMD for 2027 = 1,050,000 / 25.5 = 41,176.47 (Dec 31, 2026 balance not reduced by the deferred RMD)
  //       required in 2027 = 37,735.85 + 41,176.47 = 78,912.32
  //       end = (1,050,000 − 78,912.32) × 1.05 = 1,019,642.06
  const r = runProjection(scenario({ dob: '1953-03-01', endAge: 74, rate: 0.05, delayFirstRmd: true }));
  it('creates two RMDs in the second year', () => {
    const y1 = year(r, 2026).people[0]!;
    const y2 = year(r, 2027).people[0]!;
    expect(y1.rmdForYear).toBeCloseTo(37_735.85, 2);
    expect(y1.requiredRmd).toBe(0);
    expect(y1.rmdDeferredToNextYear).toBeCloseTo(37_735.85, 2);
    expect(year(r, 2026).totals.endBalancePretax).toBeCloseTo(1_050_000, 6);
    expect(y2.deferredRmdFromPriorYear).toBeCloseTo(37_735.85, 2);
    expect(y2.rmdForYear).toBeCloseTo(41_176.47, 2);
    expect(y2.requiredRmd).toBeCloseTo(78_912.32, 2);
    expect(year(r, 2027).totals.endBalancePretax).toBeCloseTo(1_019_642.06, 2);
  });
  it('blocks a conversion in the deferral year', () => {
    const blocked = runProjection(
      scenario({
        dob: '1953-03-01',
        endAge: 74,
        delayFirstRmd: true,
        strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 50_000 }] },
      }),
    );
    expect(year(blocked, 2026).totals.conversionGross).toBe(0);
    expect(year(blocked, 2026).messages.some((m) => m.code === 'conversion-deferred-rmd')).toBe(true);
  });
  it('QCDs in the first year reduce the deferred amount', () => {
    const withQcd = runProjection(
      scenario({
        dob: '1953-03-01',
        endAge: 74,
        delayFirstRmd: true,
        strategy: { oneTimeQcds: [{ id: 'q', personId: 'p1', year: 2026, amount: 10_000 }] },
      }),
    );
    expect(year(withQcd, 2026).people[0]!.rmdDeferredToNextYear).toBeCloseTo(1_000_000 / 26.5 - 10_000, 6);
  });
  it('is ignored with a warning when the first RMD year is before the projection', () => {
    const late = runProjection(scenario({ dob: '1951-01-15', endAge: 76, delayFirstRmd: true }));
    expect(late.ok).toBe(true);
    expect(late.messages.some((m) => m.code === 'deferral-not-applicable')).toBe(true);
    expect(year(late, 2026).totals.requiredRmd).toBeCloseTo(1_000_000 / 24.6, 6);
  });
});

describe('hand-calculated projection #3: two IRAs, Roth, QCD and conversion', () => {
  // Born 1952-07-01 → applicable age 73 (first RMD 2025). Age 74 in 2026.
  // IRA A $600,000, IRA B $400,000, Roth $100,000; return 4%; QCD $10,000/yr; convert $50,000/yr.
  // 2026 (74, 25.5): RMD = 1,000,000 / 25.5 = 39,215.69 (A 23,529.41; B 15,686.27)
  //   taxable = 39,215.69 − 10,000 = 29,215.69
  //   Trad end = (1,000,000 − 39,215.69 − 50,000) × 1.04 = 947,215.69
  //   Roth end = (100,000 + 50,000) × 1.04 = 156,000.00
  // 2027 (75, 24.6): RMD = 947,215.69 / 24.6 = 38,504.70; taxable = 28,504.70
  //   Trad end = (947,215.69 − 38,504.70 − 50,000) × 1.04 = 893,059.42
  //   Roth end = (156,000 + 50,000) × 1.04 = 214,240.00
  const r = runProjection(
    scenario({
      dob: '1952-07-01',
      endAge: 75,
      rate: 0.04,
      traditional: [600_000, 400_000],
      roth: 100_000,
      strategy: {
        conversions: [{ personId: 'p1', year: 2026, amount: 50_000 }, { personId: 'p1', year: 2027, amount: 50_000 }],
        recurringQcds: [{ id: 'q', personId: 'p1', annualAmount: 10_000, startAge: 74, endAge: 75 }],
      },
    }),
  );
  it('matches the hand calculation', () => {
    expect(acct(r, 2026, 't0').rmdComputed).toBeCloseTo(23_529.41, 2);
    expect(acct(r, 2026, 't1').rmdComputed).toBeCloseTo(15_686.27, 2);
    expect(year(r, 2026).totals.requiredRmd).toBeCloseTo(39_215.69, 2);
    expect(year(r, 2026).totals.taxableDistribution).toBeCloseTo(29_215.69, 2);
    expect(year(r, 2026).totals.endBalancePretax).toBeCloseTo(947_215.69, 2);
    expect(year(r, 2026).totals.endBalanceRoth).toBeCloseTo(156_000, 2);
    expect(year(r, 2027).totals.requiredRmd).toBeCloseTo(38_504.7, 2);
    expect(year(r, 2027).totals.taxableDistribution).toBeCloseTo(28_504.7, 2);
    expect(year(r, 2027).totals.endBalancePretax).toBeCloseTo(893_059.42, 2);
    expect(year(r, 2027).totals.endBalanceRoth).toBeCloseTo(214_240, 2);
  });
  it('baseline drops the conversions and QCDs but keeps everything else', () => {
    const { baseline } = runComparison(
      scenario({
        dob: '1952-07-01',
        endAge: 75,
        rate: 0.04,
        traditional: [600_000, 400_000],
        roth: 100_000,
        strategy: {
          conversions: [{ personId: 'p1', year: 2026, amount: 50_000 }],
          recurringQcds: [{ id: 'q', personId: 'p1', annualAmount: 10_000, startAge: 74, endAge: 75 }],
        },
      }),
    );
    expect(year(baseline, 2026).totals.qcd).toBe(0);
    expect(year(baseline, 2026).totals.conversionGross).toBe(0);
    expect(year(baseline, 2026).totals.taxableDistribution).toBeCloseTo(39_215.69, 2);
    expect(year(baseline, 2026).totals.endBalanceRoth).toBeCloseTo(104_000, 6);
  });
});

describe('edge cases', () => {
  it('zero balances produce zero RMDs and no NaN', () => {
    const r = runProjection(scenario({ dob: '1950-03-01', endAge: 80, traditional: [0], rate: 0.05 }));
    expect(r.ok).toBe(true);
    for (const y of r.years) {
      expect(y.totals.requiredRmd).toBe(0);
      expect(Number.isNaN(y.totals.endBalanceTotal)).toBe(false);
    }
  });

  it('depleting withdrawals stop at zero with a warning', () => {
    const r = runProjection(
      scenario({ dob: '1962-01-01', endAge: 66, traditional: [100_000], extra: { annualAmount: 60_000, startAge: 64, endAge: 66 } }),
    );
    expect(year(r, 2026).totals.extraWithdrawal).toBe(60_000);
    expect(year(r, 2027).totals.extraWithdrawal).toBe(40_000);
    expect(year(r, 2027).totals.endBalancePretax).toBe(0);
    expect(year(r, 2028).totals.extraWithdrawal).toBe(0);
    expect(r.messages.some((m) => m.code === 'extra-balance')).toBe(true);
  });

  it('handles multimillion balances', () => {
    // $25,000,000 at age 80: 25,000,000 / 20.2 = 1,237,623.76
    const r = runProjection(scenario({ dob: '1946-05-01', endAge: 80, traditional: [25_000_000] }));
    expect(year(r, 2026).totals.requiredRmd).toBeCloseTo(1_237_623.76, 2);
  });

  it('runs from the start year through the ending age', () => {
    const r = runProjection(scenario({ dob: '1950-01-01', endAge: 95, traditional: [1_000_000], rate: 0.05 }));
    expect(r.years[0]!.year).toBe(2026);
    expect(r.years[r.years.length - 1]!.age).toBe(95);
  });

  it('Roth IRAs have no RMDs and receive contributions through the stated age', () => {
    const r = runProjection(
      scenario({
        dob: '1950-01-01',
        endAge: 78,
        traditional: [0],
        roth: 200_000,
        rothContribution: { annualAmount: 7_000, throughAge: 77 },
      }),
    );
    expect(year(r, 2026).totals.requiredRmd).toBe(0);
    expect(year(r, 2027).totals.contributions).toBe(7_000);
    expect(year(r, 2028).totals.contributions).toBe(0);
    expect(year(r, 2028).totals.endBalanceRoth).toBe(214_000);
  });

  it('extra withdrawals add to the taxable distribution beyond the RMD', () => {
    const r = runProjection(
      scenario({ dob: '1951-01-15', endAge: 75, traditional: [2_460_000], extra: { annualAmount: 25_000, startAge: 70, endAge: 90 } }),
    );
    const p = year(r, 2026).people[0]!;
    expect(p.requiredRmd).toBeCloseTo(100_000, 6);
    expect(p.taxableDistribution).toBeCloseTo(125_000, 6);
  });
});

describe('invalid inputs', () => {
  it('rejects negative balances', () => {
    const r = runProjection(scenario({ dob: '1955-01-01', endAge: 95, traditional: [-5] }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'balance')).toBe(true);
    expect(r.years).toHaveLength(0);
  });
  it.each(['1955-02-30', '', '01/01/1955', '2030-01-01'])('rejects bad date of birth %j', (dob) => {
    const r = runProjection(scenario({ dob, endAge: 95 }));
    expect(r.ok).toBe(false);
  });
  it('rejects negative conversion amounts and bad withholding', () => {
    const r = runProjection(
      scenario({
        dob: '1955-01-01',
        endAge: 95,
        strategy: { conversions: [{ personId: 'p1', year: 2027, amount: -1 }], conversionWithholdingRate: 1.5 },
      }),
    );
    expect(r.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['conversion-amount', 'withholding']));
  });
  it('rejects an ending age below the current age', () => {
    const r = runProjection(scenario({ dob: '1950-01-01', endAge: 70 }));
    expect(r.errors.some((e) => e.code === 'end-age')).toBe(true);
  });
  it('rejects returns at or below -100%', () => {
    const s = scenario({ dob: '1955-01-01', endAge: 95 });
    s.returns = { mode: 'single', annualReturn: -1 };
    expect(runProjection(s).ok).toBe(false);
  });
  it('rejects account types not yet supported', () => {
    const s = scenario({ dob: '1955-01-01', endAge: 95 });
    s.accounts.push({ id: 'k', ownerId: 'p1', type: '401k', label: '401(k)', priorYearEndBalance: 1 });
    expect(runProjection(s).errors.some((e) => e.code === 'account-type')).toBe(true);
  });
});

describe('determinism', () => {
  it('identical inputs produce identical outputs', () => {
    const make = () =>
      scenario({
        dob: '1956-09-09',
        endAge: 95,
        rate: 0.061,
        traditional: [750_000, 250_000],
        roth: 50_000,
        strategy: {
          conversions: [{ personId: 'p1', year: 2027, amount: 80_000 }],
          recurringQcds: [{ id: 'q', personId: 'p1', annualAmount: 15_000, startAge: 71, endAge: 90 }],
        },
      });
    expect(runComparison(make())).toEqual(runComparison(make()));
  });
});
