import { useState } from 'react';
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { inTodaysDollars, type Impact, type ImpactBar, type ImpactPair } from '../calculations/impact';
import { ChartLegend, SolidSwatch } from '../charts/Legend';
import { formatUsd, formatUsdCompact } from '../utils/format';

/** Segment colors, checked for color-vision deficiency; segments also carry direct labels and white gaps. */
const SEGMENTS = [
  { key: 'pretax', label: 'Pre-tax IRAs', color: 'var(--color-strategy)' },
  { key: 'roth', label: 'Roth IRAs', color: 'var(--color-roth)' },
  { key: 'outside', label: 'Taxable account & cash', color: 'var(--color-taxable)' },
] as const;

interface Row extends ImpactBar {
  name: string;
}

function change(b: number, s: number) {
  const d = s - b;
  if (Math.abs(d) < 0.5) return 'No change';
  const pct = b > 0.5 ? ` (${d > 0 ? '+' : '−'}${Math.abs((d / b) * 100).toFixed(1)}%)` : '';
  return `${d > 0 ? '▲ +' : '▼ −'}${formatUsdCompact(Math.abs(d))}${pct}`;
}

type SegmentKey = (typeof SEGMENTS)[number]['key'];

/** A value label drawn inside its segment only when the segment is wide enough to hold it. */
function FitLabel(props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown }) {
  const w = Number(props.width ?? 0);
  const text = formatUsdCompact(Number(props.value ?? 0));
  if (w < text.length * 7.5 + 10) return null;
  return (
    <text
      x={Number(props.x) + w / 2}
      y={Number(props.y) + Number(props.height) / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fill="#fff"
      fontSize={12}
      fontWeight={600}
    >
      {text}
    </text>
  );
}

function ImpactTooltip({
  active,
  payload,
  totalLabel,
  keys,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  totalLabel: string;
  keys: readonly SegmentKey[];
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0]!.payload;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">{r.name}</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
        {SEGMENTS.filter((s) => keys.includes(s.key)).map((s) => (
          <div key={s.key} className="contents">
            <dt className="text-ink-2">{s.label}</dt>
            <dd className="text-right text-ink">{formatUsd(r[s.key])}</dd>
          </div>
        ))}
        <dt className="font-semibold text-ink">{totalLabel}</dt>
        <dd className="text-right font-semibold text-ink">{formatUsd(r.total)}</dd>
      </dl>
    </div>
  );
}

