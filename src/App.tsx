import { BookOpen, ChevronDown, MonitorPlay, Printer, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BalanceChart, BALANCE_SERIES } from './charts/BalanceChart';
import { ChartLegend, HatchSwatch, LineSwatch, SolidSwatch } from './charts/Legend';
import { BracketChart } from './charts/BracketChart';
import { WealthChart } from './charts/WealthChart';
import { CashFlowPanel } from './inputs/CashFlowPanel';
import { IncomeChart } from './charts/IncomeChart';
import { ConversionPlanTable } from './components/ConversionPlanTable';
import { RmdChart, SERIES_COLORS, type AxisMode, type RmdView } from './charts/RmdChart';
import type { SavedStrategy } from './calculations/compare';
import { Disclosures } from './components/Disclosures';
import { Findings } from './components/Findings';
import { ScenarioCompare } from './components/ScenarioCompare';
import { TradeOffs } from './components/TradeOffs';
import { AssumptionsPanel } from './inputs/AssumptionsPanel';
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
import { deathYear } from './calculations/household';
import { SpousePanel } from './inputs/SpousePanel';

type Tab = 'rmd' | 'brackets' | 'income' | 'wealth';
const TABS: { id: Tab; label: string; short: string }[] = [
  { id: 'rmd', label: 'RMD Projections', short: 'RMDs' },
  { id: 'brackets', label: 'Tax Brackets', short: 'Brackets' },
  { id: 'income', label: 'IRMAA', short: 'IRMAA' },
  { id: 'wealth', label: 'Wealth', short: 'Wealth' },
];

/** The claude.ai preview build cannot open the print dialog, so it hides the print button. */
const CAN_PRINT = import.meta.env.VITE_NO_PRINT !== '1';

let savedCounter = 0;

