import type { IncomeYear } from '../calculations/irmaa';
import { formatPercent, formatUsd } from '../utils/format';

interface Props {
  baseline: IncomeYear[];
  strategy: IncomeYear[];
}

const signed = (v: number) => (Math.abs(v) < 0.5 ? '$0' : v > 0 ? `+${formatUsd(v)}` : `−${formatUsd(-v)}`);

/** Year-by-year conversion plan: income, bracket, estimated tax, and IRMAA, with the change from no strategy. */
export function ConversionPlanTable({ baseline, strategy }: Props) {
  const total = (rows: IncomeYear[], f: (y: IncomeYear) => number) => rows.reduce((s, y) => s + f(y), 0);
  return (
    <div className="max-h-[28rem] overflow-auto rounded-md border border-line">
      <table className="w-full min-w-[820px] text-xs tabular-nums" data-testid="plan-table">
        <caption className="sr-only">Conversion plan by year</caption>
        <thead className="sticky top-0 bg-canvas text-muted">
          <tr>
            <th scope="col" className="px-2 py-2 text-left font-medium">Age (year)</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Roth conversion</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Taxable IRA distributions</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Taxable income</th>
            <th scope="col" className="px-2 py-2 text-left font-medium">Return</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Federal bracket</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Rate on next dollar</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Federal + state tax</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">IRMAA tier (premium year)</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Tax vs. no strategy</th>
          </tr>
        </thead>
        <tbody>
          {strategy.map((s, i) => {
            const b = baseline[i];
            const converting = s.conversion > 0.5;
            return (
              <tr key={s.year} className={`border-t border-line-soft ${converting ? 'bg-accent-soft/50' : ''}`}>
                <th scope="row" className="px-2 py-1 text-left font-normal text-ink-2">
                  {s.age} ({s.year})
                </th>
                <td className={`px-2 py-1 text-right ${converting ? 'font-semibold text-ink' : 'text-muted'}`}>{formatUsd(s.conversion)}</td>
                <td className="px-2 py-1 text-right">{formatUsd(s.taxableIra)}</td>
                <td className="px-2 py-1 text-right">{formatUsd(s.tax.taxableIncome)}</td>
                <td className="px-2 py-1 text-left text-ink-2">{s.income.filingStatus === 'joint' ? 'Joint' : 'Single'}</td>
                <td className="px-2 py-1 text-right">{formatPercent(s.tax.bracketRate, 0)}</td>
                <td className="px-2 py-1 text-right">{formatPercent(s.marginalRate)}</td>
                <td className="px-2 py-1 text-right">{formatUsd(s.tax.totalTax)}</td>
                <td className="px-2 py-1 text-right">
                  {s.medicareApplies ? (s.tier === 0 ? 'None' : `Tier ${s.tier}`) : '—'}{' '}
                  <span className="text-muted">({s.premiumYear})</span>
                </td>
                <td className="px-2 py-1 text-right">{b ? signed(s.tax.totalTax - b.tax.totalTax) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="sticky bottom-0 bg-canvas font-semibold text-ink">
          <tr className="border-t border-line">
            <th scope="row" className="px-2 py-1.5 text-left">Total</th>
            <td className="px-2 py-1.5 text-right">{formatUsd(total(strategy, (y) => y.conversion))}</td>
            <td className="px-2 py-1.5 text-right">{formatUsd(total(strategy, (y) => y.taxableIra))}</td>
            <td className="px-2 py-1.5 text-right" colSpan={4} />
            <td className="px-2 py-1.5 text-right">{formatUsd(total(strategy, (y) => y.tax.totalTax))}</td>
            <td className="px-2 py-1.5" />
            <td className="px-2 py-1.5 text-right">
              {signed(total(strategy, (y) => y.tax.totalTax) - total(baseline, (y) => y.tax.totalTax))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
