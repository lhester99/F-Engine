import { formatPercent, formatUsd } from '../utils/format';
import type { ProjectionResult, Scenario } from '../types';
import type { IncomeYear, IrmaaSummary } from './irmaa';
import type { ProjectionSummary } from './summary';
import type { TaxComparison } from './taxComparison';

export interface Finding {
  id: 'size' | 'strategy' | 'shift' | 'brackets' | 'tax' | 'irmaa';
  /** Short label for the finding. */
  title: string;
  text: string;
}

export interface FindingsInput {
  scenario: Scenario;
  baseline: ProjectionResult;
  strategy: ProjectionResult;
  baselineSummary: ProjectionSummary;
  strategySummary: ProjectionSummary;
  tax: TaxComparison | null;
  baselineIrmaa: IrmaaSummary | null;
  strategyIrmaa: IrmaaSummary | null;
  baselineIncome?: IncomeYear[];
  strategyIncome?: IncomeYear[];
}

const pct = (part: number, whole: number) => (whole > 0 ? formatPercent(part / whole, 0) : '0%');

function ageRange(ys: { age: number }[]): string {
  if (ys.length === 0) return '';
  const lo = ys[0]!.age;
  const hi = ys[ys.length - 1]!.age;
  return lo === hi ? `age ${lo}` : `ages ${lo}–${hi}`;
}

/**
 * Plain-English findings built only from the projection's own numbers. The
 * wording stays neutral: it describes size, timing, and trade-offs and never
 * calls a lower RMD better or an estimate "savings".
 */
