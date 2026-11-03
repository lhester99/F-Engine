import type { IncomeItem, IncomeKind, Scenario } from '../types';
import { parseIsoDate } from './dates';
import { deathYear } from './household';

/** Incomes that are net investment income for the 3.8% NIIT (IRC §1411). */
export const NET_INVESTMENT_KINDS: ReadonlySet<IncomeKind> = new Set(['rental', 'interest', 'annuity']);

export const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  wages: 'Wages or part-time work (W-2)',
  pension: 'Pension or qualified annuity',
  annuity: 'Non-qualified annuity (taxable part)',
  rental: 'Rental income (net)',
  interest: 'Interest',
  other: 'Other ordinary income',
};

/** Short labels for summaries and tables. */
export const INCOME_KIND_SHORT: Record<IncomeKind, string> = {
  wages: 'Wages',
  pension: 'Pension',
  annuity: 'Annuity',
  rental: 'Rental',
  interest: 'Interest',
  other: 'Other income',
};

/** Default share continuing for a survivor, by kind (editable per item). */
export const DEFAULT_SURVIVOR_SHARE: Record<IncomeKind, number> = {
  wages: 0,
  pension: 0.5,
  annuity: 1,
  rental: 1,
  interest: 1,
  other: 1,
};

/** One item's amount in `year` (0 outside its ages, or after its owner's death beyond the survivor share). */
export function incomeItemForYear(scenario: Scenario, item: IncomeItem, year: number): number {
  const owner = scenario.people.find((p) => p.id === item.ownerId);
  const birth = owner ? parseIsoDate(owner.dateOfBirth) : null;
  if (!birth || item.amount <= 0) return 0;
  const age = year - birth.year;
  if (item.startAge !== null && age < item.startAge) return 0;
  if (item.endAge !== null && age > item.endAge) return 0;
  const dy = deathYear(scenario);
  const ownerDied = dy !== null && year > dy && item.ownerId === scenario.survivorship.firstDeathPersonId;
  const g = item.growsWithInflation ? Math.pow(1 + scenario.analysis.inflationRate, year - scenario.startYear) : 1;
  return item.amount * g * (ownerDied ? item.survivorShare : 1);
}

/** Income-timeline totals for `year`: all ordinary income, and the part that is net investment income. */
export function incomeItemsForYear(scenario: Scenario, year: number): { ordinary: number; netInvestment: number } {
  let ordinary = 0;
  let netInvestment = 0;
  for (const item of scenario.incomeItems ?? []) {
    const v = incomeItemForYear(scenario, item, year);
    ordinary += v;
    if (NET_INVESTMENT_KINDS.has(item.kind)) netInvestment += v;
  }
  return { ordinary, netInvestment };
}
