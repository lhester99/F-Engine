import type { YearResult } from '../types';
import { formatUsd } from '../utils/format';

/** Table view of the RMD chart, for screen readers and exact figures. */
export function YearTable({ baseline, strategy }: { baseline: YearResult[]; strategy: YearResult[] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-md border border-line">
      <table className="w-full min-w-[640px] text-xs tabular-nums" data-testid="year-table">
        <caption className="sr-only">Year-by-year RMDs, no strategy compared with current strategy</caption>
        <thead className="sticky top-0 bg-canvas text-muted">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">Age (year)</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Required RMD, no strategy</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Required RMD, strategy</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Taxable, no strategy</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Taxable, strategy</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">QCD</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Conversion</th>
          </tr>
        </thead>
        <tbody>
          {strategy.map((s, i) => {
            const b = baseline[i];
            return (
              <tr key={s.year} className="border-t border-line-soft">
                <th scope="row" className="px-2 py-1 text-left font-normal text-ink-2">
                  {s.age} ({s.year})
                </th>
                <td className="px-2 py-1 text-right">{b ? formatUsd(b.totals.requiredRmd) : '—'}</td>
                <td className="px-2 py-1 text-right font-medium">{formatUsd(s.totals.requiredRmd)}</td>
                <td className="px-2 py-1 text-right">{b ? formatUsd(b.totals.taxableDistribution) : '—'}</td>
                <td className="px-2 py-1 text-right font-medium">{formatUsd(s.totals.taxableDistribution)}</td>
                <td className="px-2 py-1 text-right">{formatUsd(s.totals.qcd)}</td>
                <td className="px-2 py-1 text-right">{formatUsd(s.totals.conversionGross)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
