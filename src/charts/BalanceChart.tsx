import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearResult } from '../types';
import { formatUsd, formatUsdCompact } from '../utils/format';
import { useChartSelection } from './chartSelection';
import type { AxisMode } from './RmdChart';

interface Props {
  baseline: YearResult[];
  strategy: YearResult[];
  axis: AxisMode;
  showBaseline: boolean;
  selectedYear: number | null;
  onSelectYear: (year: number) => void;
}

export const BALANCE_SERIES = [
  { key: 'pretax', label: 'Traditional IRAs', color: 'var(--color-strategy)' },
  { key: 'roth', label: 'Roth IRA', color: 'var(--color-roth)' },
  { key: 'total', label: 'Total', color: 'var(--color-total)' },
] as const;

/** Left margin (0) + Y-axis width (56), and right margin; must match the chart props below. */
const PLOT_INSETS = { left: 56, right: 12, scale: 'point' } as const;

interface Row {
  year: number;
  age: number;
  x: number;
  pretax: number;
  roth: number;
  total: number;
  pretaxBase: number;
  rothBase: number;
  totalBase: number;
}

function BalanceTooltip({ active, payload, showBaseline }: { active?: boolean; payload?: { payload: Row }[]; showBaseline: boolean }) {
  if (!active || !payload?.length) return null;
  const r = payload[0]!.payload;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">
        Age {r.age} · December 31, {r.year}
      </p>
      <table className="tabular-nums">
        <thead>
          <tr className="text-muted">
            <th className="pr-3 text-left font-normal" />
            <th className="pr-3 text-right font-medium">Strategy</th>
            {showBaseline && <th className="text-right font-medium">No strategy</th>}
          </tr>
        </thead>
        <tbody>
          {BALANCE_SERIES.map((s) => (
            <tr key={s.key}>
              <th className="pr-3 text-left font-normal text-ink-2">{s.label}</th>
              <td className="pr-3 text-right font-semibold text-ink">{formatUsd(r[s.key])}</td>
              {showBaseline && <td className="text-right text-ink">{formatUsd(r[`${s.key}Base`])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BalanceChart({ baseline, strategy, axis, showBaseline, selectedYear, onSelectYear }: Props) {
  const rows: Row[] = strategy.map((s, i) => {
    const b = baseline[i];
    return {
      year: s.year,
      age: s.age,
      x: axis === 'age' ? s.age : s.year,
      pretax: s.totals.endBalancePretax,
      roth: s.totals.endBalanceRoth,
      total: s.totals.endBalanceTotal,
      pretaxBase: b?.totals.endBalancePretax ?? 0,
      rothBase: b?.totals.endBalanceRoth ?? 0,
      totalBase: b?.totals.endBalanceTotal ?? 0,
    };
  });
  const selected = rows.find((r) => r.year === selectedYear);
  const selection = useChartSelection(rows, onSelectYear, PLOT_INSETS);

  return (
    <div className="h-[300px] w-full sm:h-[380px] print:h-auto" data-testid="balance-chart" {...selection}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
          style={{ cursor: 'pointer' }}
        >
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
          <Tooltip content={<BalanceTooltip showBaseline={showBaseline} />} />
          {showBaseline &&
            BALANCE_SERIES.map((s) => (
              <Line
                key={`${s.key}Base`}
                dataKey={`${s.key}Base`}
                name={`${s.label}, no strategy`}
                stroke={s.color}
                strokeOpacity={0.55}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            ))}
          {BALANCE_SERIES.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={`${s.label}, strategy`}
              stroke={s.color}
              strokeWidth={s.key === 'total' ? 3 : 2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
