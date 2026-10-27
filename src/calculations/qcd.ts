import type { QcdLimitSettings } from '../data/qcdLimits';

/** Per-person QCD limit for a calendar year: the published figure, or the assumed future limit. */
export function qcdLimitForYear(settings: QcdLimitSettings, year: number): number {
  const published = settings.published.find((e) => e.year === year);
  if (published) return published.limit;
  const latest = Math.max(...settings.published.map((e) => e.year));
  if (year > latest) return settings.assumedFutureLimit;
  // Years before the earliest table entry fall back to the statutory $100,000.
  return 100_000;
}
