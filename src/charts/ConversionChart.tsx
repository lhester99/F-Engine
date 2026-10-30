import { Bar, CartesianGrid, ComposedChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ConversionChartYear } from '../calculations/conversionAnalysis';
import { formatUsd, formatUsdCompact } from '../utils/format';
import { useChartSelection } from './chartSelection';
import { HatchDefs, SERIES_COLORS, type AxisMode } from './RmdChart';

interface Props {
  rows: ConversionChartYear[];
  axis: AxisMode;
  selectedYear: number | null;
  onSelectYear: (year: number) => void;
}

interface Row extends ConversionChartYear {
  x: number;
}

/** Left margin (0) + Y-axis width (56), and right margin; must match the chart props below. */
const PLOT_INSETS = { left: 56, right: 8, scale: 'band' } as const;

function ConversionTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0]!.payload;
  const withPlan = r.strategyBase + r.strategyAdded;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">
        Age {r.age} · {r.year}
      </p>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-ink-2">Tax, no strategy</dt>
        <dd className="text-right text-ink">{formatUsd(r.baselineTax)}</dd>
        <dt className="text-ink-2">Tax with the strategy</dt>
        <dd className="text-right font-semibold text-ink">{formatUsd(withPlan)}</dd>
        {r.strategyAdded > 0.5 && (
          <>
            <dt className="pl-2 text-ink-2">paid anyway</dt>
            <dd className="text-right text-ink">{formatUsd(r.strategyBase)}</dd>
            <dt className="pl-2 text-ink-2">added by the conversion</dt>
            <dd className="text-right text-ink">{formatUsd(r.strategyAdded)}</dd>
          </>
        )}
        <dt className="text-ink-2">Difference</dt>
        <dd className="text-right text-ink">
          {Math.abs(withPlan - r.baselineTax) < 0.5 ? '$0' : `${withPlan > r.baselineTax ? '+' : '−'}${formatUsd(Math.abs(withPlan - r.baselineTax))}`}
        </dd>
      </dl>
      <p className="mt-1 text-muted">Click or tap for year details</p>
    </div>
  );
}

/**
 * Federal + state income tax by year: no strategy (hatched) beside the strategy,
 * whose bar splits into the tax it pays anyway and the part this year's
 * conversion adds.
 */
export function ConversionChart({ rows: data, axis, selectedYear, onSelectYear }: Props) {
  const rows: Row[] = data.map((r) => ({ ...r, x: axis === 'age' ? r.age : r.year }));
  const selected = rows.find((r) => r.year === selectedYear);
  const selection = useChartSelection(rows, onSelectYear, PLOT_INSETS);
  return (
    <div className="h-[300px] w-full sm:h-[380px] print:h-auto" data-testid="conversion-chart" {...selection}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={2} barCategoryGap="18%" style={{ cursor: 'pointer' }}>
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
          {selected && <ReferenceArea x1={selected.x} x2={selected.x} fill="rgba(29,91,214,0.10)" ifOverflow="visible" />}
          <Tooltip content={<ConversionTooltip />} cursor={{ fill: 'rgba(29,91,214,0.06)' }} />
          <Bar dataKey="baselineTax" name="No strategy" fill="url(#hatch-baseline)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="strategyBase" stackId="s" name="Tax paid anyway" fill={SERIES_COLORS.strategy} isAnimationActive={false} />
          <Bar
            dataKey="strategyAdded"
            stackId="s"
            name="Added by the conversion"
            fill={SERIES_COLORS.conversion}
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
