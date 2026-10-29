import { describe, expect, it } from 'vitest';
import { computeTax, householdIncomeForYear } from '../../src/calculations/federalTax';
import { filingStatusForYear, socialSecurityForYear } from '../../src/calculations/household';
import { incomeByYear } from '../../src/calculations/irmaa';
import { runProjection } from '../../src/calculations/projection';
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
const year = (r: ProjectionResult, y: number) => r.years.find((x) => x.year === y)!;
const person = (r: ProjectionResult, y: number, id: string) => year(r, y).people.find((p) => p.personId === id);

describe('two spouses', () => {
  it("computes each spouse's RMD independently, then combines", () => {
    // Client born 1953-03-01: age 73 in 2026 (26.5) on $1,000,000 → 37,735.85
    // Spouse born 1951-01-15: age 75 in 2026 (24.6) on $2,460,000 → 100,000
    const r = runProjection(
      scenario({ dob: '1953-03-01', endAge: 73, traditional: [1_000_000], analysis: NONE, spouse: { dob: '1951-01-15', traditional: 2_460_000 } }),
    );
    expect(person(r, 2026, 'p1')!.requiredRmd).toBeCloseTo(37_735.85, 2);
    expect(person(r, 2026, 'p2')!.requiredRmd).toBeCloseTo(100_000, 6);
    expect(year(r, 2026).totals.requiredRmd).toBeCloseTo(137_735.85, 2);
  });

  it('files jointly with both spouses’ age-65 and senior deductions', () => {
    // Both 66 in 2026, no RMDs; client converts $100,000.
    // AGI 100,000 − (32,200 + 2 × 1,650) − senior 2 × 6,000 = 52,500 taxable
    // Tax = 24,800 × 10% + 27,700 × 12% = 2,480 + 3,324 = 5,804
    const r = runProjection(
      scenario({
        dob: '1960-03-01',
        endAge: 66,
        traditional: [500_000],
        analysis: NONE,
        spouse: { dob: '1960-08-01' },
        strategy: { conversions: [{ personId: 'p1', year: 2026, amount: 100_000 }] },
      }),
    );
    expect(year(r, 2026).household.conversionTax).toBeCloseTo(5_804, 6);
  });

  it('a fill-to-bracket rule sees both spouses’ RMDs', () => {
    // Client converts to the top of the joint 22% bracket ($211,400 of ordinary taxable income)
    // while the spouse's $100,000 RMD is also on the return.
    const s = scenario({
      dob: '1953-03-01',
      endAge: 73,
      traditional: [1_000_000],
      analysis: NONE,
      spouse: { dob: '1951-01-15', traditional: 2_460_000 },
      strategy: { bracketFills: [{ id: 'f', personId: 'p1', startAge: 73, endAge: 73, bracketRate: 0.22, irmaaMaxTier: null }] },
    });
    const r = runProjection(s);
    const income = incomeByYear(r, s)[0]!;
    expect(person(r, 2026, 'p1')!.conversionMethod).toBe('fill');
    expect(income.tax.ordinaryTaxableIncome).toBeLessThanOrEqual(211_400);
    expect(income.tax.ordinaryTaxableIncome).toBeGreaterThan(211_399);
  });
});

