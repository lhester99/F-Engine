/**
 * Medicare Income-Related Monthly Adjustment Amounts (IRMAA), Social Security
 * Act §1839(i) (Part B) and §1860D-13(a)(7) (Part D).
 *
 * Premium-year figures are based on modified adjusted gross income (MAGI)
 * from the tax return two years earlier. Single covers single, head of
 * household, and qualifying surviving spouse filers. Married filing separately
 * uses a different schedule and is not supported.
 *
 * Tier rule: a tier applies when MAGI is MORE THAN its lower bound, except the
 * top tier, which applies at or above its bound.
 *
 * Surcharges are the monthly amounts added on top of the standard Part B
 * premium and the beneficiary's Part D plan premium, per enrolled person.
 * See docs/research.md for sources and verification status.
 */
export interface IrmaaTier {
  /** Lower MAGI bound, single filers. */
  single: number;
  /** Lower MAGI bound, married filing jointly. */
  joint: number;
  /** Monthly Part B surcharge per person. */
  partB: number;
  /** Monthly Part D surcharge per person. */
  partD: number;
}

export interface IrmaaSchedule {
  premiumYear: number;
  /** Tiers 1–5 in ascending order. Tier 0 (no surcharge) is implied. */
  tiers: IrmaaTier[];
  standardPartB: number;
  source: string;
}

export const IRMAA_2026: IrmaaSchedule = {
  premiumYear: 2026,
  standardPartB: 202.9,
  tiers: [
    { single: 109_000, joint: 218_000, partB: 81.2, partD: 14.5 },
    { single: 137_000, joint: 274_000, partB: 202.9, partD: 37.5 },
    { single: 171_000, joint: 342_000, partB: 324.6, partD: 60.4 },
    { single: 205_000, joint: 410_000, partB: 446.3, partD: 83.3 },
    { single: 500_000, joint: 750_000, partB: 487.0, partD: 91.0 },
  ],
  source: 'CMS 2026 Part B premium and IRMAA announcement (secondary sources; see docs/research.md)',
};

/** Latest published schedule. Later premium years are projected from it. */
export const LATEST_IRMAA_SCHEDULE = IRMAA_2026;

/**
 * The top-tier thresholds ($500,000 / $750,000) are fixed in statute through
 * this premium year and indexed for inflation afterward (SSA §1839(i)(3)(C)).
 */
export const IRMAA_TOP_TIER_FIXED_THROUGH = 2027;

/** Indexed thresholds are rounded to the nearest multiple of $1,000 (SSA §1839(i)(5)(B)). */
export const IRMAA_THRESHOLD_ROUNDING = 1_000;
