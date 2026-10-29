import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { IncomeYear } from '../calculations/irmaa';
import type { YearResult } from '../types';
import { formatSignedUsd, formatUsd } from '../utils/format';

interface Props {
  baseline: YearResult | undefined;
  strategy: YearResult;
  baselineIncome?: IncomeYear;
  strategyIncome?: IncomeYear;
  years: number[];
  onSelectYear: (year: number) => void;
  onClose: () => void;
}

interface RowDef {
  label: string;
  value: (y: YearResult, inc?: IncomeYear) => number | null;
  format?: 'usd' | 'period' | 'tier' | 'pct';
  /** Only shown when the year's tax estimate is available. */
  needsIncome?: boolean;
  note?: string;
}

const ROWS: RowDef[] = [
  { label: 'Prior Dec 31 balance (Traditional IRAs)', value: (y) => y.totals.priorBalancePretax },
  { label: 'Prior Dec 31 balance (Roth IRA)', value: (y) => y.totals.priorBalanceRoth },
  { label: 'Distribution period (Uniform Lifetime Table)', value: (y) => y.people[0]?.distributionPeriod ?? null, format: 'period' },
  { label: 'RMD calculated for this year', value: (y) => y.totals.rmdForYear },
  { label: 'Prior-year RMD deferred to April 1', value: (y) => y.totals.deferredRmdFromPriorYear },
  { label: 'RMD deferred to April 1 next year', value: (y) => y.totals.rmdDeferredToNextYear },
  { label: 'Required RMD this calendar year', value: (y) => y.totals.requiredRmd },
  { label: 'QCD', value: (y) => y.totals.qcd },
  { label: '  of which taxable (deductible contributions after 70½)', value: (y) => y.totals.qcdNotExcluded },
  { label: 'Extra withdrawal', value: (y) => y.totals.extraWithdrawal },
  { label: 'Taxable IRA distribution', value: (y) => y.totals.taxableDistribution },
  { label: 'Roth conversion (gross)', value: (y) => y.totals.conversionGross },
  { label: '  of which withheld for taxes', value: (y) => y.totals.conversionWithheld },
  { label: 'Contributions', value: (y) => y.totals.contributions },
  { label: '  of which deductible (pre-tax)', value: (y) => y.totals.deductibleContributions },
  { label: 'Investment growth', value: (y) => y.totals.growth },
  { label: 'Ending Dec 31 balance (Traditional IRAs)', value: (y) => y.totals.endBalancePretax },
  { label: 'Ending Dec 31 balance (Roth IRA)', value: (y) => y.totals.endBalanceRoth },
  { label: 'Tax caused by IRA income, conversions, and these accounts', value: (y) => y.household.taxOnModeledIncome },
  { label: '  of which on the conversion', value: (y) => y.household.conversionTax },
  { label: '  conversion tax from the taxable account', value: (y) => y.household.conversionTaxFromTaxable },
  { label: '  conversion tax from cash', value: (y) => y.household.conversionTaxFromCash },
  { label: '  conversion tax withheld', value: (y) => y.household.conversionTaxWithheld },
  { label: 'IRMAA increase paid', value: (y) => y.household.irmaaPaid },
  { label: 'Spending from IRA withdrawals', value: (y) => y.household.spending },
  { label: 'Roth IRA withdrawal for spending', value: (y) => y.household.withdrawnRoth },
  { label: 'Invested in the taxable account', value: (y) => y.household.invested },
  { label: 'Ending Dec 31 taxable account', value: (y) => y.household.taxableEnd },
  { label: 'Ending Dec 31 cash', value: (y) => y.household.cashEnd },
  { label: 'Ending Dec 31 balance (all accounts)', value: (y) => y.totals.endBalanceTotal },
  { label: 'After-tax value (pre-tax after heirs’ rate)', value: (y) => y.totals.afterTaxValue },
  { label: 'Taxable income (after deductions)', value: (_y, inc) => inc?.tax.taxableIncome ?? null, needsIncome: true },
  { label: 'Federal bracket', value: (_y, inc) => inc?.tax.bracketRate ?? null, format: 'pct', needsIncome: true },
  { label: 'Federal income tax', value: (_y, inc) => inc?.tax.federalTax ?? null, needsIncome: true },
  { label: 'State income tax', value: (_y, inc) => inc?.tax.stateTax ?? null, needsIncome: true },
  { label: 'Estimated MAGI (for IRMAA)', value: (_y, inc) => inc?.magi ?? null, needsIncome: true },
  { label: 'IRMAA tier', value: (_y, inc) => (inc && inc.medicareApplies ? inc.tier : null), format: 'tier', needsIncome: true },
];

