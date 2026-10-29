import { describe, expect, it } from 'vitest';
import { computeTax, marginalRate, taxableSocialSecurity, taxParametersForYear, type HouseholdIncome } from '../../src/calculations/federalTax';
import { runProjection } from '../../src/calculations/projection';
import { scenario } from './helpers';

const base: HouseholdIncome = {
  year: 2026,
  filingStatus: 'single',
  ordinaryIncome: 0,
  qualifiedIncome: 0,
  taxExemptInterest: 0,
  socialSecurity: 0,
  peopleAge65: 0,
  itemizedDeductions: 0,
  stateTaxRate: 0,
  inflationRate: 0.025,
};

describe('federal tax (2026 parameters)', () => {
  it('single, under 65, $100,000 ordinary income', () => {
    // Taxable = 100,000 − 16,100 = 83,900
    // Tax = 12,400 × 10% + 38,000 × 12% + 33,500 × 22% = 1,240 + 4,560 + 7,370 = 13,170
    const t = computeTax({ ...base, ordinaryIncome: 100_000 });
    expect(t.taxableIncome).toBe(83_900);
    expect(t.federalTax).toBeCloseTo(13_170, 6);
    expect(t.bracketRate).toBe(0.22);
    expect(t.bracketTop).toBe(105_700);
  });

  it('joint, both 65+: Social Security, senior deduction phase-out, qualified income', () => {
    // Ordinary 120,000, qualified 10,000, Social Security 40,000.
    // Provisional = 130,000 + 20,000 = 150,000 → taxable SS = min(34,000, 90,100 + 6,000) = 34,000
    // AGI = 164,000. Standard = 32,200 + 2 × 1,650 = 35,500.
    // Senior: 6,000 − 6% × (164,000 − 150,000) = 5,160 each → 10,320.
    // Taxable = 164,000 − 35,500 − 10,320 = 118,180; ordinary part 108,180.
    // Ordinary tax = 2,480 + 9,120 + 7,380 × 22% = 13,223.60; qualified at 15% = 1,500. Total 14,723.60.
    const t = computeTax({
      ...base,
      filingStatus: 'joint',
      ordinaryIncome: 120_000,
      qualifiedIncome: 10_000,
      socialSecurity: 40_000,
      peopleAge65: 2,
    });
    expect(t.taxableSocialSecurity).toBe(34_000);
    expect(t.agi).toBe(164_000);
    expect(t.baseDeduction).toBe(35_500);
    expect(t.seniorDeduction).toBeCloseTo(10_320, 6);
    expect(t.taxableIncome).toBeCloseTo(118_180, 6);
    expect(t.ordinaryTax).toBeCloseTo(13_223.6, 6);
    expect(t.qualifiedTax).toBeCloseTo(1_500, 6);
    expect(t.niit).toBe(0);
    expect(t.federalTax).toBeCloseTo(14_723.6, 6);
  });

  it('taxes Social Security in the middle band', () => {
    // Single, SS 30,000, other AGI 20,000: provisional 35,000 → 0.85 × 1,000 + min(15,000, 4,500) = 5,350
    expect(taxableSocialSecurity(30_000, 20_000, 0, 'single')).toBe(5_350);
    expect(taxableSocialSecurity(30_000, 5_000, 0, 'single')).toBe(0);
    // Capped at 85% of benefits.
    expect(taxableSocialSecurity(30_000, 500_000, 0, 'single')).toBe(25_500);
  });

  it('stacks qualified income on top of ordinary income', () => {
    // Ordinary 30,000, qualified 50,000 → taxable 63,900; ordinary part 13,900.
    // 0% on 49,450 − 13,900 = 35,550; 15% on 63,900 − 49,450 = 14,450 → 2,167.50
    // Ordinary: 1,240 + 1,500 × 12% = 1,420. Total 3,587.50
    const t = computeTax({ ...base, ordinaryIncome: 30_000, qualifiedIncome: 50_000 });
    expect(t.ordinaryTaxableIncome).toBe(13_900);
    expect(t.qualifiedTax).toBeCloseTo(2_167.5, 6);
    expect(t.federalTax).toBeCloseTo(3_587.5, 6);
  });

  it('applies the 3.8% NIIT above $200,000 (single)', () => {
    const t = computeTax({ ...base, ordinaryIncome: 250_000, qualifiedIncome: 20_000 });
    expect(t.niit).toBeCloseTo(760, 6);
  });

  it('applies a flat state rate to income other than Social Security', () => {
    const t = computeTax({ ...base, ordinaryIncome: 50_000, socialSecurity: 30_000, stateTaxRate: 0.05 });
    expect(t.stateTax).toBeCloseTo(0.05 * (t.agi - t.taxableSocialSecurity), 6);
  });

  it('shows a marginal rate above the bracket in the Social Security "torpedo"', () => {
    // Single, 65+, SS 30,000, ordinary 20,000: taxable 1,200 (10% bracket).
    // +1,000 ordinary → +850 taxable SS → taxable income +1,850 → tax +185 → 18.5%.
    const h = { ...base, ordinaryIncome: 20_000, socialSecurity: 30_000, peopleAge65: 1 };
    expect(computeTax(h).bracketRate).toBe(0.1);
    expect(marginalRate(h)).toBeCloseTo(0.185, 10);
  });

  it('projects later years with statutory rounding', () => {
    const p = taxParametersForYear(2027, 0.03).params;
    // 12,400 × 1.03 = 12,772 → down to $25 → 12,750; 16,100 × 1.03 = 16,583 → down to $50 → 16,550
    expect(p.brackets.single[0]!.upTo).toBe(12_750);
    expect(p.standardDeduction.single).toBe(16_550);
    expect(taxParametersForYear(2026, 0.03).projected).toBe(false);
  });

  it('ends the senior deduction after 2028', () => {
    expect(computeTax({ ...base, year: 2028, ordinaryIncome: 50_000, peopleAge65: 1 }).seniorDeduction).toBe(6_000);
    expect(computeTax({ ...base, year: 2029, ordinaryIncome: 50_000, peopleAge65: 1 }).seniorDeduction).toBe(0);
  });
});

