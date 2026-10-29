import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WealthComparison } from '../calculations/wealth';
import { formatSignedUsd, formatUsd, formatUsdCompact } from '../utils/format';
import { useChartSelection } from './chartSelection';
import type { AxisMode } from './RmdChart';

interface Props {
  wealth: WealthComparison;
  axis: AxisMode;
  /** Year of the first death, marked on the chart. */
  deathYear?: number | null;
  selectedYear: number | null;
  onSelectYear: (year: number) => void;
}

const PLOT_INSETS = { left: 56, right: 12, scale: 'point' } as const;

interface Row {
  year: number;
  age: number;
  x: number;
  baseline: number;
  strategy: number;
}

function WealthTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0]!.payload;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">
        Age {r.age} · December 31, {r.year}
      </p>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-ink-2">After-tax value, strategy</dt>
        <dd className="text-right font-semibold text-ink">{formatUsd(r.strategy)}</dd>
        <dt className="text-ink-2">After-tax value, no strategy</dt>
        <dd className="text-right text-ink">{formatUsd(r.baseline)}</dd>
        <dt className="text-ink-2">Difference</dt>
        <dd className="text-right text-ink">{formatSignedUsd(r.strategy - r.baseline)}</dd>
      </dl>
    </div>
  );
}

/** After-tax value over time, strategy vs. no strategy, with the breakeven age marked. */
export function WealthChart({ wealth, axis, deathYear = null, selectedYear, onSelectYear }: Props) {
  const rows: Row[] = wealth.points.map((p) => ({ ...p, x: axis === 'age' ? p.age : p.year }));
  const selection = useChartSelection(rows, onSelectYear, PLOT_INSETS);
  const selected = rows.find((r) => r.year === selectedYear);
  const death = deathYear === null ? undefined : rows.find((r) => r.year === deathYear);
  const be = wealth.crossesOver && wealth.breakevenYear !== null ? rows.find((r) => r.year === wealth.breakevenYear) : undefined;

  return (
    <div className="h-[300px] w-full sm:h-[380px] print:h-auto" data-testid="wealth-chart" {...selection}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 16, right: 12, bottom: 4, left: 0 }} style={{ cursor: 'pointer' }}>
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
          {selected && <ReferenceLine x={selected.x} stroke="#98a2b3" />}
          {be && (
            <ReferenceLine
              x={be.x}
              stroke="var(--color-ink-2)"
              strokeDasharray="4 3"
              label={{ value: `Breakeven, age ${be.age}`, position: 'insideTopLeft', fontSize: 11, fill: 'var(--color-ink-2)' }}
            />
          )}
          {death && (
            <ReferenceLine
              x={death.x}
              stroke="var(--color-ink)"
              strokeWidth={1.25}
              label={{ value: 'First death', position: 'insideBottomRight', fontSize: 11, fill: 'var(--color-ink)' }}
            />
          )}
          <Tooltip content={<WealthTooltip />} />
          <Line dataKey="baseline" name="No strategy" stroke="var(--color-baseline)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          <Line dataKey="strategy" name="Current strategy" stroke="var(--color-strategy)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
