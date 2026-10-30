import type { ConversionAnalysis } from '../calculations/conversionAnalysis';
import { formatPercent, formatUsd } from '../utils/format';

const cents = (r: number) => `${Math.round(r * 100)}¢`;

function Tile({ label, value, sub, testId }: { label: string; value: string; sub: string; testId: string }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface px-3 py-2.5" data-testid={testId}>
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs text-ink-2">{sub}</p>
    </div>
  );
}

/**
 * Four headline figures for the Roth conversions, shown at the top of the Tax
 * Brackets tab: total converted, tax added by converting, and the plan's
 * breakeven tax rate and breakeven age. Nothing is shown without conversions.
 */
export function ConversionSummary({ analysis: a }: { analysis: ConversionAnalysis }) {
  if (a.totalConverted < 0.5) return null;
  const ages = a.firstAge === a.lastAge ? `age ${a.firstAge}` : `ages ${a.firstAge}–${a.lastAge}`;
  const be = a.breakevenRate;
  const rateValue = be === null ? 'None' : be === 0 ? 'Any rate' : formatPercent(be);
  const rateSub =
    be === null
      ? 'The plan does not leave less pre-tax money behind, so no future tax rate makes it pay off.'
      : be === 0
        ? 'The plan’s total estimated tax is lower even if the pre-tax money left were never taxed.'
        : `Pays off in tax if the pre-tax money left behind is taxed above ${formatPercent(be)}. Assumed: ${formatPercent(a.assumedLaterRate)}.`;
  const ageValue = a.breakevenAge === null ? 'Not reached' : `Age ${a.breakevenAge}`;
  const ageSub =
    a.breakevenAge === null
      ? 'After-tax wealth with the plan stays below no strategy through the end of the projection.'
      : a.crossesOver
        ? `In ${a.breakevenYear}, after-tax wealth with the plan catches up to no strategy and stays ahead.`
        : 'After-tax wealth with the plan is at or above no strategy from the first year.';

  return (
    <section aria-label="Roth conversion summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="conversion-summary">
      <Tile
        testId="conv-total"
        label="Total converted"
        value={formatUsd(a.totalConverted)}
        sub={`${ages}, ${a.years.length} year${a.years.length === 1 ? '' : 's'}`}
      />
      <Tile
        testId="conv-cost"
        label="Tax added by converting"
        value={formatUsd(a.totalAdded)}
        sub={`${formatUsd(a.totalAddedTax)} federal & state${a.totalAddedIrmaa > 0.5 ? ` + ${formatUsd(a.totalAddedIrmaa)} Medicare surcharge` : ''} · about ${cents(a.averageRate)} per $1 converted`}
      />
      <Tile testId="conv-breakeven-rate" label="Breakeven tax rate" value={rateValue} sub={rateSub} />
      <Tile testId="conv-breakeven-age" label="Breakeven age" value={ageValue} sub={ageSub} />
    </section>
  );
}
