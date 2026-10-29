import type { IrmaaSummary } from '../calculations/irmaa';
import type { TaxComparison, TaxTotals } from '../calculations/taxComparison';
import type { AnalysisSettings } from '../types';
import { formatPercent, formatUsd } from '../utils/format';

interface Props {
  tax: TaxComparison | null;
  baselineIrmaa: IrmaaSummary | null;
  strategyIrmaa: IrmaaSummary | null;
  analysis: AnalysisSettings;
}

interface Row {
  label: string;
  value: (t: TaxTotals) => number;
  strong?: boolean;
  indent?: boolean;
}

/** Estimated taxes with and without the strategy, now versus later, and the breakeven heirs' rate. */
export function TradeOffs({ tax, baselineIrmaa, strategyIrmaa, analysis }: Props) {
  if (!tax || !baselineIrmaa || !strategyIrmaa) return null;
  const heirs = formatPercent(analysis.heirsTaxRate, 0);
  const rows: Row[] = [
    { label: 'Federal income tax', value: (t) => t.federal },
    { label: 'State income tax', value: (t) => t.state },
    { label: 'IRMAA surcharges', value: (t) => t.irmaa },
    { label: 'Total during the projection', value: (t) => t.lifetime, strong: true },
    { label: 'Pre-tax balance left at the end', value: (t) => t.endingPretax },
    { label: `Heirs' tax on it at ${heirs}`, value: (t) => t.heirsTax, indent: true },
    { label: 'Total including heirs', value: (t) => t.total, strong: true },
    { label: 'Total including heirs, present value', value: (t) => t.totalPv, strong: true },
  ];
  const diff = (v: number) => (Math.abs(v) < 0.5 ? '$0' : v > 0 ? `+${formatUsd(v)}` : `−${formatUsd(-v)}`);
  const net = tax.netTaxPv;
  const be = tax.breakevenHeirsRate;

  return (
    <section className="panel p-3 sm:p-4" aria-labelledby="tradeoffs-title" data-testid="tradeoffs">
      <h2 id="tradeoffs-title" className="text-sm font-semibold text-ink">Tax trade-off</h2>
      <p className="mb-3 text-xs text-muted">
        Estimated federal and state income tax from the brackets, plus IRMAA. Estimates at your assumptions, not a tax return.
      </p>

      <div className="grid gap-3 sm:grid-cols-3" data-testid="tax-summary">
        <div className="rounded-md border border-line px-3 py-2">
          <p className="text-xs text-muted">Paid earlier (years the strategy raises income)</p>
          <p className="text-lg font-semibold text-ink tabular-nums">{formatUsd(tax.taxPaidEarlier)}</p>
          <p className="text-xs text-muted tabular-nums">Present value {formatUsd(tax.taxPaidEarlierPv)}</p>
        </div>
        <div className="rounded-md border border-line px-3 py-2">
          <p className="text-xs text-muted">Avoided later, including heirs</p>
          <p className="text-lg font-semibold text-ink tabular-nums">{formatUsd(tax.taxAvoidedLater)}</p>
          <p className="text-xs text-muted tabular-nums">Present value {formatUsd(tax.taxAvoidedLaterPv)}</p>
        </div>
        <div className="rounded-md border border-line px-3 py-2">
          <p className="text-xs text-muted">Net, present value</p>
          <p className="text-lg font-semibold text-ink tabular-nums">
            {Math.abs(net) < 0.5 ? 'No difference' : net > 0 ? `${formatUsd(net)} lower` : `${formatUsd(-net)} higher`}
          </p>
          <p className="text-xs text-muted">Strategy vs. no strategy</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-ink" data-testid="breakeven">
        {be === null ? (
          'The strategy does not leave less pre-tax money, so there is no breakeven heirs’ rate.'
        ) : be === 0 ? (
          'The strategy’s estimated total is lower even if heirs pay no tax on the pre-tax balance.'
        ) : (
          <>
            Breakeven: the strategy’s estimated total comes out lower whenever the heirs’ tax rate is above{' '}
            <strong>{formatPercent(be)}</strong>.
          </>
        )}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[440px] text-sm tabular-nums" data-testid="tax-table">
          <caption className="sr-only">Estimated taxes, no strategy compared with strategy</caption>
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th scope="col" className="py-1 pr-2 text-left font-medium" />
              <th scope="col" className="px-2 py-1 text-right font-medium">No strategy</th>
              <th scope="col" className="px-2 py-1 text-right font-medium">Strategy</th>
              <th scope="col" className="py-1 pl-2 text-right font-medium">Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={`border-b border-line-soft ${r.strong ? 'font-semibold' : ''}`}>
                <th scope="row" className={`py-1.5 pr-2 text-left ${r.strong ? 'text-ink' : 'font-normal text-ink-2'} ${r.indent ? 'pl-4' : ''}`}>
                  {r.label}
                </th>
                <td className="px-2 py-1.5 text-right">{formatUsd(r.value(tax.baseline))}</td>
                <td className="px-2 py-1.5 text-right">{formatUsd(r.value(tax.strategy))}</td>
                <td className="py-1.5 pl-2 text-right">{diff(r.value(tax.strategy) - r.value(tax.baseline))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        IRMAA: {baselineIrmaa.yearsWithSurcharge} surcharge year{baselineIrmaa.yearsWithSurcharge === 1 ? '' : 's'} without the strategy,{' '}
        {strategyIrmaa.yearsWithSurcharge} with it. Present value at {formatPercent(tax.discountRate)} a year
        {analysis.discountMatchesReturn ? ' (the investment return)' : ''}. Taxes include the tax on taxable-account dividends,
        realized gains, and cash interest.
        {tax.qcdExcludedIncome > 0.5
          ? ` QCD gifts (${formatUsd(tax.qcdExcludedIncome)}) count as income not taxed; the gifts themselves are not counted as a cost.`
          : ''}
      </p>
    </section>
  );
}
