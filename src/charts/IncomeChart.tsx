import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { IncomeYear } from '../calculations/irmaa';
import { formatUsd, formatUsdCompact } from '../utils/format';
import { useChartSelection } from './chartSelection';
import { HatchDefs, SERIES_COLORS, type AxisMode } from './RmdChart';

interface Props {
  baseline: IncomeYear[];
  strategy: IncomeYear[];
  axis: AxisMode;
  selectedYear: number | null;
  onSelectYear: (year: number) => void;
}

/** Left margin (0) + Y-axis width (56), and right margin; must match the chart props below. */
const PLOT_INSETS = { left: 56, right: 8, scale: 'band' } as const;
const TIER_KEYS = ['t1', 't2', 't3', 't4', 't5'] as const;

interface Row {
  year: number;
  age: number;
  x: number;
  baseline: number;
  strategy: number;
  baseTier: number;
  stratTier: number;
  premiumYear: number;
  medicare: boolean;
  t1: number | null;
  t2: number | null;
  t3: number | null;
  t4: number | null;
  t5: number | null;
}

function IncomeTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0]!.payload;
  const tier = (t: number) => (r.medicare ? (t === 0 ? 'no IRMAA' : `IRMAA tier ${t}`) : 'before Medicare');
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">
        Age {r.age} · {r.year} income
      </p>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-ink-2">MAGI, strategy</dt>
        <dd className="text-right font-semibold text-ink">{formatUsd(r.strategy)}</dd>
        <dt className="text-ink-2">MAGI, no strategy</dt>
        <dd className="text-right text-ink">{formatUsd(r.baseline)}</dd>
      </dl>
      <p className="mt-1 text-ink-2">
        {r.premiumYear} premiums: strategy {tier(r.stratTier)}; no strategy {tier(r.baseTier)}
      </p>
    </div>
  );
}

export function IncomeChart({ baseline, strategy, axis, selectedYear, onSelectYear }: Props) {
  const rows: Row[] = strategy.map((s, i) => {
    const b = baseline[i];
    const th = (k: number) => (s.medicareApplies ? (s.thresholds[k] ?? null) : null);
    return {
      year: s.year,
      age: s.age,
      x: axis === 'age' ? s.age : s.year,
      baseline: b?.magi ?? 0,
      strategy: s.magi,
      baseTier: b?.tier ?? 0,
      stratTier: s.tier,
      premiumYear: s.premiumYear,
      medicare: s.medicareApplies,
      t1: th(0),
      t2: th(1),
      t3: th(2),
      t4: th(3),
      t5: th(4),
    };
  });
  const maxIncome = Math.max(1, ...rows.map((r) => Math.max(r.baseline, r.strategy)));
  // Show tier 1 always, and higher tiers only where income comes near them.
  const visibleTiers = TIER_KEYS.filter((k, i) => i === 0 || rows.some((r) => (r[k] ?? Infinity) <= maxIncome * 1.1));
  const selected = rows.find((r) => r.year === selectedYear);
  const selection = useChartSelection(rows, onSelectYear, PLOT_INSETS);

  return (
    <div className="h-[300px] w-full sm:h-[380px] print:h-auto" data-testid="income-chart" {...selection}>
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
          {selected && <ReferenceArea x1={selected.x} x2={selected.x} fill="rgba(31,78,140,0.10)" ifOverflow="visible" />}
          <Tooltip content={<IncomeTooltip />} cursor={{ fill: 'rgba(31,78,140,0.06)' }} />
          <Bar dataKey="baseline" name="No strategy" fill="url(#hatch-baseline)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="strategy" name="Current strategy" fill={SERIES_COLORS.strategy} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          {visibleTiers.map((k, i) => (
            <Line
              key={k}
              dataKey={k}
              name={`IRMAA tier ${i + 1} threshold`}
              type="stepAfter"
              stroke="var(--color-threshold)"
              strokeOpacity={1 - i * 0.18}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
