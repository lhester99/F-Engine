import type { IrmaaSummary } from '../calculations/irmaa';
import type { TaxComparison } from '../calculations/taxComparison';
import type { AnalysisSettings, EngineMessage } from '../types';
import { formatPercent, formatSignedUsd, formatUsd } from '../utils/format';
import { MessageList } from './MessageList';

interface Props {
  tax: TaxComparison | null;
  baselineIrmaa: IrmaaSummary | null;
  strategyIrmaa: IrmaaSummary | null;
  analysis: AnalysisSettings;
  errors: EngineMessage[];
}

/** Estimated tax trade-off at the entered rates, plus the IRMAA comparison. */
export function TradeOffs({ tax, baselineIrmaa, strategyIrmaa, analysis, errors }: Props) {
  if (errors.length > 0 || !tax || !baselineIrmaa || !strategyIrmaa) {
    return (
      <section className="panel p-4" aria-labelledby="tradeoffs-title">
        <h2 id="tradeoffs-title" className="mb-2 text-sm font-semibold text-ink">Trade-offs</h2>
        <MessageList messages={errors} />
      </section>
    );
  }
  const net = (v: number) => (Math.abs(v) < 0.5 ? '$0' : v > 0 ? `${formatUsd(v)} lower` : `${formatUsd(-v)} higher`);
  const irmaaText = (x: IrmaaSummary) =>
    x.yearsWithSurcharge === 0 ? 'None' : `${x.yearsWithSurcharge} yr · tier ${x.highestTier} max`;

  return (
    <section className="panel p-3 sm:p-4" aria-labelledby="tradeoffs-title" data-testid="tradeoffs">
      <h2 id="tradeoffs-title" className="text-sm font-semibold text-ink">Trade-offs</h2>
      <p className="mb-3 text-xs text-muted">
        Estimates at the tax rates entered ({formatPercent(analysis.addedIncomeTaxRate, 0)} on income added,{' '}
        {formatPercent(analysis.avoidedIncomeTaxRate, 0)} on income avoided). Not a tax calculation.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm tabular-nums" data-testid="tax-table">
            <caption className="mb-1 text-left text-xs font-semibold text-ink-2">Estimated income tax, strategy vs. no strategy</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-1 pr-2 text-left font-medium" />
                <th scope="col" className="px-2 py-1 text-right font-medium">Income</th>
                <th scope="col" className="px-2 py-1 text-right font-medium">Tax</th>
                <th scope="col" className="py-1 pl-2 text-right font-medium">Tax, present value</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line-soft">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink-2">Taxable income added</th>
                <td className="px-2 py-1.5 text-right">{formatUsd(tax.addedIncome)}</td>
                <td className="px-2 py-1.5 text-right">{formatUsd(tax.taxOnAdded)}</td>
                <td className="py-1.5 pl-2 text-right">{formatUsd(tax.taxOnAddedPv)}</td>
              </tr>
              <tr className="border-b border-line-soft">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink-2">Taxable income avoided</th>
                <td className="px-2 py-1.5 text-right">{formatUsd(tax.avoidedIncome)}</td>
                <td className="px-2 py-1.5 text-right">{formatUsd(tax.taxAvoided)}</td>
                <td className="py-1.5 pl-2 text-right">{formatUsd(tax.taxAvoidedPv)}</td>
              </tr>
              {tax.qcdExcludedIncome > 0.5 && (
                <tr className="border-b border-line-soft">
                  <th scope="row" className="py-1.5 pr-2 pl-4 text-left font-normal text-ink-2">of which QCD gifts</th>
                  <td className="px-2 py-1.5 text-right">{formatUsd(tax.qcdExcludedIncome)}</td>
                  <td className="px-2 py-1.5" />
                  <td className="py-1.5 pl-2" />
                </tr>
              )}
              <tr className="font-semibold">
                <th scope="row" className="py-1.5 pr-2 text-left text-ink">Net estimated tax</th>
                <td className="px-2 py-1.5" />
                <td className="px-2 py-1.5 text-right">{net(tax.netTax)}</td>
                <td className="py-1.5 pl-2 text-right">{net(tax.netTaxPv)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-sm text-ink" data-testid="breakeven">
            {tax.breakevenAvoidedRate === null ? (
              'The strategy does not shift taxable income, so there is no breakeven rate.'
            ) : (
              <>
                Breakeven: estimated tax is lower in present value whenever the tax rate on avoided income is above{' '}
                <strong>{formatPercent(tax.breakevenAvoidedRate)}</strong>.
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            Includes the pre-tax balance left at the end ({formatSignedUsd(tax.endingPretaxDifference)} vs. no strategy), taxed
            at the avoided rate whenever it is withdrawn. Present value at {formatPercent(tax.discountRate)} a year
            {analysis.discountMatchesReturn ? ' (the investment return)' : ''}.
            {tax.qcdExcludedIncome > 0.5 ? ' QCD gifts count as income not taxed; the gifts themselves are not counted as a cost.' : ''}
          </p>
        </div>

        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm tabular-nums" data-testid="irmaa-table">
            <caption className="mb-1 text-left text-xs font-semibold text-ink-2">Medicare IRMAA (estimated)</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-1 pr-2 text-left font-medium" />
                <th scope="col" className="px-2 py-1 text-right font-medium">No strategy</th>
                <th scope="col" className="py-1 pl-2 text-right font-medium">Strategy</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line-soft">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink-2">Surcharge years</th>
                <td className="px-2 py-1.5 text-right">{irmaaText(baselineIrmaa)}</td>
                <td className="py-1.5 pl-2 text-right">{irmaaText(strategyIrmaa)}</td>
              </tr>
              <tr className="border-b border-line-soft">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink-2">Total surcharges</th>
                <td className="px-2 py-1.5 text-right">{formatUsd(baselineIrmaa.totalSurcharge)}</td>
                <td className="py-1.5 pl-2 text-right">{formatUsd(strategyIrmaa.totalSurcharge)}</td>
              </tr>
              <tr className="font-semibold">
                <th scope="row" className="py-1.5 pr-2 text-left text-ink">Difference</th>
                <td className="px-2 py-1.5" />
                <td className="py-1.5 pl-2 text-right">{net(tax.irmaaDifference)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Based on income two years before each premium year, with {analysis.medicareEnrollees === 2 ? 'two people' : 'one person'} on
            Medicare ({analysis.filingStatus === 'joint' ? 'joint' : 'single'} thresholds). Counts premium years within the projection.
            Thresholds after 2026 are projected at {formatPercent(analysis.inflationRate)} inflation.
          </p>
        </div>
      </div>
    </section>
  );
}
