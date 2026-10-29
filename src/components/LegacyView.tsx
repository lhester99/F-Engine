import { useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { taxParametersForYear } from '../calculations/federalTax';
import type { Legacy } from '../calculations/legacy';
import { ChartLegend, HatchSwatch, LineSwatch, SolidSwatch } from '../charts/Legend';
import { InheritanceChart } from '../charts/InheritanceChart';
import { HatchDefs, SERIES_COLORS } from '../charts/RmdChart';
import type { Scenario } from '../types';
import { formatPercent, formatSignedUsd, formatUsd, formatUsdCompact } from '../utils/format';

interface Props {
  baseline: Legacy;
  strategy: Legacy;
  scenario: Scenario;
  discountRate: number;
}

const RATES = [0.12, 0.22, 0.24, 0.32, 0.35] as const;

/** What heirs inherit and keep, with and without the strategy, under the 10-year rule. */
export function LegacyView({ baseline, strategy, scenario, discountRate }: Props) {
  const [view, setView] = useState<'accounts' | 'tax'>('accounts');
  const income = scenario.heirs.mode === 'income';
  const count = Math.max(1, Math.round(scenario.heirs.count));
  const rothShare = (l: Legacy) => (l.netToHeirsPv > 0.5 ? l.rothAtWithdrawalPv / l.netToHeirsPv : 0);
  const rows: { label: string; b: number; s: number; kind?: 'pct' | 'bracket'; strong?: boolean }[] = [
    { label: 'Inherited pre-tax IRA', b: baseline.pretax, s: strategy.pretax },
    { label: 'Inherited Roth IRA', b: baseline.roth, s: strategy.roth },
    { label: 'Roth IRA after tax-free growth, withdrawn in year 10', b: baseline.rothAtWithdrawal, s: strategy.rothAtWithdrawal },
    { label: 'Taxable account and cash (stepped-up basis)', b: baseline.taxable + baseline.cash, s: strategy.taxable + strategy.cash },
    { label: 'Inherited IRA withdrawals over 10 years', b: baseline.withdrawals, s: strategy.withdrawals },
    { label: "Heirs' tax on those withdrawals", b: baseline.heirsTax, s: strategy.heirsTax },
    { label: "Heirs' average tax rate", b: baseline.effectiveRate, s: strategy.effectiveRate, kind: 'pct' },
    ...(income ? [{ label: 'Highest federal bracket an heir reaches', b: baseline.highestBracket, s: strategy.highestBracket, kind: 'bracket' as const }] : []),
    { label: 'What heirs keep, present value', b: baseline.netToHeirsPv, s: strategy.netToHeirsPv, strong: true },
    { label: '  share from the Roth IRA (tax-free)', b: rothShare(baseline), s: rothShare(strategy), kind: 'pct' },
  ];
  const fmt = (v: number, kind?: 'pct' | 'bracket') => (kind === 'pct' ? formatPercent(v) : kind === 'bracket' ? `${Math.round(v * 100)}%` : formatUsd(v));

  const chart = baseline.schedule.map((b, i) => {
    const s = strategy.schedule[i]!;
    const brackets = taxParametersForYear(b.year, scenario.analysis.inflationRate).params.brackets[scenario.heirs.filingStatus];
    const tops: Record<string, number> = {};
    for (const r of RATES) tops[`top${Math.round(r * 100)}`] = brackets.find((x) => Math.abs(x.rate - r) < 1e-9)!.upTo;
    return {
      x: `Yr ${b.index}`,
      year: b.year,
      baseline: income ? b.perHeirTaxableIncome : b.perHeirWithdrawal,
      strategy: income ? s.perHeirTaxableIncome : s.perHeirWithdrawal,
      ...tops,
    };
  });
  const max = Math.max(1, ...chart.map((c) => Math.max(c.baseline, c.strategy)));
  // In income mode, an empty slot after year 10 holds the bracket labels clear of the bars.
  const last = chart[chart.length - 1];
  const data: Record<string, number | string | null>[] =
    income && last ? [...chart, { ...last, x: '', baseline: null, strategy: null }] : chart;
  const visible: number[] = [];
  for (const r of RATES) {
    visible.push(r);
    if (chart.every((c) => (c as unknown as Record<string, number>)[`top${Math.round(r * 100)}`]! >= max)) break;
  }

  return (
    <div className="space-y-3" data-testid="legacy-view">
      <p className="text-xs text-ink-2">
        Inheritance at the end of {baseline.inheritanceYear}, the last projection year.{' '}
        {income ? (count === 1 ? 'One heir withdraws' : `${count} heirs, sharing equally, withdraw`) : 'Heirs withdraw'} the inherited IRA
        evenly over 10 years ({baseline.inheritanceYear + 1}–{baseline.inheritanceYear + 10}). The inherited Roth IRA
        has no yearly withdrawals, so heirs can leave it to grow tax-free and take it, tax-free, in the 10th year.
      </p>

      <div className="seg print:hidden" role="group" aria-label="Heirs chart">
        <button type="button" className="seg-btn" aria-pressed={view === 'accounts'} onClick={() => setView('accounts')}>
          Inherited accounts
        </button>
        <button type="button" className="seg-btn" aria-pressed={view === 'tax'} onClick={() => setView('tax')}>
          {income ? "Heirs' income and brackets" : 'Pre-tax withdrawals'}
        </button>
      </div>

      {view === 'accounts' && (
        <>
          <InheritanceChart baseline={baseline} strategy={strategy} />
          <p className="text-xs text-ink-2" data-testid="chart-caption">
            Inherited balances at the start of each year of the 10-year window. The pre-tax IRA shrinks as heirs withdraw
            it and pay tax on each withdrawal; the Roth IRA keeps growing tax-free until it is taken in year 10. Pre-tax
            balances are shown before heirs' tax.
          </p>
        </>
      )}

      {view === 'tax' && (
      <>
      <div className="h-[260px] w-full sm:h-[300px] print:h-auto" data-testid="heirs-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={2} barCategoryGap="22%">
            <HatchDefs />
            <CartesianGrid vertical={false} stroke="#eceff3" />
            <XAxis dataKey="x" tickLine={false} axisLine={{ stroke: '#d9dee5' }} tick={{ fontSize: 11, fill: '#667085' }} />
            <YAxis tickFormatter={formatUsdCompact} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#667085' }} width={56} />
            <Tooltip
              formatter={(v, name) => [formatUsd(Number(v)), String(name)]}
              labelFormatter={(_l, p) => (p?.[0] ? `${(p[0].payload as { year: number }).year}` : '')}
            />
            <Bar dataKey="baseline" name="No strategy" fill="url(#hatch-baseline)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="strategy" name="Strategy" fill={SERIES_COLORS.strategy} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            {income &&
              visible.map((r) => (
                <Line
                  key={r}
                  dataKey={`top${Math.round(r * 100)}`}
                  name={`Top of ${Math.round(r * 100)}% bracket`}
                  type="stepAfter"
                  stroke="var(--color-ink-2)"
                  strokeOpacity={0.55}
                  strokeWidth={1.25}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  label={(p: { index?: number; x?: number | string; y?: number | string }) =>
                    p.index === data.length - 1 ? (
                      <text key={`h${r}`} x={Number(p.x)} y={Number(p.y) - 4} textAnchor="middle" fontSize={11} fill="var(--color-ink-2)">
                        {Math.round(r * 100)}%
                      </text>
                    ) : (
                      <g key={`h${r}-${p.index}`} />
                    )
                  }
                />
              ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        label="Chart legend"
        items={[
          { label: 'No strategy', swatch: <HatchSwatch /> },
          { label: 'Current strategy', swatch: <SolidSwatch color={SERIES_COLORS.strategy} /> },
          ...(income ? [{ label: "Top of each federal bracket (heirs' filing status)", swatch: <LineSwatch color="var(--color-ink-2)" dashed /> }] : []),
        ]}
      />
      <p className="text-xs text-ink-2" data-testid="chart-caption">
        {income
          ? "Each heir's taxable income in each year of the 10-year window: their own income after the standard deduction plus their share of the inherited IRA withdrawal."
          : "Each year's inherited IRA withdrawal. Choose “From heirs' income” under Assumptions › Heirs to see the brackets heirs reach."}
      </p>
      </>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm tabular-nums" data-testid="legacy-table">
          <caption className="sr-only">What heirs inherit and keep</caption>
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
                <th scope="row" className={`py-1.5 pr-2 text-left ${r.strong ? 'text-ink' : 'font-normal text-ink-2'} ${r.label.startsWith('  ') ? 'pl-4' : ''}`}>{r.label.trim()}</th>
                <td className="px-2 py-1.5 text-right">{fmt(r.b, r.kind)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.s, r.kind)}</td>
                <td className="py-1.5 pl-2 text-right">
                  {r.kind === 'pct' ? `${((r.s - r.b) * 100).toFixed(1)} pts` : r.kind === 'bracket' ? '' : formatSignedUsd(r.s - r.b)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Present values discount each amount, from the year heirs receive it, to the start of the projection at{' '}
        {formatPercent(discountRate)}; this puts the Roth IRA taken in year 10 and the accounts received at inheritance on
        the same footing. Heirs' tax is an estimate
        under current law. The Roth IRA's growth assumes the investment return and that the five-year rule for tax-free
        Roth withdrawals is met; the taxable account and cash are counted at inheritance, without later growth.
      </p>
    </div>
  );
}
