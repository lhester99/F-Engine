import { describe, expect, it } from 'vitest';
import { dateAttaining70AndAHalf, parseIsoDate } from '../../src/calculations/dates';
import { computeRmd, getRmdStart, uniformLifetimeDivisor } from '../../src/calculations/rmdRules';
import { effectiveAnnualReturn } from '../../src/calculations/returns';
import { qcdLimitForYear } from '../../src/calculations/qcd';
import { DEFAULT_QCD_LIMIT_SETTINGS } from '../../src/data/qcdLimits';
import { allocateProRata } from '../../src/calculations/allocate';

const start = (dob: string) => getRmdStart(parseIsoDate(dob)!);

describe('RMD applicable age by date of birth', () => {
  it.each([
    // [dob, applicable age, first RMD year]
    ['1948-12-31', 70.5, 2019], // 70½ on 2019-06-30
    ['1949-01-15', 70.5, 2019], // 70½ on 2019-07-15
    ['1949-06-30', 70.5, 2019], // last day of the 70½ cohort; 70½ on 2019-12-30
    ['1949-07-01', 72, 2021], // first day of the age-72 cohort
    ['1950-12-31', 72, 2022], // last day of the age-72 cohort
    ['1951-01-01', 73, 2024], // first day of the age-73 cohort
    ['1955-06-15', 73, 2028],
    ['1959-12-31', 73, 2032], // 1959 resolved to 73 (2024 proposed regs)
    ['1960-01-01', 75, 2035], // first day of the age-75 cohort
    ['1965-08-20', 75, 2040],
  ])('born %s → age %s, first RMD year %s', (dob, age, year) => {
    const s = start(dob);
    expect(s.applicableAge).toBe(age);
    expect(s.firstRmdYear).toBe(year);
    expect(s.requiredBeginningDate).toEqual({ year: year + 1, month: 4, day: 1 });
  });

  it('computes the 70½ date six calendar months after the 70th birthday', () => {
    expect(dateAttaining70AndAHalf(parseIsoDate('1949-06-30')!)).toEqual({ year: 2019, month: 12, day: 30 });
    // Aug 31 + 6 months has no Feb 31 → last day of February.
    expect(dateAttaining70AndAHalf(parseIsoDate('1955-08-31')!)).toEqual({ year: 2026, month: 2, day: 28 });
  });
});

describe('Uniform Lifetime Table (2022+)', () => {
  it.each([
    [72, 27.4],
    [73, 26.5],
    [74, 25.5],
    [75, 24.6],
    [80, 20.2],
    [85, 16.0],
    [90, 12.2],
    [95, 8.9],
    [100, 6.4],
    [110, 3.5],
    [120, 2.0],
    [124, 2.0], // 120 and over
  ])('age %i → %f', (age, divisor) => {
    expect(uniformLifetimeDivisor(age)).toBe(divisor);
  });

  it('has no factor below age 72', () => {
    expect(() => uniformLifetimeDivisor(71)).toThrow();
  });
});

describe('basic RMD', () => {
  it('divides the prior Dec 31 balance by the distribution period', () => {
    // $500,000 at age 75: 500,000 / 24.6 = 20,325.203...
    expect(computeRmd(500_000, 24.6)).toBeCloseTo(20_325.2033, 4);
  });
  it('is zero on a zero balance', () => {
    expect(computeRmd(0, 24.6)).toBe(0);
  });
});

describe('helpers', () => {
  it('weights stock and bond returns', () => {
    // 60% × 7% + 40% × 3% = 5.4%
    expect(effectiveAnnualReturn({ mode: 'allocation', stockWeight: 0.6, stockReturn: 0.07, bondReturn: 0.03 })).toBeCloseTo(0.054, 12);
    expect(effectiveAnnualReturn({ mode: 'single', annualReturn: 0.05 })).toBe(0.05);
  });

  it('looks up published QCD limits and the assumed future limit', () => {
    expect(qcdLimitForYear(DEFAULT_QCD_LIMIT_SETTINGS, 2024)).toBe(105_000);
    expect(qcdLimitForYear(DEFAULT_QCD_LIMIT_SETTINGS, 2025)).toBe(108_000);
    expect(qcdLimitForYear(DEFAULT_QCD_LIMIT_SETTINGS, 2026)).toBe(111_000);
    expect(qcdLimitForYear({ ...DEFAULT_QCD_LIMIT_SETTINGS, assumedFutureLimit: 120_000 }, 2030)).toBe(120_000);
  });

  it('allocates pro rata and never overdraws', () => {
    expect(allocateProRata(30, [60, 40])).toEqual([18, 12]);
    expect(allocateProRata(500, [60, 40])).toEqual([60, 40]);
    expect(allocateProRata(10, [0, 0])).toEqual([0, 0]);
  });

  it('rejects impossible dates', () => {
    expect(parseIsoDate('1955-02-30')).toBeNull();
    expect(parseIsoDate('1955-13-01')).toBeNull();
    expect(parseIsoDate('not a date')).toBeNull();
    expect(parseIsoDate('1956-02-29')).toEqual({ year: 1956, month: 2, day: 29 });
  });
});