const OPTIONAL = new Set([
  'Prior-year RMD deferred to April 1',
  'RMD deferred to April 1 next year',
  '  of which withheld for taxes',
  '  of which taxable (deductible contributions after 70½)',
  '  of which deductible (pre-tax)',
  '  of which on the conversion',
  '  conversion tax from the taxable account',
  '  conversion tax from cash',
  '  conversion tax withheld',
  'IRMAA increase paid',
  'Spending from IRA withdrawals',
  'Roth IRA withdrawal for spending',
]);

function fmt(v: number | null, kind: RowDef['format']) {
  if (v === null) return '—';
  if (kind === 'period') return v.toFixed(1);
  if (kind === 'tier') return v === 0 ? 'None' : `Tier ${v}`;
  if (kind === 'pct') return `${Math.round(v * 100)}%`;
  return formatUsd(v);
}

/** Year-level breakdown, baseline vs strategy. */
export function YearDetail({ baseline, strategy, baselineIncome, strategyIncome, years, onSelectYear, onClose }: Props) {
  const idx = years.indexOf(strategy.year);
  const rows = ROWS.filter(
    (r) =>
      (!OPTIONAL.has(r.label) || (r.value(strategy) ?? 0) > 0.5 || (baseline && (r.value(baseline) ?? 0) > 0.5)) &&
      (!r.needsIncome || strategyIncome !== undefined),
  );
  const tierLabel = (label: string) =>
    label === 'IRMAA tier' && strategyIncome
      ? strategyIncome.medicareApplies
        ? `IRMAA tier for ${strategyIncome.premiumYear} premiums`
        : `IRMAA (${strategyIncome.premiumYear}: before Medicare)`
      : label;
  const notes = strategy.messages;

  return (
    <section className="panel p-3 sm:p-4" aria-labelledby="year-detail-title" data-testid="year-detail">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="year-detail-title" className="text-sm font-semibold text-ink">
          Year detail — age {strategy.age}, {strategy.year}
        </h3>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-icon" aria-label="Previous year" disabled={idx <= 0} onClick={() => onSelectYear(years[idx - 1]!)}>
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </button>
          <label className="sr-only" htmlFor="year-select">
            Select year
          </label>
          <select
            id="year-select"
            className="field-input w-auto py-1"
            value={strategy.year}
            onChange={(e) => onSelectYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y} (age {strategy.age - strategy.year + y})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-icon"
            aria-label="Next year"
            disabled={idx >= years.length - 1}
            onClick={() => onSelectYear(years[idx + 1]!)}
          >
            <ChevronRight aria-hidden className="h-4 w-4" />
          </button>
          <button type="button" className="btn-icon" aria-label="Close year detail" onClick={onClose}>
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">
            Year {strategy.year} breakdown, no strategy compared with current strategy
          </caption>
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th scope="col" className="py-1.5 pr-2 text-left font-medium">Item</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">No strategy</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Strategy</th>
              <th scope="col" className="hidden py-1.5 pl-2 text-right font-medium sm:table-cell">Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const b = baseline ? r.value(baseline, baselineIncome) : null;
              const s = r.value(strategy, strategyIncome);
              const emphasize = r.label.startsWith('Required RMD') || r.label.startsWith('Taxable');
              return (
                <tr key={r.label} className={`border-b border-line-soft ${emphasize ? 'font-semibold' : ''}`}>
                  <th scope="row" className={`py-1.5 pr-2 text-left font-normal text-ink-2 ${r.label.startsWith('  ') ? 'pl-4' : ''} ${emphasize ? 'font-semibold text-ink' : ''}`}>
                    {tierLabel(r.label).trim()}
                  </th>
                  <td className="px-2 py-1.5 text-right text-ink">{fmt(b, r.format)}</td>
                  <td className="px-2 py-1.5 text-right text-ink">{fmt(s, r.format)}</td>
                  <td className="hidden py-1.5 pl-2 text-right text-ink-2 sm:table-cell">
                    {r.format === 'period' || r.format === 'tier' || r.format === 'pct' || b === null || s === null ? '' : formatSignedUsd(s - b)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {notes.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-ink-2">
          {notes.map((m, i) => (
            <li key={i}>
              <span className="font-semibold">{m.severity === 'error' ? 'Blocked' : m.severity === 'warning' ? 'Note' : 'Info'}:</span> {m.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