describe('first death and the survivor', () => {
  // Client born 1951-01-15 (age 75 in 2026) dies at 76 in 2027. Spouse born 1955-03-01
  // (age 72 in 2027, first RMD at 73 in 2028). Client $2,460,000, spouse $0, 0% return.
  // 2026: client RMD 2,460,000 / 24.6 = 100,000
  // 2027: client RMD 2,360,000 / 23.7 = 99,578.06 (death year: full RMD, joint return)
  // 2028: survivor owns 2,260,421.94 → RMD at 73: / 26.5 = 85,298.94, single return
  const make = (over: object = {}) =>
    scenario({
      dob: '1951-01-15',
      endAge: 78,
      traditional: [2_460_000],
      analysis: NONE,
      spouse: { dob: '1955-03-01' },
      survivorship: { enabled: true, firstDeathPersonId: 'p1', deathAge: 76, ...over },
    });

  it('takes the full RMD in the death year, then the survivor rolls over and uses their own age', () => {
    const r = runProjection(make());
    expect(person(r, 2026, 'p1')!.requiredRmd).toBeCloseTo(100_000, 6);
    expect(person(r, 2027, 'p1')!.requiredRmd).toBeCloseTo(99_578.06, 2);
    expect(person(r, 2027, 'p2')!.requiredRmd).toBe(0);
    expect(person(r, 2028, 'p1')).toBeUndefined();
    expect(person(r, 2028, 'p2')!.requiredRmd).toBeCloseTo(85_298.94, 2);
    expect(person(r, 2028, 'p2')!.distributionPeriod).toBe(26.5);
    expect(r.messages.some((m) => m.code === 'first-death')).toBe(true);
  });

  it('files jointly through the death year and single after', () => {
    const s = make();
    expect(filingStatusForYear(s, 2027)).toBe('joint');
    expect(filingStatusForYear(s, 2028)).toBe('single');
  });

  it('a younger survivor has no RMDs until their own RMD age', () => {
    // Spouse born 1962 (applicable age 73 → 2035). Client dies in 2026.
    // The spouse is 11 years younger and the sole beneficiary, so the death-year RMD uses
    // the Joint and Last Survivor Table: ages 75 and 64 → 25.3 (Pub. 590-B example).
    const r = runProjection(
      scenario({
        dob: '1951-01-15',
        endAge: 78,
        traditional: [2_460_000],
        analysis: NONE,
        spouse: { dob: '1962-05-01' },
        survivorship: { enabled: true, firstDeathPersonId: 'p1', deathAge: 75 },
      }),
    );
    expect(year(r, 2026).totals.requiredRmd).toBeCloseTo(2_460_000 / 25.3, 6);
    expect(year(r, 2026).people.find((p) => p.personId === 'p1')!.distributionTable).toBe('joint');
    expect(year(r, 2027).totals.requiredRmd).toBe(0);
    expect(year(r, 2027).totals.endBalancePretax).toBeCloseTo(2_460_000 - 2_460_000 / 25.3, 6);
  });

  it('keeps the larger Social Security benefit after the death', () => {
    const s = scenario({
      dob: '1951-01-15',
      endAge: 78,
      traditional: [0],
      analysis: { ...NONE, inflationRate: 0, socialSecurityBenefit: 30_000, socialSecurityStartAge: 67 },
      spouse: { dob: '1955-03-01', ss: 20_000, ssAge: 67 },
      survivorship: { enabled: true, firstDeathPersonId: 'p1', deathAge: 76 },
    });
    expect(socialSecurityForYear(s, 2027)).toBe(50_000);
    expect(socialSecurityForYear(s, 2028)).toBe(30_000);
  });

  it('the same income is taxed more heavily after the switch to single filing', () => {
    // $120,000 of ordinary income at the same ages, joint vs. single (0% inflation).
    const s = make({});
    s.analysis = { ...s.analysis, inflationRate: 0 };
    const ira = { taxableIra: 120_000, conversion: 0, deductibleContributions: 0 };
    const joint = computeTax(householdIncomeForYear(s, 2027, ira));
    const single = computeTax(householdIncomeForYear(s, 2028, ira));
    expect(joint.bracketRate).toBe(0.12);
    expect(single.bracketRate).toBe(0.22);
    expect(single.totalTax).toBeGreaterThan(joint.totalTax * 1.5);
  });

  it('continues only the chosen share of other income and spending', () => {
    const s = make({ otherIncomeAfter: 0.6, spendingAfter: 0.5 });
    s.analysis = { ...s.analysis, otherOrdinaryIncome: 50_000, inflationRate: 0 };
    s.cashFlow = { ...s.cashFlow, spendingFromIra: 40_000 };
    const zero = { taxableIra: 0, conversion: 0, deductibleContributions: 0 };
    expect(householdIncomeForYear(s, 2027, zero).ordinaryIncome).toBe(50_000);
    expect(householdIncomeForYear(s, 2028, zero).ordinaryIncome).toBe(30_000);
    const r = runProjection(s);
    expect(year(r, 2027).household.spending).toBe(40_000);
    expect(year(r, 2028).household.spending).toBe(20_000);
  });

  it('does not defer a first RMD past the owner’s death', () => {
    // Client born 1953-03-01: first RMD year 2026, deferral chosen, but dies in 2026.
    const r = runProjection(
      scenario({
        dob: '1953-03-01',
        endAge: 75,
        traditional: [1_000_000],
        delayFirstRmd: true,
        analysis: NONE,
        spouse: { dob: '1955-03-01' },
        survivorship: { enabled: true, firstDeathPersonId: 'p1', deathAge: 73 },
      }),
    );
    expect(person(r, 2026, 'p1')!.requiredRmd).toBeCloseTo(1_000_000 / 26.5, 6);
    expect(person(r, 2026, 'p1')!.rmdDeferredToNextYear).toBe(0);
  });

  it('rejects a death before the projection starts', () => {
    const r = runProjection(make({ deathAge: 70 }));
    expect(r.errors.some((e) => e.code === 'death-age')).toBe(true);
  });
});