export function buildFindings(i: FindingsInput): Finding[] {
  const out: Finding[] = [];
  const b = i.baselineSummary;
  const s = i.strategySummary;
  // Judge by what the projection actually did, so fill-to-bracket rules count too.
  const hasStrategy = s.totalConversions > 0.5 || s.totalQcd > 0.5;

  if (b.firstRmd && b.peakRmd) {
    const multiple = b.peakRmd.amount / b.firstRmd.amount;
    const growth = b.rmdAnnualGrowth === null ? '' : ` That is growth of about ${formatPercent(b.rmdAnnualGrowth)} a year.`;
    const peakIsFirst = b.peakRmd.year === b.firstRmd.year;
    out.push({
      id: 'size',
      title: 'How large RMDs get',
      text: peakIsFirst
        ? `Without a strategy, the first required RMD is ${formatUsd(b.firstRmd.amount)} at age ${b.firstRmd.age} (${b.firstRmd.year}), and later RMDs stay below it.`
        : `Without a strategy, required RMDs start at ${formatUsd(b.firstRmd.amount)} at age ${b.firstRmd.age} (${b.firstRmd.year}) and reach ${formatUsd(b.peakRmd.amount)} at age ${b.peakRmd.age}, ${multiple.toFixed(1)} times the first RMD.${growth}`,
    });
  } else {
    out.push({
      id: 'size',
      title: 'How large RMDs get',
      text: 'No RMDs fall within the projection period with these inputs.',
    });
  }

  if (!hasStrategy) {
    out.push({
      id: 'strategy',
      title: 'Strategy',
      text: 'No Roth conversions or QCDs are entered yet, so the strategy matches the baseline. Add them in the planning levers to compare.',
    });
    return out;
  }

  if (b.peakRmd && s.peakRmd) {
    const peakDiff = b.peakRmd.amount - s.peakRmd.amount;
    const totalDiff = b.totalRequiredRmd - s.totalRequiredRmd;
    // d = baseline − strategy, so positive means the strategy is lower.
    const change = (d: number, base: number, noun: string) =>
      Math.abs(d) < 0.5
        ? `leaves ${noun} unchanged`
        : d > 0
          ? `lowers ${noun} by ${formatUsd(d)} (${pct(d, base)})`
          : `raises ${noun} by ${formatUsd(-d)} (${pct(-d, base)})`;
    out.push({
      id: 'strategy',
      title: 'What the strategy changes',
      text: `This strategy ${change(peakDiff, b.peakRmd.amount, 'the peak RMD')} and ${change(totalDiff, b.totalRequiredRmd, 'total required RMDs over the projection')}.`,
    });
  }

  const convYears = i.strategy.years.filter((y) => y.totals.conversionGross > 0);
  const totalConv = s.totalConversions;
  const totalQcd = s.totalQcd;
  const parts: string[] = [];
  if (totalConv > 0) parts.push(`Conversions move ${formatUsd(totalConv)} of taxable income into ${ageRange(convYears)}.`);
  if (totalQcd > 0) parts.push(`QCDs send ${formatUsd(totalQcd)} to charity directly from the IRA, and that income is not taxed.`);
  if (parts.length) out.push({ id: 'shift', title: 'When income is taxed', text: parts.join(' ') });

  if (i.strategyIncome && i.baselineIncome) {
    const conv = i.strategyIncome.filter((y) => y.conversion > 0.5);
    if (conv.length) {
      const topBracket = Math.max(...conv.map((y) => y.tax.bracketRate));
      const topMarginal = Math.max(...conv.map((y) => y.marginalRate));
      const marginalNote =
        topMarginal > topBracket + 0.005
          ? ` The estimated tax on the last dollar converted reaches ${formatPercent(topMarginal)} (federal and state), above the bracket rate, because extra income also makes more Social Security taxable or reduces deductions.`
          : '';
      const laterBase = i.baselineIncome.filter((y) => y.year > conv[conv.length - 1]!.year);
      const laterBaseTop = laterBase.length ? Math.max(...laterBase.map((y) => y.tax.bracketRate)) : 0;
      const laterStrat = i.strategyIncome.filter((y) => y.year > conv[conv.length - 1]!.year);
      const laterStratTop = laterStrat.length ? Math.max(...laterStrat.map((y) => y.tax.bracketRate)) : 0;
      const later = laterBase.length
        ? ` After the conversions, the highest bracket is ${formatPercent(laterStratTop, 0)} with the strategy and ${formatPercent(laterBaseTop, 0)} without it.`
        : '';
      out.push({
        id: 'brackets',
        title: 'Tax brackets',
        text: `In conversion years (${ageRange(conv)}), income reaches the ${formatPercent(topBracket, 0)} federal bracket.${marginalNote}${later}`,
      });
    }
  }

  if (i.tax) {
    const t = i.tax;
    const a = i.scenario.analysis;
    const net = t.netTaxPv;
    const verdict =
      Math.abs(net) < 0.5
        ? 'about the same'
        : net > 0
          ? `about ${formatUsd(net)} lower`
          : `about ${formatUsd(-net)} higher`;
    let breakeven = '';
    if (t.breakevenHeirsRate === 0) breakeven = ' It is lower even if heirs pay no tax on the pre-tax balance.';
    else if (t.breakevenHeirsRate !== null) {
      breakeven = ` It comes out lower whenever the heirs' tax rate is above ${formatPercent(t.breakevenHeirsRate)}.`;
    }
    const qcdNote =
      t.qcdExcludedIncome > 0.5
        ? ` This counts the ${formatUsd(t.qcdExcludedIncome)} of QCD gifts as income not taxed; it does not count the gifts themselves.`
        : '';
    out.push({
      id: 'tax',
      title: 'Estimated tax trade-off',
      text: `The strategy adds about ${formatUsd(t.taxPaidEarlier)} of federal, state, and IRMAA costs in the years it raises income, and avoids about ${formatUsd(t.taxAvoidedLater)} in later years and for heirs (at the ${formatPercent(a.heirsTaxRate, 0)} rate entered). In present value, its estimated total is ${verdict}.${breakeven}${qcdNote}`,
    });
  }

  if (i.baselineIrmaa && i.strategyIrmaa) {
    const bi = i.baselineIrmaa;
    const si = i.strategyIrmaa;
    const describe = (x: IrmaaSummary) =>
      x.yearsWithSurcharge === 0
        ? 'no IRMAA surcharge years'
        : `${x.yearsWithSurcharge} surcharge year${x.yearsWithSurcharge === 1 ? '' : 's'} (about ${formatUsd(x.totalSurcharge)}, highest tier ${x.highestTier})`;
    out.push({
      id: 'irmaa',
      title: 'Medicare IRMAA',
      text: `Without a strategy: ${describe(bi)}. With this strategy: ${describe(si)}.`,
    });
  }

  return out;
}
