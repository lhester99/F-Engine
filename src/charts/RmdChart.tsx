import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearResult } from '../types';
import { formatUsd, formatUsdCompact } from '../utils/format';
import { useChartSelection } from './chartSelection';

export type RmdView = 'required' | 'taxable';
export type AxisMode = 'age' | 'year';

interface Props {
  baseline: YearResult[];
  strategy: YearResult[];
  view: RmdView;
  axis: AxisMode;
  showConversions: boolean;
  selectedYear: number | null;
  onSelectYear: (year: number) => void;
  /** Id of the client (people[0]); other people's conversions are the spouse's. */
  clientId?: string;
}

export const SERIES_COLORS = {
  strategy: 'var(--color-strategy)',
  baseline: 'var(--color-baseline)',
  conversion: 'var(--color-conversion)',
};

/** Left margin (0) + Y-axis width (56), and right margin; must match the chart props below. */
const PLOT_INSETS = { left: 56, right: 8, scale: 'band' } as const;

interface Row {
  year: number;
  age: number;
  x: number;
  baseline: number;
  strategy: number;
  /** Null in years without a conversion, so no marker is drawn. */
  conversion: number | null;
  /** Who converted this year: sets the marker (square, circle, star). */
  converter: Converter | null;
  clientConversion: number;
  spouseConversion: number;
}

/** Who made the year's Roth conversion. */
export type Converter = 'client' | 'spouse' | 'both';

/** Client's and spouse's conversions for a year, and who converted. */
export function conversionsBy(y: YearResult, clientId: string | undefined) {
  let client = 0;
  let spouse = 0;
  for (const p of y.people) {
    if (clientId === undefined || p.personId === clientId) client += p.conversionGross;
    else spouse += p.conversionGross;
  }
  const converter: Converter | null = client > 0 && spouse > 0 ? 'both' : client > 0 ? 'client' : spouse > 0 ? 'spouse' : null;
  return { client, spouse, converter };
}

export function buildRmdRows(
  baseline: YearResult[],
  strategy: YearResult[],
  view: RmdView,
  axis: AxisMode,
  clientId?: string,
): Row[] {
  const pick = (y: YearResult) => (view === 'required' ? y.totals.requiredRmd : y.totals.taxableDistribution);
  return strategy.map((s, i) => {
    const by = conversionsBy(s, clientId);
    return {
      year: s.year,
      age: s.age,
      x: axis === 'age' ? s.age : s.year,
      baseline: baseline[i] ? pick(baseline[i]) : 0,
      strategy: pick(s),
      conversion: s.totals.conversionGross > 0 ? s.totals.conversionGross : null,
      converter: by.converter,
      clientConversion: by.client,
      spouseConversion: by.spouse,
    };
  });
}

/** Marker shapes used on the conversion line (in legend order). */
export function convertersPresent(strategy: YearResult[], clientId?: string): Converter[] {
  const seen = new Set(strategy.map((y) => conversionsBy(y, clientId).converter));
  return (['client', 'spouse', 'both'] as const).filter((c) => seen.has(c));
}

/** Diagonal hatch so the baseline differs from the strategy by texture, not only color. */
export function HatchDefs() {
  return (
    <defs>
      <pattern id="hatch-baseline" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="#e3e7ec" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-baseline)" strokeWidth="2.5" />
      </pattern>
    </defs>
  );
}

