import { BookOpen, ChevronDown, MonitorPlay, Printer, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
import { ImpactCharts } from './components/ImpactCharts';
import { HeaderScenery } from './components/HeaderScenery';
import { ConversionSummary } from './components/ConversionSummary';
import { ScenarioCompare } from './components/ScenarioCompare';
import { TradeOffs } from './components/TradeOffs';
import { AssumptionsPanel } from './inputs/AssumptionsPanel';
import { HeirsPanel } from './inputs/HeirsPanel';
import { LegacyView } from './components/LegacyView';
import { MessageList } from './components/MessageList';
import { MethodologyPanel } from './components/MethodologyPanel';
import { Section } from './components/Section';
import { MoreDetails } from './components/MoreDetails';
import { AssumptionsSummary, HouseholdSummary } from './components/InputSummaries';
import { SummaryStats } from './components/SummaryStats';
import { YearDetail } from './components/YearDetail';
import { YearTable } from './components/YearTable';
import { useProjection } from './hooks/useProjection';
import logo from './assets/retirement-xp-logo.webp?inline';
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

type Tab = 'rmd' | 'brackets' | 'income' | 'wealth' | 'heirs';
const TABS: { id: Tab; label: string; short: string }[] = [
  { id: 'rmd', label: 'RMD Projections', short: 'RMDs' },
  { id: 'brackets', label: 'Tax Brackets', short: 'Brackets' },
  { id: 'income', label: 'IRMAA', short: 'IRMAA' },
  { id: 'wealth', label: 'Wealth', short: 'Wealth' },
  { id: 'heirs', label: 'Heirs', short: 'Heirs' },
];

/** The claude.ai preview build cannot open the print dialog, so it hides the print button. */
const CAN_PRINT = import.meta.env.VITE_NO_PRINT !== '1';

let savedCounter = 0;

/** Input fields in each collapsible sidebar group, so a group with an error opens itself. */
const HOUSEHOLD_FIELDS: ReadonlySet<string> = new Set([
  'dateOfBirth', 'socialSecurityBenefit', 'socialSecurityStartAge', 'endAge', 'accounts',
  'otherOrdinaryIncome', 'qualifiedInvestmentIncome', 'taxableBalance', 'cashBalance', 'spendingFromIra',
]);
const DETAIL_FIELDS: ReadonlySet<string> = new Set([
  'taxExemptInterest', 'itemizedDeductions', 'extraWithdrawals', 'contribution', 'deathAge', 'survivorship',
]);
const ASSUMPTION_FIELDS: ReadonlySet<string> = new Set([
  'stateTaxRate', 'inflationRate', 'discountRate', 'heirsTaxRate', 'heirsCount', 'heirsIncome', 'heirsStateRate',
  'taxableBasis', 'taxableYield', 'cashRate',
]);

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
  const [bracketScale, setBracketScale] = useState<'fit' | 'all'>('fit');
  const [showTable, setShowTable] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  // Clicking the selected year on a chart again returns to the full view.
  const toggleYear = useCallback((year: number) => setSelectedYear((cur) => (cur === year ? null : year)), []);
  useEffect(() => {
    if (selectedYear === null) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) setSelectedYear(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedYear]);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [mobileInputsOpen, setMobileInputsOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [saved, setSaved] = useState<SavedStrategy[]>([]);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ rmd: null, brackets: null, income: null, wealth: null, heirs: null });

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
    impact,
    conversions,
    findings,
  } = useProjection(scenario);
  const closeMethodology = useCallback(() => setMethodologyOpen(false), []);
  const heirsRateText =
    scenario.heirs.mode === 'income' && tax
      ? `average ${formatPercent(tax.strategy.legacy.effectiveRate)} (strategy) / ${formatPercent(tax.baseline.legacy.effectiveRate)} (no strategy)`
      : formatPercent(scenario.analysis.heirsTaxRate, 0);

  const allMessages = strategy.messages;
  const hasError = (fields: ReadonlySet<string>) => allMessages.some((m) => m.severity === 'error' && m.field !== undefined && fields.has(m.field));
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
      {tab !== 'heirs' && (
      <div className="seg" role="group" aria-label="Horizontal axis">
        <button type="button" className="seg-btn" aria-pressed={axis === 'age'} onClick={() => setAxis('age')}>
          Age
        </button>
        <button type="button" className="seg-btn" aria-pressed={axis === 'year'} onClick={() => setAxis('year')}>
          Year
        </button>
      </div>
      )}
      {tab === 'rmd' && (
        <label className="flex min-h-9 items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={showConversions} onChange={(e) => setShowConversions(e.target.checked)} />
          Show Roth conversions
        </label>
      )}
      {tab === 'brackets' && (
        <div className="seg" role="group" aria-label="Bracket chart scale">
          <button type="button" className="seg-btn" aria-pressed={bracketScale === 'fit'} onClick={() => setBracketScale('fit')}>
            Fit to income
          </button>
          <button type="button" className="seg-btn" aria-pressed={bracketScale === 'all'} onClick={() => setBracketScale('all')}>
            All brackets
          </button>
        </div>
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
      {selectedYear !== null && tab !== 'heirs' && (
        <button type="button" className="btn" onClick={() => setSelectedYear(null)} data-testid="show-all-years">
          <X aria-hidden className="h-4 w-4" /> Show all years
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="xp-header relative overflow-hidden print:border-b-2 print:border-ink">
        <HeaderScenery />
        <div className="relative mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:px-6">
          <div className="min-w-0">
            <h1 className="m-0">
              <img src={logo} alt="Retirement XP" className="xp-logo print:hidden" />
              <span aria-hidden className="hidden text-xl font-semibold text-ink print:inline">
                Retirement XP
              </span>
            </h1>
            <p className="hidden text-sm text-muted print:block">Roth conversions, RMDs, taxes now and later, and what heirs keep.</p>
            <p className="hidden text-xs text-muted print:block">
              Hypothetical illustration prepared {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 px-4 pb-3 sm:px-0 min-[934px]:pb-0 print:hidden">
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
            <Section
              title="Client & household"
              defaultOpen={false}
              editToggle
              summary={<HouseholdSummary scenario={scenario} />}
              forceOpen={hasError(HOUSEHOLD_FIELDS) || hasError(DETAIL_FIELDS)}
              testId="section-household"
            >
              <h3 className="subsection-title">Client</h3>
              <ClientPanel scenario={scenario} update={update} messages={allMessages} part="facts" />
              <h3 className="subsection-title">Spouse</h3>
              <SpousePanel scenario={scenario} update={update} messages={allMessages} part="facts" />
              <h3 className="subsection-title">Income &amp; outside accounts</h3>
              <AssumptionsPanel scenario={scenario} update={update} messages={allMessages} part="income" />
              <CashFlowPanel scenario={scenario} update={update} messages={allMessages} part="facts" />
              <MoreDetails
                label="More details: deductions, contributions, withdrawals, first death"
                forceOpen={hasError(DETAIL_FIELDS) || scenario.survivorship.enabled}
              >
                <AssumptionsPanel scenario={scenario} update={update} messages={allMessages} part="details" />
                <ClientPanel scenario={scenario} update={update} messages={allMessages} part="details" />
                <SpousePanel scenario={scenario} update={update} messages={allMessages} part="details" />
              </MoreDetails>
            </Section>
            <p className="xp-group-label border-b border-line-soft bg-canvas px-4 py-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
              Planning levers
            </p>
            <Section title="Roth conversions" badge={conversionYears ? `${conversionYears} yr` : undefined}>
              <ConversionPanel scenario={scenario} update={update} result={strategy} messages={allMessages} />
            </Section>
            <Section title="Qualified charitable distributions" defaultOpen={false} badge={qcdCount ? `${qcdCount}` : 'None'}>
              <QcdPanel scenario={scenario} update={update} messages={allMessages} />
            </Section>
            <Section title="Investment returns" defaultOpen={false} badge={Number.isFinite(rate) ? formatPercent(rate) : undefined}>
              <ReturnsPanel scenario={scenario} update={update} messages={allMessages} />
            </Section>
            <Section
              title="Assumptions"
              defaultOpen={false}
              summary={<AssumptionsSummary scenario={scenario} />}
              forceOpen={hasError(ASSUMPTION_FIELDS)}
              testId="section-assumptions"
            >
              <AssumptionsPanel scenario={scenario} update={update} messages={allMessages} part="assumptions" />
              <h3 className="subsection-title">Heirs</h3>
              <HeirsPanel scenario={scenario} update={update} messages={allMessages} />
              <h3 className="subsection-title">Taxable account &amp; cash</h3>
              <CashFlowPanel scenario={scenario} update={update} messages={allMessages} part="assumptions" />
              <p className="field-hint -mt-1">
                Dividends are paid out and taxed each year as qualified dividends; the account's total return is the investment
                return.
              </p>
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
              {impact && <ImpactCharts impact={impact} large={presenting} />}
              <Findings findings={findings} large={presenting} />
              <SummaryStats baseline={baselineSummary} strategy={strategySummary} wealth={wealth} />

              <div className="panel print:break-inside-avoid">
                <div role="tablist" aria-label="Views" className="xp-tabs flex overflow-x-auto border-b border-line px-2 pt-1.5 sm:px-3 print:hidden">
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
                      className={`xp-tab -mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
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
                  {tab === 'brackets' && conversions && <ConversionSummary analysis={conversions} />}
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
                        onSelectYear={toggleYear}
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
                        onSelectYear={toggleYear}
                        scale={bracketScale}
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
                        onSelectYear={toggleYear}
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
                      <WealthChart wealth={wealth} axis={axis} deathYear={dYear} selectedYear={selectedYear} onSelectYear={toggleYear} />
                      <ChartLegend
                        label="Chart legend"
                        items={[
                          { label: 'After-tax value, current strategy', swatch: <LineSwatch color={SERIES_COLORS.strategy} /> },
                          { label: 'After-tax value, no strategy', swatch: <LineSwatch color={SERIES_COLORS.baseline} dashed /> },
                        ]}
                      />
                      <p className="text-xs text-ink-2" data-testid="chart-caption">
                        After-tax value on December 31 of each year: Roth IRA + taxable account + cash + pre-tax IRAs after the
                        heirs' {heirsRateText} tax rate. Taxes on IRA income and conversions are
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
                        onSelectYear={toggleYear}
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

                  {tab === 'heirs' && tax && (
                    <LegacyView baseline={tax.baseline.legacy} strategy={tax.strategy.legacy} scenario={scenario} discountRate={tax.discountRate} />
                  )}

                  <div className={`print:hidden ${tab === 'heirs' ? 'hidden' : ''}`}>
                    {selected ? (
                      <YearDetail
                        baseline={selectedBaseline}
                        strategy={selected}
                        baselineIncome={selectedBaselineIncome}
                        strategyIncome={selectedIncome}
                        years={years}
                        onSelectYear={setSelectedYear}
                        onClose={() => setSelectedYear(null)}
                        personLabels={Object.fromEntries(scenario.people.map((p) => [p.id, p.label]))}
                      />
                    ) : (
                      <p className="text-xs text-muted">
                        Click or tap any year in the chart for a full breakdown; click it again to show all years.{' '}
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
                <TradeOffs tax={tax} baselineIrmaa={baselineIrmaa} strategyIrmaa={strategyIrmaa} analysis={scenario.analysis} heirs={scenario.heirs} />
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
