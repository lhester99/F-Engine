import { BookOpen, RotateCcw, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BalanceChart, BALANCE_SERIES } from './charts/BalanceChart';
import { ChartLegend, HatchSwatch, LineSwatch, SolidSwatch } from './charts/Legend';
import { RmdChart, SERIES_COLORS, type AxisMode, type RmdView } from './charts/RmdChart';
import { MessageList } from './components/MessageList';
import { MethodologyPanel } from './components/MethodologyPanel';
import { Section } from './components/Section';
import { SummaryStats } from './components/SummaryStats';
import { YearDetail } from './components/YearDetail';
import { YearTable } from './components/YearTable';
import { useProjection } from './hooks/useProjection';
import { ClientPanel } from './inputs/ClientPanel';
import { ConversionPanel } from './inputs/ConversionPanel';
import { QcdPanel } from './inputs/QcdPanel';
import { ReturnsPanel } from './inputs/ReturnsPanel';
import type { Scenario } from './types';
import { defaultScenario } from './utils/defaultScenario';
import { formatPercent } from './utils/format';
import { effectiveAnnualReturn } from './calculations/returns';

type Tab = 'rmd' | 'balances';
const TABS: { id: Tab; label: string }[] = [
  { id: 'rmd', label: 'RMD Projections' },
  { id: 'balances', label: 'Account Balances' },
];

