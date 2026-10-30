import type { ConversionAnalysis } from '../calculations/conversionAnalysis';
import { ConversionChart } from '../charts/ConversionChart';
import { ChartLegend, HatchSwatch, SolidSwatch } from '../charts/Legend';
import { SERIES_COLORS, type AxisMode } from '../charts/RmdChart';
import { formatPercent, formatUsd } from '../utils/format';

interface Props {
  analysis: ConversionAnalysis;
  axis: AxisMode;
  selectedYear: number | null;
  onSelectYear: (year: number) => void;
}

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

/** The Roth Conversions tab: what the conversions cost, when the plan breaks even, and the year-by-year detail. */
export function ConversionView({ analysis: a, axis, selectedYear, onSelectYear }: Props) {
  if (a.totalConverted < 0.5) {
    return (
      <p className="rounded-md border border-line-soft bg-canvas px-3 py-6 text-center text-sm text-ink-2" data-testid="conversion-empty">
        No Roth conversions are entered yet. Add them under Planning levers › Roth conversions (a fixed amount or fill to a
        bracket) to see what they cost and when they break even.
      </p>
    );
  }
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
  const total = (f: (y: ConversionAnalysis['years'][number]) => number) => a.years.reduce((s, y) => s + f(y), 0);

  return (
    <div className="space-y-3" data-testid="conversion-view">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile testId="conv-total" label="Total converted" value={formatUsd(a.totalConverted)} sub={`${ages}, ${a.years.length} year${a.years.length === 1 ? '' : 's'}`} />
        <Tile
          testId="conv-cost"
          label="Tax added by converting"
          value={formatUsd(a.totalAdded)}
          sub={`${formatUsd(a.totalAddedTax)} federal & state${a.totalAddedIrmaa > 0.5 ? ` + ${formatUsd(a.totalAddedIrmaa)} Medicare surcharge` : ''} · about ${cents(a.averageRate)} per $1 converted`}
        />
        <Tile testId="conv-breakeven-rate" label="Breakeven tax rate" value={rateValue} sub={rateSub} />
        <Tile testId="conv-breakeven-age" label="Breakeven age" value={ageValue} sub={ageSub} />
      </div>

      <ConversionChart rows={a.chart} axis={axis} selectedYear={selectedYear} onSelectYear={onSelectYear} />
      <ChartLegend
        label="Chart legend"
        items={[
          { label: 'No strategy', swatch: <HatchSwatch /> },
          { label: 'With the strategy: tax paid anyway', swatch: <SolidSwatch color={SERIES_COLORS.strategy} /> },
          { label: 'Added by the conversion', swatch: <SolidSwatch color={SERIES_COLORS.conversion} /> },
        ]}
      />
      <p className="text-xs text-ink-2" data-testid="chart-caption">
        Estimated federal and state income tax each year. In conversion years the green part is what the conversion adds on
        top of the tax the household pays anyway.
        {a.laterTaxReduced > 0.5 && ` In later years, smaller RMDs lower the tax by about ${formatUsd(a.laterTaxReduced)} in total.`}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm tabular-nums" data-testid="conversion-cost-table">
          <caption className="sr-only">Each conversion year: tax paid anyway and tax added by the conversion</caption>
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th scope="col" className="py-1.5 pr-2 text-left font-medium">Age (year)</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Converted</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Tax paid anyway</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Tax added</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Medicare surcharge added</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Total added</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Per $1 converted</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Bracket</th>
              <th scope="col" className="py-1.5 pl-2 text-left font-medium">Tax paid from</th>
            </tr>
          </thead>
          <tbody>
            {a.years.map((y) => {
              const from = [
                y.paidFromTaxable > 0.5 ? 'taxable account' : '',
                y.paidFromCash > 0.5 ? 'cash' : '',
                y.withheld > 0.5 ? 'withheld' : '',
              ].filter(Boolean);
              return (
                <tr key={y.year} className="border-b border-line-soft">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink-2">
                    {y.age} <span className="text-muted">({y.year})</span>
                  </th>
                  <td className="px-2 py-1.5 text-right text-ink">{formatUsd(y.conversion)}</td>
                  <td className="px-2 py-1.5 text-right text-ink">{formatUsd(y.taxWithout)}</td>
                  <td className="px-2 py-1.5 text-right text-ink">{formatUsd(y.addedTax)}</td>
                  <td className="px-2 py-1.5 text-right text-ink">
                    {y.addedIrmaa > 0.5 ? (
                      <>
                        {formatUsd(y.addedIrmaa)} <span className="text-xs text-muted">({y.premiumYear}, tier {y.irmaaTierWithout}→{y.irmaaTierWith})</span>
                      </>
                    ) : (
                      '$0'
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-ink">{formatUsd(y.totalAdded)}</td>
                  <td className="px-2 py-1.5 text-right text-ink">{cents(y.ratePerDollar)}</td>
                  <td className="px-2 py-1.5 text-right text-ink">
                    {y.bracketWithout === y.bracketWith
                      ? `${Math.round(y.bracketWith * 100)}%`
                      : `${Math.round(y.bracketWithout * 100)}% → ${Math.round(y.bracketWith * 100)}%`}
                  </td>
                  <td className="py-1.5 pl-2 text-left text-ink-2">{from.length ? from.join(', ') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" className="py-1.5 pr-2 text-left text-ink">Total</th>
              <td className="px-2 py-1.5 text-right text-ink">{formatUsd(a.totalConverted)}</td>
              <td className="px-2 py-1.5 text-right text-ink">{formatUsd(total((y) => y.taxWithout))}</td>
              <td className="px-2 py-1.5 text-right text-ink">{formatUsd(a.totalAddedTax)}</td>
              <td className="px-2 py-1.5 text-right text-ink">{formatUsd(a.totalAddedIrmaa)}</td>
              <td className="px-2 py-1.5 text-right text-ink">{formatUsd(a.totalAdded)}</td>
              <td className="px-2 py-1.5 text-right text-ink">{cents(a.averageRate)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted">
        “Tax added” is the year’s federal and state tax with the conversion minus the same year’s tax without it, so it
        includes knock-on effects such as more Social Security becoming taxable or a smaller senior deduction. The
        Medicare surcharge is counted when the conversion raises the IRMAA tier for the premium year two years later. Tax on
        gains realized when selling taxable shares to pay the conversion tax is not counted as conversion cost. The breakeven
        rate and age cover the whole plan and use the investment return, inflation, and heirs’ rate entered. Estimates, not
        guarantees.
      </p>
    </div>
  );
}
