import { describe, expect, it } from 'vitest';
import { computeTax, marginalRate, taxableSocialSecurity, type HouseholdIncome } from '../../src/calculations/federalTax';
import { socialSecurityForYear } from '../../src/calculations/household';
import { incomeByYear } from '../../src/calculations/irmaa';
import { runComparison } from '../../src/calculations/projection';
import type { Scenario } from '../../src/types';
import { defaultScenario, defaultSpouse } from '../../src/utils/defaultScenario';
import { parseNumberInput } from '../../src/inputs/NumberField';

/**
 * Stress case: married filing jointly, both 66 in 2026, client Social Security
 * $58,000, spouse Social Security varied, $24,687 Roth conversion, no other
 * income. Every expected value is hand-calculated from IRC §86, the 2026
 * standard deduction ($32,200 + 2 × $1,650), the senior deduction ($6,000 each,
 * less 6% of AGI over $150,000), and the 2026 joint brackets.
 */
const CONVERSION = 24_687;
const joint66 = (socialSecurity: number, ordinaryIncome = CONVERSION, qualifiedIncome = 0): HouseholdIncome => ({
  year: 2026,
  filingStatus: 'joint',
  ordinaryIncome,
  qualifiedIncome,
  taxExemptInterest: 0,
  socialSecurity,
  peopleAge65: 2,
  itemizedDeductions: 0,
  stateTaxRate: 0,
  inflationRate: 0.025,
});

function scenario(spouseSs: number): Scenario {
  const s = defaultScenario(2026);
  const sp = defaultSpouse('1960-03-01');
  s.people[0] = { ...s.people[0]!, dateOfBirth: '1960-03-01', socialSecurityBenefit: 58_000, socialSecurityStartAge: 62 };
  s.people.push({ ...sp.person, dateOfBirth: '1960-03-01', socialSecurityBenefit: spouseSs, socialSecurityStartAge: 62 });
  s.accounts.push(...sp.accounts);
  s.analysis = { ...s.analysis, otherOrdinaryIncome: 0, stateTaxRate: 0 };
  s.cashFlow = { ...s.cashFlow, taxableBalance: 0, taxableBasis: 0, cashBalance: 0 };
  s.strategy = { ...s.strategy, conversions: [{ personId: 'client', year: 2026, amount: CONVERSION }] };
  return s;
}

describe('Social Security stress test, joint filers both 66 in 2026', () => {
  // [spouse SS, taxable SS, AGI, senior deduction, taxable income, federal tax, bracket]
  const cases: [number, number, number, number, number, number, number][] = [
    [0, 14_233.95, 38_920.95, 12_000, 0, 0, 0],
    [24_000, 24_433.95, 49_120.95, 12_000, 1_620.95, 162.095, 0.1],
    [100_000, 56_733.95, 81_420.95, 12_000, 33_920.95, 3_574.514, 0.12],
    [240_000, 116_233.95, 140_920.95, 12_000, 93_420.95, 10_714.514, 0.12],
    [500_000, 226_733.95, 251_420.95, 0, 215_920.95, 37_017.028, 0.24],
  ];

  it.each(cases)('spouse SS $%d: hand-calculated trace', (spouseSs, ssTaxable, agi, senior, taxable, federal, bracket) => {
    const t = computeTax(joint66(58_000 + spouseSs));
    expect(t.taxableSocialSecurity).toBeCloseTo(ssTaxable, 6);
    expect(t.agi).toBeCloseTo(agi, 6);
    expect(t.baseDeduction).toBe(35_500);
    expect(t.seniorDeduction).toBeCloseTo(senior, 6);
    expect(t.taxableIncome).toBeCloseTo(taxable, 6);
    expect(t.federalTax).toBeCloseTo(federal, 2);
    expect(t.bracketRate).toBe(bracket);
  });

  it.each(cases)('spouse SS $%d flows from the inputs through the engine unchanged', (spouseSs, ssTaxable, agi, _senior, taxable, federal) => {
    const s = scenario(spouseSs);
    expect(socialSecurityForYear(s, 2026)).toBe(58_000 + spouseSs);
    const { strategy } = runComparison(s);
    expect(strategy.ok).toBe(true);
    const y = incomeByYear(strategy, s)[0]!;
    expect(y.income.socialSecurity).toBe(58_000 + spouseSs);
    expect(y.income.ordinaryIncome).toBeCloseTo(CONVERSION, 6);
    expect(y.tax.taxableSocialSecurity).toBeCloseTo(ssTaxable, 6);
    expect(y.tax.agi).toBeCloseTo(agi, 6);
    expect(y.tax.taxableIncome).toBeCloseTo(taxable, 6);
    expect(y.tax.federalTax).toBeCloseTo(federal, 2);
  });

  it('reported case: $26,187 ordinary (conversion + cash interest) and $8,235 qualified income', () => {
    const t = computeTax(joint66(298_000, CONVERSION + 1_500, 8_235));
    // Provisional income 183,422 → taxable SS 0.85 × 139,422 + 6,000.
    expect(t.taxableSocialSecurity).toBeCloseTo(124_508.7, 6);
    expect(t.agi).toBeCloseTo(158_930.7, 6);
    // Senior deduction: 6,000 − 6% × 8,930.70, for each spouse.
    expect(t.seniorDeduction).toBeCloseTo(10_928.316, 6);
    expect(t.taxableIncome).toBeCloseTo(112_502.384, 6);
    expect(t.ordinaryTax).toBeCloseTo(12_362.82448, 4);
    expect(t.qualifiedTax).toBeCloseTo(1_235.25, 6);
    expect(t.federalTax).toBeCloseTo(13_598.07448, 4);
    expect(t.bracketRate).toBe(0.22);
    // Each extra $1: +$0.85 taxable SS, and the senior deduction falls 6% × 1.85 for two people,
    // so taxable income rises $2.072, taxed at 22%.
    expect(marginalRate(joint66(298_000, CONVERSION + 1_500, 8_235))).toBeCloseTo(1.85 * 1.12 * 0.22, 6);
  });

  it('caps taxable Social Security at 85% of benefits', () => {
    // Provisional 250,000 + 50,000 → formula 0.85 × 256,000 + 6,000 = 223,600, capped at 0.85 × 100,000.
    expect(taxableSocialSecurity(100_000, 250_000, 0, 'joint')).toBeCloseTo(85_000, 6);
    // Just below the cap on the formula side.
    expect(taxableSocialSecurity(298_000, 24_687, 0, 'joint')).toBeCloseTo(116_233.95, 6);
    expect(taxableSocialSecurity(298_000, 24_687, 0, 'joint')).toBeLessThan(0.85 * 298_000);
  });

  it('counts a benefit only from its start age', () => {
    const s = scenario(240_000);
    s.people[1] = { ...s.people[1]!, socialSecurityStartAge: 67 };
    expect(socialSecurityForYear(s, 2026)).toBe(58_000);
    expect(socialSecurityForYear(s, 2027)).toBeCloseTo((58_000 + 240_000) * 1.025, 6);
  });

  it('reads benefit entries as annual dollars with comma separators', () => {
    expect(parseNumberInput('$240,000', 'currency', 0)).toEqual({ ok: true, value: 240_000 });
    expect(parseNumberInput('240000', 'currency', 0)).toEqual({ ok: true, value: 240_000 });
  });
});