export default function App() {
  const [scenario, setScenario] = useState<Scenario>(() => defaultScenario());
  // Bumped on reset so every input remounts with default values.
  const [resetKey, setResetKey] = useState(0);
  const [tab, setTab] = useState<Tab>('rmd');
  const [view, setView] = useState<RmdView>('required');
  const [axis, setAxis] = useState<AxisMode>('age');
  const [showConversions, setShowConversions] = useState(true);
  const [showBaselineBalances, setShowBaselineBalances] = useState(true);
  const [showTable, setShowTable] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [mobileInputsOpen, setMobileInputsOpen] = useState(false);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ rmd: null, balances: null });

  const update = useCallback((fn: (s: Scenario) => Scenario) => setScenario(fn), []);
  const { baseline, strategy, baselineSummary, strategySummary } = useProjection(scenario);
  const closeMethodology = useCallback(() => setMethodologyOpen(false), []);

  const allMessages = strategy.messages;
  const years = useMemo(() => strategy.years.map((y) => y.year), [strategy.years]);
  const selected = selectedYear !== null ? strategy.years.find((y) => y.year === selectedYear) : undefined;
  const selectedBaseline = selected ? baseline.years.find((y) => y.year === selected.year) : undefined;
  const conversionYears = scenario.strategy.conversions.length;
  const qcdCount = scenario.strategy.recurringQcds.length + scenario.strategy.oneTimeQcds.length;
  const rate = effectiveAnnualReturn(scenario.returns);

  const reset = () => {
    setScenario(defaultScenario());
    setResetKey((k) => k + 1);
    setSelectedYear(null);
    setView('required');
    setAxis('age');
    setTab('rmd');
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next: Tab = tab === 'rmd' ? 'balances' : 'rmd';
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const caption =
    view === 'required'
      ? 'Required RMDs: the amount the IRS requires to be distributed each calendar year. QCDs can satisfy it but do not reduce it. Roth conversions are excluded.'
      : 'Taxable IRA distributions: RMD dollars not satisfied by QCDs, plus extra withdrawals. Roth conversions are excluded.';

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">RMD Smoothing Analyzer</h1>
            <p className="text-xs text-muted sm:text-sm">Model future required distributions and evaluate smoothing strategies.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => setMethodologyOpen(true)}>
              <BookOpen aria-hidden className="h-4 w-4" /> Methodology
            </button>
            <button type="button" className="btn" onClick={reset}>
              <RotateCcw aria-hidden className="h-4 w-4" /> Reset
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] gap-5 px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] lg:py-5">
        <aside aria-label="Inputs and planning levers" className="mb-4 lg:mb-0">
          <button
            type="button"
            className="btn mb-2 w-full justify-between lg:hidden"
            aria-expanded={mobileInputsOpen}
            aria-controls="inputs-panel"
            onClick={() => setMobileInputsOpen((o) => !o)}
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal aria-hidden className="h-4 w-4" /> Inputs &amp; planning levers
            </span>
            <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${mobileInputsOpen ? 'rotate-180' : ''}`} />
          </button>
          <div
            id="inputs-panel"
            key={resetKey}
            className={`${mobileInputsOpen ? 'block' : 'hidden'} panel lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto`}
          >
            <Section title="Client & accounts">
              <ClientPanel scenario={scenario} update={update} messages={allMessages} />
            </Section>
            <p className="border-b border-line-soft bg-canvas px-4 py-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
              Planning levers
            </p>
            <Section title="Investment returns" badge={Number.isFinite(rate) ? formatPercent(rate) : undefined}>
              <ReturnsPanel scenario={scenario} update={update} messages={allMessages} />
            </Section>
            <Section title="Roth conversions" badge={conversionYears ? `${conversionYears} yr` : undefined}>
              <ConversionPanel scenario={scenario} update={update} result={strategy} messages={allMessages} />
            </Section>
            <Section title="Qualified charitable distributions" badge={qcdCount ? `${qcdCount}` : undefined}>
              <QcdPanel scenario={scenario} update={update} messages={allMessages} />
            </Section>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          {!strategy.ok ? (
            <div className="panel p-4" role="alert" data-testid="input-errors">
              <p className="mb-2 text-sm font-semibold text-ink">Fix these inputs to see the projection:</p>
              <MessageList messages={strategy.errors} />
            </div>
          ) : (
            <>
              <SummaryStats baseline={baselineSummary} strategy={strategySummary} />

              <div className="panel">
                <div role="tablist" aria-label="Views" className="flex border-b border-line px-2 sm:px-3">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      ref={(el) => {
                        tabRefs.current[t.id] = el;
                      }}
                      id={`tab-${t.id}`}
                      role="tab"
                      type="button"
                      aria-selected={tab === t.id}
                      aria-controls={`panel-${t.id}`}
                      tabIndex={tab === t.id ? 0 : -1}
                      onKeyDown={onTabKey}
                      onClick={() => setTab(t.id)}
                      className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium ${
                        tab === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-3 p-3 sm:p-4" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {tab === 'rmd' && (
                      <div className="seg" role="group" aria-label="Distribution series">
                        <button type="button" className="seg-btn" aria-pressed={view === 'required'} onClick={() => setView('required')}>
                          Required RMDs
                        </button>
                        <button type="button" className="seg-btn" aria-pressed={view === 'taxable'} onClick={() => setView('taxable')}>
                          Taxable IRA Distributions
                        </button>
                      </div>
                    )}
                    <div className="seg" role="group" aria-label="Horizontal axis">
                      <button type="button" className="seg-btn" aria-pressed={axis === 'age'} onClick={() => setAxis('age')}>
                        Age
                      </button>
                      <button type="button" className="seg-btn" aria-pressed={axis === 'year'} onClick={() => setAxis('year')}>
                        Year
                      </button>
                    </div>
                    {tab === 'rmd' ? (
                      <label className="flex min-h-9 items-center gap-2 text-sm text-ink-2">
                        <input type="checkbox" className="h-4 w-4 accent-accent" checked={showConversions} onChange={(e) => setShowConversions(e.target.checked)} />
                        Show Roth conversions
                      </label>
                    ) : (
                      <label className="flex min-h-9 items-center gap-2 text-sm text-ink-2">
                        <input type="checkbox" className="h-4 w-4 accent-accent" checked={showBaselineBalances} onChange={(e) => setShowBaselineBalances(e.target.checked)} />
                        Show no-strategy lines
                      </label>
                    )}
                  </div>

                  {tab === 'rmd' ? (
                    <>
                      <RmdChart
                        baseline={baseline.years}
                        strategy={strategy.years}
                        view={view}
                        axis={axis}
                        showConversions={showConversions}
                        selectedYear={selectedYear}
                        onSelectYear={setSelectedYear}
                      />
                      <ChartLegend
                        label="Chart legend"
                        items={[
                          { label: 'No strategy (baseline)', swatch: <HatchSwatch /> },
                          { label: 'Current strategy', swatch: <SolidSwatch color={SERIES_COLORS.strategy} /> },
                          ...(showConversions ? [{ label: 'Roth conversions (not RMDs)', swatch: <LineSwatch color={SERIES_COLORS.conversion} marker="square" /> }] : []),
                        ]}
                      />
                      <p className="text-xs text-ink-2" data-testid="chart-caption">
                        {caption}
                      </p>
                    </>
                  ) : (
                    <>
                      <BalanceChart
                        baseline={baseline.years}
                        strategy={strategy.years}
                        axis={axis}
                        showBaseline={showBaselineBalances}
                        selectedYear={selectedYear}
                        onSelectYear={setSelectedYear}
                      />
                      <ChartLegend
                        label="Chart legend"
                        items={BALANCE_SERIES.flatMap((s) => [
                          { label: `${s.label}, strategy`, swatch: <LineSwatch color={s.color} /> },
                          ...(showBaselineBalances ? [{ label: `${s.label}, no strategy`, swatch: <LineSwatch color={s.color} dashed /> }] : []),
                        ])}
                      />
                      <p className="text-xs text-ink-2" data-testid="chart-caption">
                        December 31 balances by year. Solid lines show the current strategy; dashed lines show no strategy. Shown
                        to explain why RMDs change. Distributions leave the accounts once withdrawn, and income tax on conversions is
                        not deducted (except any withholding entered), so totals are not a measure of after-tax wealth.
                      </p>
                    </>
                  )}

                  {selected ? (
                    <YearDetail
                      baseline={selectedBaseline}
                      strategy={selected}
                      years={years}
                      onSelectYear={setSelectedYear}
                      onClose={() => setSelectedYear(null)}
                    />
                  ) : (
                    <p className="text-xs text-muted">
                      Click or tap any year in the chart for a full breakdown.{' '}
                      <button type="button" className="font-medium text-accent underline" onClick={() => setSelectedYear(strategySummary.firstRmd?.year ?? years[0] ?? null)}>
                        Open year detail
                      </button>
                    </p>
                  )}

                  {tab === 'rmd' && (
                    <div>
                      <button type="button" className="btn" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
                        {showTable ? 'Hide' : 'Show'} year-by-year table
                      </button>
                      {showTable && (
                        <div className="mt-2">
                          <YearTable baseline={baseline.years} strategy={strategy.years} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <footer className="pb-6 text-xs leading-relaxed text-muted">
            Hypothetical illustration only. Projections depend on the assumptions entered, are not recommendations, and do
            not account for taxes beyond the distribution amounts shown. Lower RMDs are not automatically better; weigh the
            trade-offs. See{' '}
            <button type="button" className="font-medium text-accent underline" onClick={() => setMethodologyOpen(true)}>
              Methodology
            </button>{' '}
            for rules, sources, and known limitations.
          </footer>
        </main>
      </div>

      <MethodologyPanel open={methodologyOpen} onClose={closeMethodology} />
    </div>
  );
}