export default function App() {
  const [scenario, setScenario] = useState<Scenario>(() => defaultScenario());
  // Bumped on reset so every input remounts with default values.
  const [resetKey, setResetKey] = useState(0);
  const [tab, setTab] = useState<Tab>('rmd');
  const [view, setView] = useState<RmdView>('required');
  const [axis, setAxis] = useState<AxisMode>('age');
  const [showConversions, setShowConversions] = useState(true);
  const [showBaselineBalances, setShowBaselineBalances] = useState(true);
  const [wealthView, setWealthView] = useState<'aftertax' | 'balances'>('aftertax');
  const [showTable, setShowTable] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [mobileInputsOpen, setMobileInputsOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [saved, setSaved] = useState<SavedStrategy[]>([]);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ rmd: null, brackets: null, income: null, wealth: null });

  const update = useCallback((fn: (s: Scenario) => Scenario) => setScenario(fn), []);
  const {
    baseline,
    strategy,
    baselineSummary,
    strategySummary,
    baselineIncome,
    strategyIncome,
    baselineIrmaa,
    strategyIrmaa,
    tax,
    wealth,
    findings,
  } = useProjection(scenario);
  const closeMethodology = useCallback(() => setMethodologyOpen(false), []);

  const allMessages = strategy.messages;
  const years = useMemo(() => strategy.years.map((y) => y.year), [strategy.years]);
  const selected = selectedYear !== null ? strategy.years.find((y) => y.year === selectedYear) : undefined;
  const selectedBaseline = selected ? baseline.years.find((y) => y.year === selected.year) : undefined;
  const selectedIncome = selected ? strategyIncome.find((y) => y.year === selected.year) : undefined;
  const selectedBaselineIncome = selected ? baselineIncome.find((y) => y.year === selected.year) : undefined;
  const conversionYears = scenario.strategy.conversions.length;
  const qcdCount = scenario.strategy.recurringQcds.length + scenario.strategy.oneTimeQcds.length;
  const rate = effectiveAnnualReturn(scenario.returns);
  const dYear = strategy.ok ? deathYear(scenario) : null;

  const reset = () => {
    setScenario(defaultScenario());
    setSaved([]);
    setPresenting(false);
    setResetKey((k) => k + 1);
    setSelectedYear(null);
    setView('required');
    setAxis('age');
    setTab('rmd');
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const saveStrategy = (name: string) =>
    setSaved((list) => [
      ...list,
      { id: `saved-${++savedCounter}`, name, strategy: scenario.strategy, returns: scenario.returns },
    ]);
  const loadStrategy = (id: string) => {
    const s = saved.find((x) => x.id === id);
    if (s) setScenario((cur) => ({ ...cur, strategy: s.strategy, returns: s.returns }));
  };
  const deleteStrategy = (id: string) => setSaved((list) => list.filter((x) => x.id !== id));
  const printSummary = () => {
    setSelectedYear(null);
    // Let React drop interactive-only UI before the print snapshot.
    setTimeout(() => window.print(), 50);
  };

  const caption =
    view === 'required'
      ? 'Required RMDs: the amount the IRS requires to be distributed each calendar year. QCDs can satisfy it but do not reduce it. Roth conversions are excluded.'
      : 'Taxable IRA distributions: RMD dollars not satisfied by QCDs, plus extra withdrawals and any QCD amount made taxable by deductible contributions after 70½. Roth conversions are excluded.';

  const chartControls = (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
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
      {tab === 'rmd' && (
        <label className="flex min-h-9 items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={showConversions} onChange={(e) => setShowConversions(e.target.checked)} />
          Show Roth conversions
        </label>
      )}
      {tab === 'wealth' && (
        <div className="seg" role="group" aria-label="Wealth view">
          <button type="button" className="seg-btn" aria-pressed={wealthView === 'aftertax'} onClick={() => setWealthView('aftertax')}>
            After-tax value
          </button>
          <button type="button" className="seg-btn" aria-pressed={wealthView === 'balances'} onClick={() => setWealthView('balances')}>
            Account balances
          </button>
        </div>
      )}
      {tab === 'wealth' && wealthView === 'balances' && (
        <label className="flex min-h-9 items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={showBaselineBalances} onChange={(e) => setShowBaselineBalances(e.target.checked)} />
          Show no-strategy lines
        </label>
      )}
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface print:border-b-2 print:border-ink">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">RMD Smoothing Analyzer</h1>
            <p className="text-xs text-muted sm:text-sm">Model future required distributions and evaluate smoothing strategies.</p>
            <p className="hidden text-xs text-muted print:block">
              Hypothetical illustration prepared {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            {presenting ? (
              <button type="button" className="btn btn-primary" onClick={() => setPresenting(false)}>
                <X aria-hidden className="h-4 w-4" /> Exit presentation
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => setPresenting(true)} disabled={!strategy.ok}>
                <MonitorPlay aria-hidden className="h-4 w-4" /> Present
              </button>
            )}
            {CAN_PRINT && (
              <button type="button" className="btn" onClick={printSummary} disabled={!strategy.ok}>
                <Printer aria-hidden className="h-4 w-4" /> Print summary
              </button>
            )}
            <button type="button" className="btn" onClick={() => setMethodologyOpen(true)}>
              <BookOpen aria-hidden className="h-4 w-4" /> Methodology
            </button>
            {!presenting && (
              <button type="button" className="btn" onClick={reset}>
                <RotateCcw aria-hidden className="h-4 w-4" /> Reset
              </button>
            )}
          </div>
        </div>
      </header>

      <div
        className={`mx-auto max-w-[1440px] gap-5 px-4 py-4 sm:px-6 lg:py-5 print:block print:px-0 ${
          presenting ? '' : 'lg:grid lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]'
        }`}
      >
        <aside aria-label="Inputs and planning levers" className={`mb-4 lg:mb-0 print:hidden ${presenting ? 'hidden' : ''}`}>
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
            <Section title="Spouse & survivor" badge={scenario.people.length > 1 ? 'Joint' : undefined}>
              <SpousePanel scenario={scenario} update={update} messages={allMessages} />
            </Section>
            <Section title="Household income & taxes">
              <AssumptionsPanel scenario={scenario} update={update} messages={allMessages} />
            </Section>
            <Section title="Taxable account, cash & spending">
              <CashFlowPanel scenario={scenario} update={update} messages={allMessages} />
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

        <main className="min-w-0 space-y-4 print:space-y-3">
          {!strategy.ok ? (
            <div className="panel p-4" role="alert" data-testid="input-errors">
              <p className="mb-2 text-sm font-semibold text-ink">Fix these inputs to see the projection:</p>
              <MessageList messages={strategy.errors} />
            </div>
          ) : (
            <>
              <Findings findings={findings} large={presenting} />
              <SummaryStats baseline={baselineSummary} strategy={strategySummary} wealth={wealth} />

              <div className="panel print:break-inside-avoid">
                <div role="tablist" aria-label="Views" className="flex overflow-x-auto border-b border-line px-2 sm:px-3 print:hidden">
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
                      className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
                        tab === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
                      }`}
                    >
                      <span className="sm:hidden" aria-hidden>
                        {t.short}
                      </span>
                      <span className="max-sm:sr-only">{t.label}</span>
                    </button>
                  ))}
                </div>
                <h2 className="hidden px-3 pt-3 text-sm font-semibold text-ink print:block">{TABS.find((t) => t.id === tab)!.label}</h2>

                <div className="space-y-3 p-3 sm:p-4" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                  {chartControls}

                  {tab === 'rmd' && (
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
                  )}

                  {tab === 'brackets' && (
                    <>
                      <BracketChart
                        baseline={baselineIncome}
                        strategy={strategyIncome}
                        axis={axis}
                        scenario={scenario}
                        deathYear={dYear}
                        selectedYear={selectedYear}
                        onSelectYear={setSelectedYear}
                      />
                      <ChartLegend
                        label="Chart legend"
                        items={[
                          { label: 'No strategy', swatch: <HatchSwatch /> },
                          { label: 'Strategy, before conversion', swatch: <SolidSwatch color={SERIES_COLORS.strategy} /> },
                          { label: 'Roth conversion', swatch: <SolidSwatch color={SERIES_COLORS.conversion} /> },
                          { label: 'Top of each federal bracket (labeled)', swatch: <LineSwatch color="var(--color-ink-2)" dashed /> },
                        ]}
                      />
                      <p className="text-xs text-ink-2" data-testid="chart-caption">
                        Ordinary taxable income after deductions (qualified dividends and gains are taxed separately and not
                        shown). The conversion sits on top of everything else, so it is taxed at the highest rates reached.
                        Brackets after 2026 are projected at the inflation rate entered.
                      </p>
                      <ConversionPlanTable baseline={baselineIncome} strategy={strategyIncome} />
                    </>
                  )}

                  {tab === 'income' && (
                    <>
                      <IncomeChart
                        baseline={baselineIncome}
                        strategy={strategyIncome}
                        axis={axis}
                        selectedYear={selectedYear}
                        onSelectYear={setSelectedYear}
                      />
                      <ChartLegend
                        label="Chart legend"
                        items={[
                          { label: 'MAGI, no strategy', swatch: <HatchSwatch /> },
                          { label: 'MAGI, current strategy', swatch: <SolidSwatch color={SERIES_COLORS.strategy} /> },
                          { label: 'IRMAA tier thresholds (premiums two years later)', swatch: <LineSwatch color="var(--color-threshold)" dashed /> },
                        ]}
                      />
                      <p className="text-xs text-ink-2" data-testid="chart-caption">
                        Estimated MAGI by income year: adjusted gross income (including the taxable part of Social Security,
                        IRA distributions, and conversions) plus tax-exempt interest. QCDs are excluded. Each year's income sets
                        Medicare premiums two years later; thresholds appear once someone on the return is 65 in that premium year.
                      </p>
                    </>
                  )}

                  {tab === 'wealth' && wealthView === 'aftertax' && wealth && (
                    <>
                      <WealthChart wealth={wealth} axis={axis} deathYear={dYear} selectedYear={selectedYear} onSelectYear={setSelectedYear} />
                      <ChartLegend
                        label="Chart legend"
                        items={[
                          { label: 'After-tax value, current strategy', swatch: <LineSwatch color={SERIES_COLORS.strategy} /> },
                          { label: 'After-tax value, no strategy', swatch: <LineSwatch color={SERIES_COLORS.baseline} dashed /> },
                        ]}
                      />
                      <p className="text-xs text-ink-2" data-testid="chart-caption">
                        After-tax value on December 31 of each year: Roth IRA + taxable account + cash + pre-tax IRAs after the
                        heirs' {formatPercent(scenario.analysis.heirsTaxRate, 0)} tax rate. Taxes on IRA income and conversions are
                        already paid from these accounts. Gains in the taxable account are not taxed here, because heirs receive a
                        step-up in basis.
                      </p>
                    </>
                  )}

                  {tab === 'wealth' && wealthView === 'balances' && (
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
                        December 31 balances by year. Solid lines show the current strategy; dashed lines show no strategy. The
                        taxable account holds RMD money left after taxes and spending, and pays the tax on conversions. Pre-tax
                        balances still owe income tax, so see After-tax value for a like-for-like comparison.
                      </p>
                    </>
                  )}

                  <div className="print:hidden">
                    {selected ? (
                      <YearDetail
                        baseline={selectedBaseline}
                        strategy={selected}
                        baselineIncome={selectedBaselineIncome}
                        strategyIncome={selectedIncome}
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
                  </div>

                  {tab === 'rmd' && !presenting && (
                    <div className="print:hidden">
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

              <div className="print:break-inside-avoid">
                <TradeOffs tax={tax} baselineIrmaa={baselineIrmaa} strategyIrmaa={strategyIrmaa} analysis={scenario.analysis} />
              </div>
              <div className="print:break-inside-avoid">
                <ScenarioCompare
                  scenario={scenario}
                  saved={saved}
                  onSave={saveStrategy}
                  onLoad={loadStrategy}
                  onDelete={deleteStrategy}
                  readOnly={presenting}
                />
              </div>
            </>
          )}

          <footer className="space-y-2 border-t border-line pt-3 pb-6">
            <Disclosures compact={!presenting} />
            <p className="text-xs text-muted print:hidden">
              See{' '}
              <button type="button" className="font-medium text-accent underline" onClick={() => setMethodologyOpen(true)}>
                Methodology
              </button>{' '}
              for rules, sources, and known limitations.
            </p>
          </footer>
        </main>
      </div>

      <MethodologyPanel open={methodologyOpen} onClose={closeMethodology} />
    </div>
  );
}
