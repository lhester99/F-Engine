import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { taxParametersForYear } from '../calculations/federalTax';
import type { IncomeYear } from '../calculations/irmaa';
import { filingStatusForYear } from '../calculations/household';
import type { Scenario } from '../types';
import { formatPercent, formatUsd, formatUsdCompact } from '../utils/format';
import { useChartSelection } from './chartSelection';
import { HatchDefs, SERIES_COLORS, type AxisMode } from './RmdChart';

interface Props {
  baseline: IncomeYear[];
  strategy: IncomeYear[];
  axis: AxisMode;
  scenario: Scenario;
  /** Year of the first death, marked on the chart. */
  deathYear: number | null;
  selectedYear: number | null;
  onSelectYear: (year: number) => void;
  /** 'fit' (default) zooms to the income and the brackets near it; 'all' shows every bracket the income approaches. */
  scale?: 'fit' | 'all';
}

const PLOT_INSETS = { left: 56, right: 40, scale: 'band' } as const;
const RATES = [0.12, 0.22, 0.24, 0.32, 0.35] as const;
const key = (r: number) => `top${Math.round(r * 100)}`;

type Row = {
  year: number;
  age: number;
  x: number;
  baseline: number;
  other: number;
  converted: number;
  stratBracket: number;
  baseBracket: number;
  marginal: number;
  /** Total taxable income, including qualified dividends and gains (matches the plan table). */
  totalTaxable: number;
} & Record<string, number>;

function BracketTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0]!.payload;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">
        Age {r.age} · {r.year}
      </p>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-ink-2">Ordinary taxable income, strategy</dt>
        <dd className="text-right font-semibold text-ink">{formatUsd(r.other + r.converted)}</dd>
        {r.converted > 0 && (
          <>
            <dt className="text-ink-2">of which conversion</dt>
            <dd className="text-right text-ink">{formatUsd(r.converted)}</dd>
          </>
        )}
        <dt className="text-ink-2">Ordinary taxable income, no strategy</dt>
        <dd className="text-right text-ink">{formatUsd(r.baseline)}</dd>
        {r.totalTaxable - (r.other + r.converted) > 0.5 && (
          <>
            <dt className="text-ink-2">Total taxable income with dividends and gains, strategy</dt>
            <dd className="text-right text-ink">{formatUsd(r.totalTaxable)}</dd>
          </>
        )}
        <dt className="text-ink-2">Bracket, strategy / none</dt>
        <dd className="text-right text-ink">
          {formatPercent(r.stratBracket, 0)} / {formatPercent(r.baseBracket, 0)}
        </dd>
        <dt className="text-ink-2">Rate on next dollar (strategy)</dt>
        <dd className="text-right text-ink">{formatPercent(r.marginal)}</dd>
      </dl>
    </div>
  );
}

