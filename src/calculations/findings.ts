import { formatPercent, formatUsd } from '../utils/format';
import type { ProjectionResult, Scenario } from '../types';
import type { IncomeYear, IrmaaSummary } from './irmaa';
import type { WealthComparison } from './wealth';
import { deathYear } from './household';
import type { ProjectionSummary } from './summary';
import type { TaxComparison } from './taxComparison';

export interface Finding {
  id: 'size' | 'excess' | 'strategy' | 'shift' | 'brackets' | 'survivor' | 'tax' | 'wealth' | 'heirs' | 'irmaa';
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
  wealth?: WealthComparison | null;
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

  const leftover = i.baseline.years.reduce((x, y) => x + y.household.invested, 0);
  const spentFromIra = i.baseline.years.reduce((x, y) => x + y.household.spending, 0);
  if (leftover > 0.5) {
    out.push({
      id: 'excess',
      title: 'RMDs not needed',
      text: `Without a strategy, ${formatUsd(leftover)} of IRA withdrawals is left after taxes${spentFromIra > 0.5 ? ' and spending' : ''} over the projection and goes into the taxable account, where its growth is taxed each year.`,
    });
  }

  // Shown even without a strategy: the survivor's switch to single filing matters on its own.
  const survivor = survivorFinding(i);
  // Also shown without a strategy: the 10-year rule's tax on a large pre-tax balance is the starting point.
  const heirs = heirsFinding(i);

  if (!hasStrategy) {
    if (survivor) out.push(survivor);
    if (heirs) out.push(heirs);
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

  if (survivor) out.push(survivor);

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
    const heirsBasis =
      i.scenario.heirs.mode === 'income'
        ? `estimated from the heirs' income, an average ${formatPercent(t.strategy.legacy.effectiveRate)} with the strategy and ${formatPercent(t.baseline.legacy.effectiveRate)} without`
        : `at the ${formatPercent(a.heirsTaxRate, 0)} rate entered`;
    const qcdNote =
      t.qcdExcludedIncome > 0.5
        ? ` This counts the ${formatUsd(t.qcdExcludedIncome)} of QCD gifts as income not taxed; it does not count the gifts themselves.`
        : '';
    out.push({
      id: 'tax',
      title: 'Estimated tax trade-off',
      text: `The strategy adds about ${formatUsd(t.taxPaidEarlier)} of federal, state, and IRMAA costs in the years it raises income, and avoids about ${formatUsd(t.taxAvoidedLater)} in later years and for heirs (${heirsBasis}). In present value, its estimated total is ${verdict}.${breakeven}${qcdNote}`,
    });
  }

  if (i.wealth) {
    const w = i.wealth;
    const diff = w.endStrategy - w.endBaseline;
    const lastAge = i.strategy.years[i.strategy.years.length - 1]?.age;
    const heirs =
      i.scenario.heirs.mode === 'income' && i.tax
        ? `the heirs' estimated average tax (${formatPercent(i.tax.strategy.legacy.effectiveRate)} with the strategy, ${formatPercent(i.tax.baseline.legacy.effectiveRate)} without)`
        : `a ${formatPercent(i.scenario.analysis.heirsTaxRate, 0)} tax`;
    const when =
      w.breakevenAge === null
        ? ' It stays behind through the end of the projection at these assumptions.'
        : w.crossesOver
          ? ` It pulls ahead at age ${w.breakevenAge} and stays ahead.`
          : ' It is ahead from the first year.';
    out.push({
      id: 'wealth',
      title: 'After-tax wealth',
      text: `At age ${lastAge}, after-tax value is ${formatUsd(w.endStrategy)} with the strategy and ${formatUsd(w.endBaseline)} without it (${diff >= 0 ? '+' : '−'}${formatUsd(Math.abs(diff))}), counting pre-tax money after ${heirs}.${when}`,
    });
  }

  if (heirs) out.push(heirs);

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

/**
 * What changes for the survivor: bracket and average estimated tax (federal,
 * state) in the last joint years versus the first single years, with and
 * without the strategy.
 */
function survivorFinding(i: FindingsInput): Finding | null {
  const dy = deathYear(i.scenario);
  if (dy === null || !i.baselineIncome || !i.strategyIncome) return null;
  const deceased = i.scenario.people.find((p) => p.id === i.scenario.survivorship.firstDeathPersonId);
  const window = (rows: IncomeYear[]) => ({
    before: rows.filter((y) => y.year <= dy && y.year > dy - 3),
    after: rows.filter((y) => y.year > dy && y.year <= dy + 5),
  });
  const avg = (rows: IncomeYear[]) => (rows.length ? rows.reduce((s, y) => s + y.tax.totalTax, 0) / rows.length : 0);
  const top = (rows: IncomeYear[]) => (rows.length ? Math.max(...rows.map((y) => y.tax.bracketRate)) : 0);
  const b = window(i.baselineIncome);
  const s = window(i.strategyIncome);
  if (!b.after.length) return null;
  const describe = (w: { before: IncomeYear[]; after: IncomeYear[] }) =>
    `the top bracket goes from ${formatPercent(top(w.before), 0)} to ${formatPercent(top(w.after), 0)} and estimated tax averages ${formatUsd(avg(w.after))} a year in the first single years, versus ${formatUsd(avg(w.before))} in the last joint years`;
  const hasStrategy = i.strategySummary.totalConversions > 0.5 || i.strategySummary.totalQcd > 0.5;
  return {
    id: 'survivor',
    title: 'Surviving spouse',
    text:
      `After ${deceased?.label ?? 'the first spouse'} dies at ${i.scenario.survivorship.deathAge} (${dy}), the survivor files single with about the same RMDs. Without the strategy, ${describe(b)}.` +
      (hasStrategy ? ` With the strategy, ${describe(s)}.` : ''),
  };
}

/** What heirs inherit and the tax they pay emptying the pre-tax IRA under the 10-year rule. */
function heirsFinding(i: FindingsInput): Finding | null {
  if (!i.tax) return null;
  const b = i.tax.baseline.legacy;
  const st = i.tax.strategy.legacy;
  const keepDiff = st.netToHeirsPv - b.netToHeirsPv;
  const bracket =
    i.scenario.heirs.mode === 'income' && b.highestBracket > 0
      ? ` Spread over 10 years on top of their own income, it reaches the ${Math.round(b.highestBracket * 100)}% bracket for each heir${
          st.highestBracket !== b.highestBracket ? ` (${Math.round(st.highestBracket * 100)}% with the strategy)` : ''
        }.`
      : '';
  const compare =
    Math.abs(st.pretax - b.pretax) < 0.5
      ? ''
      : ` With the strategy they would inherit ${formatUsd(st.pretax)} pre-tax and ${formatUsd(st.roth)} Roth (${formatUsd(b.roth)} without it); the Roth IRA can grow tax-free to about ${formatUsd(st.rothAtWithdrawal)} by year 10. They keep about ${formatUsd(Math.abs(keepDiff))} ${keepDiff >= 0 ? 'more' : 'less'} in present value.`;
  if (b.pretax > 0.5 || st.pretax > 0.5) {
    return {
      id: 'heirs',
      title: 'Heirs and the 10-year rule',
      text: `With no strategy, heirs would inherit ${formatUsd(b.pretax)} of pre-tax IRA in ${b.inheritanceYear} and must empty it by ${b.inheritanceYear + 10}, paying an estimated ${formatUsd(b.heirsTax)} of tax on it.${bracket}${compare}`,
    };
  }
  return null;
}
