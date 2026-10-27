/** Display formatting only. Calculations are never rounded. */

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function formatUsd(n: number): string {
  // Avoid "-$0" for tiny negative floating-point residue.
  return usd0.format(Math.abs(n) < 0.5 ? 0 : n);
}

/** Compact axis labels: $1.2M, $850K. */
export function formatUsdCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** 0.054 → "5.4%" */
export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatSignedUsd(n: number): string {
  if (Math.abs(n) < 0.5) return '$0';
  return `${n > 0 ? '+' : '−'}${usd0.format(Math.abs(n))}`;
}