/** Points of a five-pointed star centered at (cx, cy). */
export function starPoints(cx: number, cy: number, outer = 8, inner = 3.6): string {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

/** A conversion marker: square for the client, circle for the spouse, star when both convert. */
export function ConversionMarker({ cx, cy, shape }: { cx: number; cy: number; shape: Converter }) {
  const common = { fill: SERIES_COLORS.conversion, stroke: '#fff', strokeWidth: 1.5 };
  if (shape === 'spouse') return <circle cx={cx} cy={cy} r={4.75} {...common} />;
  if (shape === 'both') return <polygon points={starPoints(cx, cy)} {...common} />;
  return <rect x={cx - 4} y={cy - 4} width={8} height={8} {...common} />;
}

/** Recharts dot renderer: the marker shape follows who converted that year. */
export function ConversionDot(props: { cx?: number; cy?: number; index?: number; payload?: Row }) {
  const { cx, cy, index, payload } = props;
  if (cx === undefined || cy === undefined || !payload?.converter) return <g key={index} />;
  return (
    <g key={index} data-converter={payload.converter}>
      <ConversionMarker cx={cx} cy={cy} shape={payload.converter} />
    </g>
  );
}

function ChartTooltip({
  active,
  payload,
  view,
  hasSpouse,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  view: RmdView;
  hasSpouse?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload;
  const name = view === 'required' ? 'Required RMD' : 'Taxable IRA distributions';
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">
        Age {row.age} · {row.year}
      </p>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-ink-2">{name}, strategy</dt>
        <dd className="text-right font-semibold text-ink">{formatUsd(row.strategy)}</dd>
        <dt className="text-ink-2">{name}, no strategy</dt>
        <dd className="text-right text-ink">{formatUsd(row.baseline)}</dd>
        {row.conversion !== null && row.converter !== 'both' && (
          <>
            <dt className="text-ink-2">Roth conversion{row.spouseConversion > 0 ? ' (spouse)' : row.converter && hasSpouse ? ' (client)' : ''}</dt>
            <dd className="text-right text-ink">{formatUsd(row.conversion)}</dd>
          </>
        )}
        {row.converter === 'both' && (
          <>
            <dt className="text-ink-2">Roth conversion, client</dt>
            <dd className="text-right text-ink">{formatUsd(row.clientConversion)}</dd>
            <dt className="text-ink-2">Roth conversion, spouse</dt>
            <dd className="text-right text-ink">{formatUsd(row.spouseConversion)}</dd>
          </>
        )}
      </dl>
      <p className="mt-1 text-[11px] text-muted">Click or tap for year details</p>
    </div>
  );
}

export function RmdChart({ baseline, strategy, view, axis, showConversions, selectedYear, onSelectYear, clientId }: Props) {
  const rows = buildRmdRows(baseline, strategy, view, axis, clientId);
  const hasSpouse = strategy.some((y) => y.people.some((p) => clientId !== undefined && p.personId !== clientId));
  const selected = rows.find((r) => r.year === selectedYear);
  const selection = useChartSelection(rows, onSelectYear, PLOT_INSETS);

  return (
    <div className="h-[300px] w-full sm:h-[380px] print:h-auto" data-testid="rmd-chart" {...selection}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
          barGap={2}
          barCategoryGap="18%"
          style={{ cursor: 'pointer' }}
        >
          <HatchDefs />
          <CartesianGrid vertical={false} stroke="#eceff3" />
          <XAxis
            dataKey="x"
            tickLine={false}
            axisLine={{ stroke: '#d9dee5' }}
            tick={{ fontSize: 11, fill: '#667085' }}
            minTickGap={12}
            label={{ value: axis === 'age' ? 'Age' : 'Year', position: 'insideBottomRight', offset: -2, fontSize: 11, fill: '#667085' }}
            height={32}
          />
          <YAxis
            tickFormatter={formatUsdCompact}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: '#667085' }}
            width={56}
          />
          {selected && <ReferenceArea x1={selected.x} x2={selected.x} fill="rgba(31,78,140,0.10)" ifOverflow="visible" />}
          <Tooltip content={<ChartTooltip view={view} hasSpouse={hasSpouse} />} cursor={{ fill: 'rgba(31,78,140,0.06)' }} />
          <Bar dataKey="baseline" name="No strategy" fill="url(#hatch-baseline)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="strategy" name="Current strategy" fill={SERIES_COLORS.strategy} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          {showConversions && (
            <Line
              dataKey="conversion"
              name="Roth conversions"
              type="linear"
              stroke={SERIES_COLORS.conversion}
              strokeWidth={2}
              dot={ConversionDot}
              activeDot={ConversionDot}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
