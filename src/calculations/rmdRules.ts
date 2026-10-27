import {
  UNIFORM_LIFETIME_TABLE,
  UNIFORM_LIFETIME_TABLE_MAX_AGE,
  UNIFORM_LIFETIME_TABLE_MIN_AGE,
} from '../data/uniformLifetimeTable';
import { compareDates, dateAttaining70AndAHalf, type CalendarDate } from './dates';

/** Applicable age for lifetime RMDs: 70.5, 72, 73, or 75. */
export type ApplicableAge = 70.5 | 72 | 73 | 75;

export interface RmdStart {
  applicableAge: ApplicableAge;
  /** First distribution calendar year: the year the applicable age is attained. */
  firstRmdYear: number;
  /** Required beginning date for the first RMD (April 1 of the following year). */
  requiredBeginningDate: CalendarDate;
}

/**
 * RMD applicable age by date of birth (IRC §401(a)(9)(C) as amended by the
 * SECURE Act and SECURE 2.0 §107; Treas. Reg. §1.401(a)(9)-2(b)):
 *   born before July 1, 1949            → 70½
 *   born July 1, 1949 – Dec 31, 1950    → 72
 *   born 1951 – 1959                    → 73
 *   born 1960 or later                  → 75
 * The 1959 cohort follows the July 2024 proposed regulations (age 73), which
 * resolve the SECURE 2.0 drafting overlap; see docs/research.md.
 */
export function getRmdStart(birth: CalendarDate): RmdStart {
  let applicableAge: ApplicableAge;
  let firstRmdYear: number;
  if (compareDates(birth, { year: 1949, month: 7, day: 1 }) < 0) {
    applicableAge = 70.5;
    firstRmdYear = dateAttaining70AndAHalf(birth).year;
  } else {
    applicableAge = birth.year <= 1950 ? 72 : birth.year <= 1959 ? 73 : 75;
    firstRmdYear = birth.year + applicableAge;
  }
  return {
    applicableAge,
    firstRmdYear,
    requiredBeginningDate: { year: firstRmdYear + 1, month: 4, day: 1 },
  };
}

/**
 * Uniform Lifetime Table distribution period for the age attained in the
 * distribution year. Ages above 120 use the 120-and-over figure. Ages below
 * 72 are not in the 2022+ table and are never reached by projections that
 * start in 2022 or later.
 */
export function uniformLifetimeDivisor(age: number): number {
  if (!Number.isInteger(age)) throw new Error(`Age must be a whole number, got ${age}`);
  if (age < UNIFORM_LIFETIME_TABLE_MIN_AGE) {
    throw new Error(`The Uniform Lifetime Table (2022+) has no entry for age ${age}`);
  }
  const key = Math.min(age, UNIFORM_LIFETIME_TABLE_MAX_AGE);
  const divisor = UNIFORM_LIFETIME_TABLE[key];
  if (divisor === undefined) throw new Error(`Missing Uniform Lifetime Table entry for age ${key}`);
  return divisor;
}

/** RMD = prior December 31 balance ÷ distribution period. Not rounded. */
export function computeRmd(priorYearEndBalance: number, distributionPeriod: number): number {
  if (priorYearEndBalance <= 0) return 0;
  return priorYearEndBalance / distributionPeriod;
}
