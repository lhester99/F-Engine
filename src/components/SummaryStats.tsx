import type { ProjectionSummary } from '../calculations/summary';
import type { WealthComparison } from '../calculations/wealth';
import { formatPercent, formatUsd } from '../utils/format';

interface Props {
  baseline: ProjectionSummary;
  strategy: ProjectionSummary;
  wealth?: WealthComparison | null;
}

interface Tile {
  label: string;
  value: string;
  sub?: string;
  base: string;
}

/** Headline answers: how large, how fast, and the effect of the strategy. */
export function SummaryStats({ baseline, strategy, wealth }: Props) {
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
      label: 'Total required RMDs',
      value: formatUsd(strategy.totalRequiredRmd),
      sub:
        strategy.rmdAnnualGrowth === null
          ? `Taxable distributions ${formatUsd(strategy.totalTaxableDistributions)}`
          : `Growing ${formatPercent(strategy.rmdAnnualGrowth)} a year`,
      base: formatUsd(baseline.totalRequiredRmd),
    },
  ];
  if (wealth) {
    tiles.push({
      label: 'After-tax value at end',
      value: formatUsd(wealth.endStrategy),
      sub: wealth.identical
        ? 'Same as no strategy'
        : wealth.breakevenAge === null
          ? 'Behind no strategy at the end'
          : wealth.crossesOver
            ? `Pulls ahead at age ${wealth.breakevenAge}`
            : 'Ahead from the first year',
      base: formatUsd(wealth.endBaseline),
    });
  }
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
