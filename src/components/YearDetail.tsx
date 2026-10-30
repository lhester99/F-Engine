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
  /** Person id → label ("Client", "Spouse"), for the distribution period rows. */
  personLabels?: Record<string, string>;
}

interface RowDef {
  label: string;
  value: (y: YearResult, inc?: IncomeYear) => number | null;
  format?: 'usd' | 'period' | 'tier' | 'pct';
  /** Only shown when the year's tax estimate is available. */
  needsIncome?: boolean;
  /** Shown even when zero in both columns. */
  always?: boolean;
  /** Bold total row. */
  strong?: boolean;
  /** Indented sub-item. */
  sub?: boolean;
}

interface Group {
  title: string;
  rows: RowDef[];
}

/** The main breakdown: plain-language groups; rows that are $0 in both columns are hidden. */
const GROUPS: Group[] = [
  {
    title: 'Taken out of the IRAs',
    rows: [
      { label: 'Required minimum distribution (RMD)', value: (y) => y.totals.requiredRmd, always: true, strong: true },
      { label: 'Given to charity (QCD)', value: (y) => y.totals.qcd },
      { label: 'Extra withdrawals', value: (y) => y.totals.extraWithdrawal },
      { label: 'Roth conversion', value: (y) => y.totals.conversionGross, always: true, strong: true },
    ],
  },
  {
    title: 'Taxes',
    rows: [
      { label: 'Taxable income', value: (_y, inc) => inc?.tax.taxableIncome ?? null, needsIncome: true, always: true },
      { label: 'Federal tax bracket', value: (_y, inc) => inc?.tax.bracketRate ?? null, format: 'pct', needsIncome: true, always: true },
      { label: 'Federal income tax', value: (_y, inc) => inc?.tax.federalTax ?? null, needsIncome: true, always: true, strong: true },
      { label: 'State income tax', value: (_y, inc) => inc?.tax.stateTax ?? null, needsIncome: true },
      { label: 'Medicare surcharge (IRMAA) paid', value: (y) => y.household.irmaaPaid },
      {
        label: 'Medicare surcharge tier',
        value: (_y, inc) => (inc && inc.medicareApplies ? inc.tier : null),
        format: 'tier',
        needsIncome: true,
        always: true,
      },
    ],
  },
  {
    title: 'How the conversion tax was paid',
    rows: [
      { label: 'From the taxable account', value: (y) => y.household.conversionTaxFromTaxable },
      { label: 'From cash', value: (y) => y.household.conversionTaxFromCash },
      { label: 'Withheld from the conversion', value: (y) => y.household.conversionTaxWithheld },
    ],
  },
  {
    title: 'Where the RMD money went',
    rows: [
      { label: 'Spent', value: (y) => y.household.spending },
      { label: 'Added to the taxable account', value: (y) => y.household.invested },
      { label: 'Taken from the Roth IRA for spending', value: (y) => y.household.withdrawnRoth },
    ],
  },
  {
    title: 'Balances on December 31',
    rows: [
      { label: 'Pre-tax IRAs', value: (y) => y.totals.endBalancePretax, always: true },
      { label: 'Roth IRAs', value: (y) => y.totals.endBalanceRoth, always: true },
      { label: 'Taxable account', value: (y) => y.household.taxableEnd },
      { label: 'Cash', value: (y) => y.household.cashEnd },
      { label: 'Total', value: (y) => y.totals.endBalanceTotal, always: true, strong: true },
      { label: 'After-tax value (pre-tax after heirs’ tax)', value: (y) => y.totals.afterTaxValue, always: true, strong: true },
    ],
  },
];

/** Technical rows, in a collapsed "More detail" section. */
const DETAIL_ROWS: RowDef[] = [
  { label: 'Pre-tax IRAs on January 1', value: (y) => y.totals.priorBalancePretax, always: true },
  { label: 'Roth IRAs on January 1', value: (y) => y.totals.priorBalanceRoth, always: true },
  { label: 'Distribution period', value: (y) => y.people[0]?.distributionPeriod ?? null, format: 'period' },
  { label: 'Distribution period, second spouse', value: (y) => y.people[1]?.distributionPeriod ?? null, format: 'period' },
  { label: 'RMD calculated for this year', value: (y) => y.totals.rmdForYear },
  { label: 'Prior-year RMD deferred to April 1', value: (y) => y.totals.deferredRmdFromPriorYear },
  { label: 'RMD deferred to April 1 next year', value: (y) => y.totals.rmdDeferredToNextYear },
  { label: 'Taxable IRA withdrawals', value: (y) => y.totals.taxableDistribution },
  { label: 'QCD made taxable (deductible contributions after 70½)', value: (y) => y.totals.qcdNotExcluded },
  { label: 'Contributions', value: (y) => y.totals.contributions },
  { label: 'of which deductible (pre-tax)', value: (y) => y.totals.deductibleContributions, sub: true },
  { label: 'Investment growth (IRAs)', value: (y) => y.totals.growth },
  { label: 'Tax caused by IRA income, conversions, and the outside accounts', value: (y) => y.household.taxOnModeledIncome },
  { label: 'of which on the conversion', value: (y) => y.household.conversionTax, sub: true },
  { label: 'Estimated MAGI (for IRMAA)', value: (_y, inc) => inc?.magi ?? null, needsIncome: true },
];

