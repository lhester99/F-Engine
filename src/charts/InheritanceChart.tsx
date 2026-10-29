import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Legacy } from '../calculations/legacy';
import { formatUsd, formatUsdCompact } from '../utils/format';
import { ChartLegend } from './Legend';

export const INHERITANCE_COLORS = { pretax: 'var(--color-strategy)', roth: 'var(--color-roth)' };

interface Row {
  x: string;
  year: number;
  bPretax: number;
  bRoth: number;
  sPretax: number;
  sRoth: number;
}

function Hatch({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#eef1f4" />
      <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="2.5" />
    </pattern>
  );
}

const Swatch = ({ color, hatched }: { color: string; hatched?: boolean }) => (
  <svg width="14" height="14">
    {hatched && (
      <defs>
        <pattern id={`legend-${color.replace(/\W/g, '')}`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="#eef1f4" />
          <line x1="0" y1="0" x2="0" y2="5" stroke={color} strokeWidth="2" />
        </pattern>
      </defs>
    )}
    <rect width="14" height="14" rx="2" fill={hatched ? `url(#legend-${color.replace(/\W/g, '')})` : color} />
  </svg>
);

function InheritanceTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0]!.payload;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">
        {r.x} · start of {r.year}
      </p>
      <table className="tabular-nums">
        <thead>
          <tr className="text-muted">
            <th className="pr-3 text-left font-normal" />
            <th className="px-2 text-right font-normal">No strategy</th>
            <th className="pl-2 text-right font-normal">Strategy</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="pr-3 text-left font-normal text-ink-2">Pre-tax IRA</th>
            <td className="px-2 text-right">{formatUsd(r.bPretax)}</td>
            <td className="pl-2 text-right">{formatUsd(r.sPretax)}</td>
          </tr>
          <tr>
            <th className="pr-3 text-left font-normal text-ink-2">Roth IRA</th>
            <td className="px-2 text-right">{formatUsd(r.bRoth)}</td>
            <td className="pl-2 text-right">{formatUsd(r.sRoth)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Inherited pre-tax and Roth IRA balances at the start of each year of the 10-year
 * window: no strategy (hatched) beside the strategy (solid), each stacked pre-tax
 * then Roth. Pre-tax balances are before heirs' tax.
 */
export function InheritanceChart({ baseline, strategy }: { baseline: Legacy; strategy: Legacy }) {
  const rows: Row[] = baseline.schedule.map((b, i) => {
    const s = strategy.schedule[i]!;
    return {
      x: `Yr ${b.index}`,
      year: b.year,
      bPretax: b.inheritedBalanceStart,
      bRoth: b.rothBalanceStart,
      sPretax: s.inheritedBalanceStart,
      sRoth: s.rothBalanceStart,
    };
  });
  return (
    <>
      <div className="h-[260px] w-full sm:h-[300px] print:h-auto" data-testid="inheritance-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={3} barCategoryGap="20%">
            <defs>
              <Hatch id="hatch-inh-pretax" color="var(--color-strategy)" />
              <Hatch id="hatch-inh-roth" color="var(--color-roth)" />
            </defs>
            <CartesianGrid vertical={false} stroke="#eceff3" />
            <XAxis dataKey="x" tickLine={false} axisLine={{ stroke: '#d9dee5' }} tick={{ fontSize: 11, fill: '#667085' }} />
            <YAxis tickFormatter={formatUsdCompact} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#667085' }} width={56} />
            <Tooltip content={<InheritanceTooltip />} cursor={{ fill: 'rgba(31,78,140,0.06)' }} />
            <Bar dataKey="bPretax" stackId="b" name="Pre-tax IRA, no strategy" fill="url(#hatch-inh-pretax)" isAnimationActive={false} />
            <Bar dataKey="bRoth" stackId="b" name="Roth IRA, no strategy" fill="url(#hatch-inh-roth)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="sPretax" stackId="s" name="Pre-tax IRA, strategy" fill={INHERITANCE_COLORS.pretax} isAnimationActive={false} />
            <Bar dataKey="sRoth" stackId="s" name="Roth IRA, strategy" fill={INHERITANCE_COLORS.roth} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        label="Chart legend"
        items={[
          { label: 'Pre-tax IRA, no strategy (left bar)', swatch: <Swatch color="var(--color-strategy)" hatched /> },
          { label: 'Roth IRA, no strategy', swatch: <Swatch color="var(--color-roth)" hatched /> },
          { label: 'Pre-tax IRA, strategy (right bar)', swatch: <Swatch color={INHERITANCE_COLORS.pretax} /> },
          { label: 'Roth IRA, strategy', swatch: <Swatch color={INHERITANCE_COLORS.roth} /> },
        ]}
      />
    </>
  );
}
