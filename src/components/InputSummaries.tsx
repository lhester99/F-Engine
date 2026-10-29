import { ageAttainedInYear, parseIsoDate } from '../calculations/dates';
import { effectiveAnnualReturn } from '../calculations/returns';
import type { Scenario } from '../types';
import { formatPercent, formatUsdCompact } from '../utils/format';

function Row({ term, children }: { term: string; children: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2">
      <dt className="text-muted">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** One-glance summary of the client facts, shown while that section is closed. */
export function HouseholdSummary({ scenario }: { scenario: Scenario }) {
  const s = scenario;
  const ages = s.people
    .map((p) => {
      const b = parseIsoDate(p.dateOfBirth);
      return b ? `${p.label} ${ageAttainedInYear(b, s.startYear)}` : `${p.label} —`;
    })
    .join(' · ');
  const filing = s.people.length > 1 ? 'Married filing jointly' : 'Single';
  const sum = (type: string) => s.accounts.filter((a) => a.type === type).reduce((t, a) => t + a.priorYearEndBalance, 0);
  const ss = s.people.reduce((t, p) => t + p.socialSecurityBenefit, 0);
  const a = s.analysis;
  const cf = s.cashFlow;
  const income = [
    ss > 0 ? `Social Security ${formatUsdCompact(ss)}` : 'No Social Security',
    a.otherOrdinaryIncome > 0 ? `Other ${formatUsdCompact(a.otherOrdinaryIncome)}` : '',
    a.qualifiedInvestmentIncome > 0 ? `Dividends ${formatUsdCompact(a.qualifiedInvestmentIncome)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <dl className="space-y-1 text-sm text-ink-2" data-testid="household-summary">
      <Row term="Ages">{`${ages} · ${filing}`}</Row>
      <Row term="Retirement">{`${formatUsdCompact(sum('traditional_ira'))} Traditional · ${formatUsdCompact(sum('roth_ira'))} Roth`}</Row>
      <Row term="Outside">{`${formatUsdCompact(cf.taxableBalance)} taxable · ${formatUsdCompact(cf.cashBalance)} cash${cf.spendingFromIra > 0 ? ` · spends ${formatUsdCompact(cf.spendingFromIra)}/yr` : ''}`}</Row>
      <Row term="Income">{`${income} per year`}</Row>
      {s.survivorship.enabled && s.people.length > 1 && (
        <Row term="Survivor">{`${s.people.find((p) => p.id === s.survivorship.firstDeathPersonId)?.label ?? 'Client'} dies at ${s.survivorship.deathAge}`}</Row>
      )}
    </dl>
  );
}

/** One-line summary of the rate assumptions, shown while that section is closed. */
export function AssumptionsSummary({ scenario }: { scenario: Scenario }) {
  const a = scenario.analysis;
  const cf = scenario.cashFlow;
  const discount = a.discountMatchesReturn
    ? `Discount = return (${formatPercent(effectiveAnnualReturn(scenario.returns))})`
    : `Discount ${formatPercent(a.discountRate)}`;
  const heirs = scenario.heirs.mode === 'income' ? "Heirs' tax from their income" : `Heirs ${formatPercent(a.heirsTaxRate, 0)}`;
  const parts = [
    `Inflation ${formatPercent(a.inflationRate)}`,
    `State tax ${formatPercent(a.stateTaxRate)}`,
    heirs,
    discount,
    `Taxable yield ${formatPercent(cf.taxableYield)}, basis ${formatUsdCompact(cf.taxableBasis)}`,
    `Cash ${formatPercent(cf.cashRate)}`,
  ];
  return (
    <p className="text-sm leading-relaxed text-ink-2" data-testid="assumptions-summary">
      {parts.join(' · ')}
    </p>
  );
}