function fmt(v: number | null, kind: RowDef['format']) {
  if (v === null) return '—';
  if (kind === 'period') return v.toFixed(1);
  if (kind === 'tier') return v === 0 ? 'None' : `Tier ${v}`;
  if (kind === 'pct') return `${Math.round(v * 100)}%`;
  return formatUsd(v);
}

/** Year-level breakdown, baseline vs strategy. */
export function YearDetail({ baseline, strategy, baselineIncome, strategyIncome, years, onSelectYear, onClose, personLabels }: Props) {
  const idx = years.indexOf(strategy.year);
  const shown = (r: RowDef) => {
    if (r.needsIncome && strategyIncome === undefined) return false;
    if (r.label === 'Distribution period, second spouse' && strategy.people.length < 2) return false;
    if (r.always) return true;
    const nonzero = (y: YearResult | undefined, inc?: IncomeYear) => {
      if (!y) return false;
      const v = r.value(y, inc);
      return v !== null && Math.abs(v) > 0.5;
    };
    return nonzero(strategy, strategyIncome) || nonzero(baseline, baselineIncome);
  };
  const periodLabel = (label: string) => {
    const p = label === 'Distribution period' ? strategy.people[0] : label === 'Distribution period, second spouse' ? strategy.people[1] : undefined;
    if (!p) return label;
    const who = strategy.people.length > 1 ? `, ${(personLabels?.[p.personId] ?? 'spouse').toLowerCase()}` : '';
    const table = p.distributionTable === 'joint' ? ' (Joint and Last Survivor Table)' : p.distributionTable === 'uniform' ? ' (Uniform Lifetime Table)' : '';
    return `Distribution period${who}${table}`;
  };
  const tierLabel = (label: string) =>
    label === 'Medicare surcharge tier' && strategyIncome
      ? strategyIncome.medicareApplies
        ? `Medicare surcharge (IRMAA) tier for ${strategyIncome.premiumYear} premiums`
        : `Medicare surcharge (IRMAA) for ${strategyIncome.premiumYear}: before Medicare`
      : label;
  const renderRow = (r: RowDef, key: string) => {
    const b = baseline ? r.value(baseline, baselineIncome) : null;
    const s = r.value(strategy, strategyIncome);
    const money = r.format === undefined || r.format === 'usd';
    return (
      <tr key={key} className="border-b border-line-soft">
        <th
          scope="row"
          className={`py-1.5 pr-2 text-left ${r.sub ? 'pl-4' : ''} ${r.strong ? 'font-semibold text-ink' : 'font-normal text-ink-2'}`}
        >
          {periodLabel(tierLabel(r.label))}
        </th>
        <td className={`px-2 py-1.5 text-right text-ink ${r.strong ? 'font-semibold' : ''}`}>{fmt(b, r.format)}</td>
        <td className={`px-2 py-1.5 text-right text-ink ${r.strong ? 'font-semibold' : ''}`}>{fmt(s, r.format)}</td>
        <td className="hidden py-1.5 pl-2 text-right text-ink-2 sm:table-cell">
          {!money || b === null || s === null || Math.abs(s - b) < 0.5 ? '' : formatSignedUsd(s - b)}
        </td>
      </tr>
    );
  };
  const groups = GROUPS.map((g) => ({ ...g, rows: g.rows.filter(shown) })).filter((g) => g.rows.length > 0);
  const detailRows = DETAIL_ROWS.filter(shown);
  const head = (
    <thead>
      <tr className="border-b border-line text-xs text-muted">
        <th scope="col" className="py-1.5 pr-2 text-left font-medium">
          <span className="sr-only">Item</span>
        </th>
        <th scope="col" className="px-2 py-1.5 text-right font-medium">No strategy</th>
        <th scope="col" className="px-2 py-1.5 text-right font-medium">Strategy</th>
        <th scope="col" className="hidden py-1.5 pl-2 text-right font-medium sm:table-cell">Difference</th>
      </tr>
    </thead>
  );
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
        <table className="w-full text-sm tabular-nums" data-testid="year-detail-table">
          <caption className="sr-only">
            Year {strategy.year} breakdown, no strategy compared with current strategy
          </caption>
          {head}
          {groups.map((g) => (
            <tbody key={g.title}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={4}
                  className="bg-canvas px-2 pt-3 pb-1 text-left text-[11px] font-semibold tracking-wider text-ink-2 uppercase"
                >
                  {g.title}
                </th>
              </tr>
              {g.rows.map((r) => renderRow(r, `${g.title}-${r.label}`))}
            </tbody>
          ))}
        </table>
      </div>
      <details className="mt-3" data-testid="year-detail-more">
        <summary className="cursor-pointer text-sm font-medium text-accent">More detail: starting balances, RMD factors, growth, MAGI</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">Year {strategy.year} technical detail</caption>
            {head}
            <tbody>{detailRows.map((r) => renderRow(r, `d-${r.label}`))}</tbody>
          </table>
        </div>
      </details>
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