function ImpactCard({
  title,
  headline,
  sub,
  pair,
  totalLabel,
  testId,
  keys = ['pretax', 'roth', 'outside'],
}: {
  keys?: readonly SegmentKey[];
  title: string;
  headline: string;
  sub: string;
  pair: ImpactPair;
  totalLabel: string;
  testId: string;
}) {
  const shown = SEGMENTS.filter((s) => keys.includes(s.key));
  const pick = (b: ImpactBar): Row => {
    const r = { name: '', pretax: 0, roth: 0, outside: 0, total: 0 };
    for (const k of keys) r[k] = b[k];
    r.total = keys.reduce((t, k) => t + b[k], 0);
    return r;
  };
  const rows: Row[] = [
    { ...pick(pair.baseline), name: 'No strategy' },
    { ...pick(pair.strategy), name: 'With strategy' },
  ];
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <figure className="m-0 flex min-w-0 flex-col rounded-md border border-line-soft bg-surface p-3" data-testid={testId}>
      <figcaption>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</p>
        <p className="mt-1 text-xl font-semibold text-ink tabular-nums sm:text-2xl">{headline}</p>
        <p className="text-xs text-ink-2 tabular-nums">{sub}</p>
      </figcaption>
      <div className="mt-2 h-[120px] w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 0 }} barCategoryGap="22%">
            <XAxis type="number" hide domain={[0, max]} />
            <YAxis type="category" dataKey="name" width={92} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#34476b' }} />
            <Tooltip content={<ImpactTooltip totalLabel={totalLabel} keys={keys} />} cursor={{ fill: 'rgba(29,91,214,0.06)' }} />
            {shown.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="a"
                fill={s.color}
                stroke="#fff"
                strokeWidth={2}
                radius={i === shown.length - 1 ? [0, 4, 4, 0] : 0}
                isAnimationActive={false}
              >
                <LabelList dataKey={s.key} content={<FitLabel />} />
                {i === shown.length - 1 && (
                  <LabelList dataKey="total" position="right" formatter={(v: unknown) => formatUsdCompact(Number(v))} fill="#10264f" fontSize={12} fontWeight={600} />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="sr-only">
      <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Scenario</th>
            {shown.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
            <th scope="col">{totalLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <th scope="row">{r.name}</th>
              {shown.map((s) => (
                <td key={s.key}>{formatUsd(r[s.key])}</td>
              ))}
              <td>{formatUsd(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}

/** Before/after bars at the top of the page: account mix, after-tax wealth, and what heirs keep. */
export function ImpactCharts({ impact, large }: { impact: Impact; large?: boolean }) {
  const [today, setToday] = useState(false);
  const f = impact.inflationFactor;
  const adj = (p: ImpactPair): ImpactPair => (today ? { baseline: inTodaysDollars(p.baseline, f), strategy: inTodaysDollars(p.strategy, f) } : p);
  const mix = adj(impact.mix);
  const afterTax = adj(impact.afterTax);
  const heirs = impact.heirs;
  const at = `at age ${impact.endAge} (${impact.endYear})`;
  const arrow = (b: number, s: number) => `${formatUsdCompact(b)} → ${formatUsdCompact(s)}`;

  return (
    <section className={`panel p-3 sm:p-4 print:break-inside-avoid ${large ? 'text-base' : ''}`} aria-labelledby="impact-title" data-testid="impact">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="impact-title" className="text-sm font-semibold text-ink">The plan’s impact</h2>
          <p className="text-xs text-muted">No strategy compared with the current strategy. Hypothetical projections, not guarantees.</p>
        </div>
        <div className="seg print:hidden" role="group" aria-label="Dollars shown in">
          <button type="button" className="seg-btn" aria-pressed={!today} onClick={() => setToday(false)}>
            Future dollars
          </button>
          <button type="button" className="seg-btn" aria-pressed={today} onClick={() => setToday(true)}>
            Today’s dollars
          </button>
        </div>
      </div>
      <ChartLegend label="Impact chart legend" items={SEGMENTS.map((s) => ({ label: s.label, swatch: <SolidSwatch color={s.color} /> }))} />
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
        <ImpactCard
          testId="impact-mix"
          title="Pre-tax vs. Roth IRAs"
          headline={`Roth ${arrow(mix.baseline.roth, mix.strategy.roth)}`}
          sub={`Pre-tax ${arrow(mix.baseline.pretax, mix.strategy.pretax)} ${at}. Pre-tax balances still owe income tax. Taxable account and cash: ${arrow(mix.baseline.outside, mix.strategy.outside)}.`}
          pair={mix}
          keys={['pretax', 'roth']}
          totalLabel="IRA balances"
        />
        <ImpactCard
          testId="impact-wealth"
          title="After-tax wealth"
          headline={arrow(afterTax.baseline.total, afterTax.strategy.total)}
          sub={`${change(afterTax.baseline.total, afterTax.strategy.total)} ${at}, counting pre-tax money after heirs’ tax.`}
          pair={afterTax}
          totalLabel="After-tax value"
        />
        <ImpactCard
          testId="impact-heirs"
          title="What heirs keep"
          headline={arrow(heirs.baseline.total, heirs.strategy.total)}
          sub={`${change(heirs.baseline.total, heirs.strategy.total)} in present value, after heirs’ tax under the 10-year rule.`}
          pair={heirs}
          totalLabel="Heirs keep (present value)"
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        {today
          ? `Today’s dollars: end-of-projection amounts divided by ${impact.inflationFactor.toFixed(2)} (inflation entered). `
          : 'Future dollars: amounts as projected for that year. '}
        What heirs keep is always a present value (discounted to today), so the switch does not change it. Details are in the tabs below.
      </p>
    </section>
  );
}
