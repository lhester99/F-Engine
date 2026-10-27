/**
 * Annual per-person Qualified Charitable Distribution limit (IRC §408(d)(8)).
 * Indexed for inflation beginning in 2024 under SECURE 2.0 §307.
 *
 * These are dated, published values. Years after the last published year use
 * an assumed limit that the advisor can edit in the app (default: the latest
 * published value held flat, which understates future indexed limits).
 * See docs/research.md for sources and verification status.
 */
export interface QcdLimitEntry {
  year: number;
  limit: number;
  source: string;
}

export const PUBLISHED_QCD_LIMITS: readonly QcdLimitEntry[] = [
  { year: 2022, limit: 100_000, source: 'IRC §408(d)(8)(A) (pre-indexing statutory limit)' },
  { year: 2023, limit: 100_000, source: 'IRC §408(d)(8)(A) (pre-indexing statutory limit)' },
  { year: 2024, limit: 105_000, source: 'IRS Notice 2023-75' },
  { year: 2025, limit: 108_000, source: 'IRS Notice 2024-80' },
  { year: 2026, limit: 111_000, source: 'IRS Notice 2025-67 (secondary sources; see docs/research.md)' },
];

export const LATEST_PUBLISHED_QCD_YEAR = Math.max(...PUBLISHED_QCD_LIMITS.map((e) => e.year));
export const LATEST_PUBLISHED_QCD_LIMIT =
  PUBLISHED_QCD_LIMITS.find((e) => e.year === LATEST_PUBLISHED_QCD_YEAR)!.limit;

/** Settings the engine uses to look up the QCD limit for any year. */
export interface QcdLimitSettings {
  published: readonly QcdLimitEntry[];
  /** Limit assumed for every year after the latest published year. */
  assumedFutureLimit: number;
}

export const DEFAULT_QCD_LIMIT_SETTINGS: QcdLimitSettings = {
  published: PUBLISHED_QCD_LIMITS,
  assumedFutureLimit: LATEST_PUBLISHED_QCD_LIMIT,
};
