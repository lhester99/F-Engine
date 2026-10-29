/**
 * Federal income tax parameters. 2026 values are from IRS Rev. Proc. 2025-32 as
 * reported by several secondary sources (see docs/research.md); they reflect the
 * One Big Beautiful Bill Act (Pub. L. 119-21, July 4, 2025), which made the
 * 2017 rate structure permanent and added the 2025–2028 senior deduction.
 *
 * Later years are projected from 2026 at the inflation rate the advisor enters,
 * with the statutory rounding rules below. Amounts fixed in statute (Social
 * Security taxation thresholds, NIIT thresholds, senior-deduction phase-out) are
 * never indexed.
 */
import type { FilingStatus } from '../types';

export interface Bracket {
  rate: number;
  /** Top of the bracket (taxable income); Infinity for the last. */
  upTo: number;
}

export interface FederalTaxYear {
  year: number;
  brackets: Record<FilingStatus, Bracket[]>;
  standardDeduction: Record<FilingStatus, number>;
  /** Additional standard deduction per person age 65+ (single filer / each married spouse). */
  additional65: { single: number; marriedPerPerson: number };
  /** Long-term capital gains / qualified dividends: top of the 0% band and top of the 15% band (taxable income). */
  capitalGains: Record<FilingStatus, { zeroUpTo: number; fifteenUpTo: number }>;
  source: string;
}

export const FEDERAL_TAX_2026: FederalTaxYear = {
  year: 2026,
  brackets: {
    single: [
      { rate: 0.1, upTo: 12_400 },
      { rate: 0.12, upTo: 50_400 },
      { rate: 0.22, upTo: 105_700 },
      { rate: 0.24, upTo: 201_775 },
      { rate: 0.32, upTo: 256_225 },
      { rate: 0.35, upTo: 640_600 },
      { rate: 0.37, upTo: Infinity },
    ],
    joint: [
      { rate: 0.1, upTo: 24_800 },
      { rate: 0.12, upTo: 100_800 },
      { rate: 0.22, upTo: 211_400 },
      { rate: 0.24, upTo: 403_550 },
      { rate: 0.32, upTo: 512_450 },
      { rate: 0.35, upTo: 768_700 },
      { rate: 0.37, upTo: Infinity },
    ],
  },
  standardDeduction: { single: 16_100, joint: 32_200 },
  additional65: { single: 2_050, marriedPerPerson: 1_650 },
  capitalGains: {
    single: { zeroUpTo: 49_450, fifteenUpTo: 545_500 },
    joint: { zeroUpTo: 98_900, fifteenUpTo: 613_700 },
  },
  source: 'IRS Rev. Proc. 2025-32 (secondary sources; see docs/research.md)',
};

export const LATEST_FEDERAL_TAX_YEAR = FEDERAL_TAX_2026;

/** Indexed bracket and capital-gains thresholds round down to a multiple of $25 (IRC §1(f)(7)). */
export const BRACKET_ROUNDING = 25;
/** Indexed standard deduction amounts round down to a multiple of $50 (IRC §63(c)(4)). */
export const DEDUCTION_ROUNDING = 50;

/** Enhanced deduction for seniors, IRC §151(d)(5) as added by Pub. L. 119-21 §70103. */
export const SENIOR_DEDUCTION = {
  perPerson: 6_000,
  firstYear: 2025,
  lastYear: 2028,
  /** Each qualifying person's deduction falls by this share of MAGI over the threshold. */
  phaseOutRate: 0.06,
  phaseOutStart: { single: 75_000, joint: 150_000 } as Record<FilingStatus, number>,
};

/** Taxation of Social Security benefits, IRC §86. Not indexed. */
export const SOCIAL_SECURITY_TAXATION = {
  base: { single: 25_000, joint: 32_000 } as Record<FilingStatus, number>,
  adjusted: { single: 34_000, joint: 44_000 } as Record<FilingStatus, number>,
};

/** Net investment income tax, IRC §1411. Not indexed. */
export const NIIT = {
  rate: 0.038,
  threshold: { single: 200_000, joint: 250_000 } as Record<FilingStatus, number>,
};
