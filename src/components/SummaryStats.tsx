import type { ProjectionSummary } from '../calculations/summary';
import { formatPercent, formatUsd } from '../utils/format';

interface Props {
  baseline: ProjectionSummary;
  strategy: ProjectionSummary;
}

interface Tile {
  label: string;
  value: string;
  sub?: string;
  base: string;
}

/** Headline answers: how large, how fast, and the effect of the strategy. */
export function SummaryStats({ baseline, strategy }: Props) {
  const point = (p: ProjectionSummary['peakRmd']) => (p ? `age ${p.age} (${p.year})` : 'none in projection');
  const tiles: Tile[] = [
    {
      label: 'First required RMD',
      value: strategy.firstRmd ? formatUsd(strategy.firstRmd.amount) : '—',
      sub: point(strategy.firstRmd),
      base: baseline.firstRmd ? formatUsd(baseline.firstRmd.amount) : '—',
    },
    {
      label: 'Peak annual RMD',
      value: strategy.peakRmd ? formatUsd(strategy.peakRmd.amount) : '—',
      sub: point(strategy.peakRmd),
      base: baseline.peakRmd ? `${formatUsd(baseline.peakRmd.amount)} at ${point(baseline.peakRmd)}` : '—',
    },
    {
      label: 'RMD growth (annualized)',
      value: strategy.rmdAnnualGrowth === null ? '—' : formatPercent(strategy.rmdAnnualGrowth),
      sub: 'first to last RMD year',
      base: baseline.rmdAnnualGrowth === null ? '—' : formatPercent(baseline.rmdAnnualGrowth),
    },
    {
      label: 'Total required RMDs',
      value: formatUsd(strategy.totalRequiredRmd),
      sub: `Taxable distributions ${formatUsd(strategy.totalTaxableDistributions)}`,
      base: formatUsd(baseline.totalRequiredRmd),
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="summary-stats">
      {tiles.map((t) => (
        <div key={t.label} className="panel px-3 py-2.5">
          <dt className="text-xs font-medium text-muted">{t.label}</dt>
          <dd>
            <span className="block text-lg font-semibold tracking-tight text-ink sm:text-xl">{t.value}</span>
            {t.sub && <span className="block text-xs text-ink-2">{t.sub}</span>}
            <span className="mt-1 block border-t border-line-soft pt-1 text-xs text-muted">No strategy: {t.base}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
