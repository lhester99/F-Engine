import { describe, expect, it } from 'vitest';
import { computeTax, taxableSocialSecurity, type HouseholdIncome } from '../../src/calculations/federalTax';
import { peopleAge65ForTax } from '../../src/calculations/household';
import { computeRmd, getRmdStart, uniformLifetimeDivisor } from '../../src/calculations/rmdRules';
import { defaultScenario } from '../../src/utils/defaultScenario';

/** Cases taken from IRS publications and forms, checked against IRS.gov on October 29, 2026 (see docs/research.md). */
describe('IRS published examples', () => {
  it('Pub. 590-B (2025): $100,000 balance, age 75 in 2026, divisor 24.6, RMD $4,065', () => {
    expect(uniformLifetimeDivisor(75)).toBe(24.6);
    expect(Math.round(computeRmd(100_000, uniformLifetimeDivisor(75)))).toBe(4_065);
  });

  it('Treas. Reg. §1.401(a)(9)-2(b)(2): applicable age by date of birth', () => {
    expect(getRmdStart({ year: 1949, month: 6, day: 30 }).applicableAge).toBe(70.5);
    expect(getRmdStart({ year: 1949, month: 7, day: 1 }).applicableAge).toBe(72);
    expect(getRmdStart({ year: 1950, month: 12, day: 31 }).applicableAge).toBe(72);
    expect(getRmdStart({ year: 1951, month: 1, day: 1 }).applicableAge).toBe(73);
    expect(getRmdStart({ year: 1958, month: 12, day: 31 }).applicableAge).toBe(73);
    // 1959 is "[Reserved]" in the final regulations; the 2024 proposed regulations use 73.
    expect(getRmdStart({ year: 1959, month: 6, day: 1 }).applicableAge).toBe(73);
    expect(getRmdStart({ year: 1960, month: 1, day: 1 }).applicableAge).toBe(75);
  });

  it('Pub. 915 (2025) Worksheet 1 example: $5,980 of benefits, $2,990 taxable', () => {
    // Line 2 (half of benefits) 2,990; line 6 (provisional income) 31,980; single.
    expect(taxableSocialSecurity(5_980, 31_980 - 2_990, 0, 'single')).toBeCloseTo(2_990, 6);
  });

  it('Schedule 1-A (2025): senior deduction is $6,000 less 6% of MAGI over the threshold, for each spouse', () => {
    const h: HouseholdIncome = {
      year: 2026,
      filingStatus: 'joint',
      ordinaryIncome: 170_000,
      qualifiedIncome: 0,
      taxExemptInterest: 0,
      socialSecurity: 0,
      peopleAge65: 2,
      itemizedDeductions: 0,
      stateTaxRate: 0,
      inflationRate: 0.025,
    };
    // MAGI 170,000: each spouse 6,000 − 0.06 × 20,000 = 4,800.
    expect(computeTax(h).seniorDeduction).toBeCloseTo(9_600, 6);
    expect(computeTax({ ...h, peopleAge65: 1 }).seniorDeduction).toBeCloseTo(4_800, 6);
  });

  it('Pub. 501 (2025): a person is 65 on the day before their 65th birthday', () => {
    const s = defaultScenario(2026);
    const at = (dob: string, year: number) => peopleAge65ForTax({ ...s, people: [{ ...s.people[0]!, dateOfBirth: dob }] }, year);
    // "You can take a higher standard deduction for 2025 if you were born before January 2, 1961."
    expect(at('1961-01-01', 2025)).toBe(1);
    expect(at('1961-01-02', 2025)).toBe(0);
    expect(at('1960-12-31', 2025)).toBe(1);
  });

  it('NIIT (IRC §1411): interest is net investment income; IRA income is not', () => {
    const h: HouseholdIncome = {
      year: 2026,
      filingStatus: 'joint',
      ordinaryIncome: 300_000,
      ordinaryInvestmentIncome: 10_000,
      qualifiedIncome: 0,
      taxExemptInterest: 0,
      socialSecurity: 0,
      peopleAge65: 0,
      itemizedDeductions: 0,
      stateTaxRate: 0,
      inflationRate: 0.025,
    };
    // MAGI 300,000 exceeds 250,000 by 50,000; net investment income is the 10,000 of interest.
    expect(computeTax(h).niit).toBeCloseTo(380, 6);
    expect(computeTax({ ...h, ordinaryInvestmentIncome: 0 }).niit).toBe(0);
  });
});