/** Ordinary taxable income each year against the tops of the federal brackets. */
export function BracketChart({ baseline, strategy, axis, scenario, deathYear, selectedYear, onSelectYear, scale = 'fit' }: Props) {
  const rows: Row[] = strategy.map((s, i) => {
    const b = baseline[i];
    const taxable = s.tax.ordinaryTaxableIncome;
    const converted = Math.min(s.conversion, taxable);
    const tops: Record<string, number> = {};
    // Bracket tops follow the filing status: narrower single brackets after a first death.
    const brackets = taxParametersForYear(s.year, scenario.analysis.inflationRate).params.brackets[filingStatusForYear(scenario, s.year)];
    for (const r of RATES) tops[key(r)] = brackets.find((x) => Math.abs(x.rate - r) < 1e-9)!.upTo;
    return {
      year: s.year,
      age: s.age,
      x: axis === 'age' ? s.age : s.year,
      baseline: b?.tax.ordinaryTaxableIncome ?? 0,
      other: taxable - converted,
      converted,
      stratBracket: s.tax.bracketRate,
      baseBracket: b?.tax.bracketRate ?? 0,
      marginal: s.marginalRate,
      totalTaxable: s.tax.taxableIncome,
      ...tops,
    } as Row;
  });
  const income = (row: Row) => Math.max(row.baseline, row.other + row.converted);
  const maxIncome = Math.max(1, ...rows.map(income));
  // Highest bracket any year's income reaches, judged against that year's own (indexed) brackets.
  const reached = Math.max(0, ...rows.map((row) => Math.max(0, RATES.findIndex((r) => row[key(r)]! >= income(row)))));
  let visible: number[];
  let yMax: number | undefined;
  if (scale === 'all') {
    // Every bracket up to the first one whose top is above the highest income in every year.
    visible = [];
    for (const r of RATES) {
      visible.push(r);
      if (rows.every((row) => row[key(r)]! >= maxIncome)) break;
    }
  } else {
    // Zoom to the income: high enough to show the top of the highest bracket reached (where it is
    // lowest, early in the projection); lines above that are cut off at the top of the chart.
    const ceiling = Math.min(...rows.map((row) => row[key(RATES[reached]!)]!));
    yMax = Math.max(maxIncome, ceiling) * 1.12;
    // Brackets up to one above the highest reached, where they fall inside the chart.
    visible = RATES.filter((r, i) => i <= reached + 1 && rows.some((row) => row[key(r)]! <= yMax!));
  }
  // Label each line at its last point inside the chart.
  const labelAt = new Map(
    visible.map((r) => {
      let idx = rows.length - 1;
      if (yMax !== undefined) while (idx > 0 && rows[idx]![key(r)]! > yMax) idx--;
      return [r, idx] as const;
    }),
  );
  const selected = rows.find((r) => r.year === selectedYear);
  const death = deathYear === null ? undefined : rows.find((r) => r.year === deathYear);
  const selection = useChartSelection(rows, onSelectYear, PLOT_INSETS);
  const last = rows.length - 1;

  return (
    <div className="h-[320px] w-full sm:h-[400px] print:h-auto" data-testid="bracket-chart" {...selection}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 16, right: 40, bottom: 4, left: 0 }} barGap={2} barCategoryGap="18%" style={{ cursor: 'pointer' }}>
          <HatchDefs />
          <CartesianGrid vertical={false} stroke="#eceff3" />
          <XAxis
            dataKey="x"
            tickLine={false}
            axisLine={{ stroke: '#d9dee5' }}
            tick={{ fontSize: 11, fill: '#667085' }}
            minTickGap={12}
            height={32}
            label={{ value: axis === 'age' ? 'Age' : 'Year', position: 'insideBottomRight', offset: -2, fontSize: 11, fill: '#667085' }}
          />
          <YAxis
            tickFormatter={formatUsdCompact}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: '#667085' }}
            width={56}
            domain={yMax === undefined ? [0, 'auto'] : [0, yMax]}
            allowDataOverflow={yMax !== undefined}
          />
          {death && (
            <ReferenceLine
              x={death.x}
              stroke="var(--color-ink)"
              strokeWidth={1.25}
              label={{ value: 'First death', position: 'insideTopRight', fontSize: 11, fill: 'var(--color-ink)' }}
            />
          )}
          {selected && <ReferenceArea x1={selected.x} x2={selected.x} fill="rgba(31,78,140,0.10)" ifOverflow="visible" />}
          <Tooltip content={<BracketTooltip />} cursor={{ fill: 'rgba(31,78,140,0.06)' }} />
          <Bar dataKey="baseline" name="No strategy" fill="url(#hatch-baseline)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="other" stackId="s" name="Strategy, before conversion" fill={SERIES_COLORS.strategy} isAnimationActive={false} />
          <Bar dataKey="converted" stackId="s" name="Roth conversion" fill={SERIES_COLORS.conversion} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          {visible.map((r) => (
            <Line
              key={r}
              dataKey={key(r)}
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
                p.index === labelAt.get(r) ? (
                  <text
                    key={`l${r}`}
                    x={Number(p.x) + (p.index === last ? 6 : p.index === 0 ? 4 : 0)}
                    y={Number(p.y) + (p.index === last ? 4 : -5)}
                    textAnchor={p.index === last || p.index === 0 ? 'start' : 'end'} fontSize={11} fill="var(--color-ink-2)">
                    {Math.round(r * 100)}%
                  </text>
                ) : (
                  <g key={`l${r}-${p.index}`} />
                )
              }
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