describe('fill-to-bracket conversions', () => {
  const NONE = {
    socialSecurityBenefit: 0,
    otherOrdinaryIncome: 0,
    qualifiedInvestmentIncome: 0,
    taxExemptInterest: 0,
    itemizedDeductions: 0,
    stateTaxRate: 0,
  };
  it('fills to the top of the 22% bracket', () => {
    // Born 1960, age 66 in 2026, single, no other income. Deductions: 16,100 + 2,050 + senior (6,000 − 6% × (C − 75,000)).
    // Taxable = 1.06·C − 28,650 = 105,700 → C = 126,745.28 → 126,745 (whole dollars, never over the top)
    const r = runProjection(
      scenario({
        dob: '1960-03-01',
        endAge: 66,
        traditional: [1_000_000],
        analysis: NONE,
        strategy: { bracketFills: [{ id: 'f', personId: 'p1', startAge: 66, endAge: 66, bracketRate: 0.22, irmaaMaxTier: null }] },
      }),
    );
    const p = r.years[0]!.people[0]!;
    expect(p.conversionMethod).toBe('fill');
    expect(p.conversionGross).toBe(126_745);
  });

  it('also respects an IRMAA limit for the premium year two years later', () => {
    // 2028 tier-1 bound at 2.5% inflation: 109,000 × 1.025² = 114,518 → 115,000. MAGI = conversion ≤ 115,000.
    const r = runProjection(
      scenario({
        dob: '1960-03-01',
        endAge: 66,
        traditional: [1_000_000],
        analysis: NONE,
        strategy: { bracketFills: [{ id: 'f', personId: 'p1', startAge: 66, endAge: 66, bracketRate: 0.22, irmaaMaxTier: 0 }] },
      }),
    );
    expect(r.years[0]!.people[0]!.conversionGross).toBe(115_000);
  });

  it('converts nothing, with a note, when income is already past the bracket', () => {
    const r = runProjection(
      scenario({
        dob: '1960-03-01',
        endAge: 66,
        traditional: [1_000_000],
        analysis: { ...NONE, otherOrdinaryIncome: 200_000 },
        strategy: { bracketFills: [{ id: 'f', personId: 'p1', startAge: 66, endAge: 66, bracketRate: 0.12, irmaaMaxTier: null }] },
      }),
    );
    expect(r.years[0]!.totals.conversionGross).toBe(0);
    expect(r.messages.some((m) => m.code === 'fill-no-room')).toBe(true);
  });

  it('a fixed amount for a year takes precedence over a fill rule', () => {
    const r = runProjection(
      scenario({
        dob: '1960-03-01',
        endAge: 66,
        traditional: [1_000_000],
        analysis: NONE,
        strategy: {
          conversions: [{ personId: 'p1', year: 2026, amount: 10_000 }],
          bracketFills: [{ id: 'f', personId: 'p1', startAge: 66, endAge: 66, bracketRate: 0.22, irmaaMaxTier: null }],
        },
      }),
    );
    expect(r.years[0]!.people[0]!.conversionMethod).toBe('fixed');
    expect(r.years[0]!.totals.conversionGross).toBe(10_000);
  });
});
