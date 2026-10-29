import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { taxParametersForYear } from '../calculations/federalTax';
import type { IncomeYear } from '../calculations/irmaa';
import type { FilingStatus } from '../types';
import { formatPercent, formatUsd, formatUsdCompact } from '../utils/format';
import { useChartSelection } from './chartSelection';
import { HatchDefs, SERIES_COLORS, type AxisMode } from './RmdChart';

interface Props {
  baseline: IncomeYear[];
  strategy: IncomeYear[];
  axis: AxisMode;
  filingStatus: FilingStatus;
  inflationRate: number;
  selectedYear: number | null;
  onSelectYear: (year: number) => void;
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
        <dt className="text-ink-2">Taxable income, strategy</dt>
        <dd className="text-right font-semibold text-ink">{formatUsd(r.other + r.converted)}</dd>
        {r.converted > 0 && (
          <>
            <dt className="text-ink-2">of which conversion</dt>
            <dd className="text-right text-ink">{formatUsd(r.converted)}</dd>
          </>
        )}
        <dt className="text-ink-2">Taxable income, no strategy</dt>
        <dd className="text-right text-ink">{formatUsd(r.baseline)}</dd>
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
export function BracketChart({ baseline, strategy, axis, filingStatus, inflationRate, selectedYear, onSelectYear }: Props) {
  const rows: Row[] = strategy.map((s, i) => {
    const b = baseline[i];
    const taxable = s.tax.ordinaryTaxableIncome;
    const converted = Math.min(s.conversion, taxable);
    const tops: Record<string, number> = {};
    const brackets = taxParametersForYear(s.year, inflationRate).params.brackets[filingStatus];
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
      ...tops,
    } as Row;
  });
  const maxIncome = Math.max(1, ...rows.map((r) => Math.max(r.baseline, r.other + r.converted)));
  // Show bracket tops up to the first one above the highest income.
  const visible: number[] = [];
  for (const r of RATES) {
    visible.push(r);
    if (rows.every((row) => row[key(r)]! >= maxIncome)) break;
  }
  const selected = rows.find((r) => r.year === selectedYear);
  const selection = useChartSelection(rows, onSelectYear, PLOT_INSETS);
  const last = rows.length - 1;

  return (
    <div className="h-[320px] w-full sm:h-[400px] print:h-auto" data-testid="bracket-chart" {...selection}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 40, bottom: 4, left: 0 }} barGap={2} barCategoryGap="18%" style={{ cursor: 'pointer' }}>
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
          <YAxis tickFormatter={formatUsdCompact} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#667085' }} width={56} />
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
                p.index === last ? (
                  <text key={`l${r}`} x={Number(p.x) + 6} y={Number(p.y) + 4} fontSize={11} fill="var(--color-ink-2)">
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
