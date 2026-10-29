import type { Account, FilingStatus, Person, Scenario } from '../types';
import { parseIsoDate } from './dates';

/**
 * Household facts that change over time: who is alive, who owns which
 * account after a spousal rollover, the filing status, and the income and
 * spending that continue after the first death.
 */

/** Year of the first death, or null when not modeled (single client, or option off). */
export function deathYear(scenario: Scenario): number | null {
  const sv = scenario.survivorship;
  if (scenario.people.length < 2 || !sv.enabled) return null;
  const p = scenario.people.find((x) => x.id === sv.firstDeathPersonId);
  const birth = p ? parseIsoDate(p.dateOfBirth) : null;
  return birth ? birth.year + sv.deathAge : null;
}

export function survivorOf(scenario: Scenario): Person | null {
  if (deathYear(scenario) === null) return null;
  return scenario.people.find((p) => p.id !== scenario.survivorship.firstDeathPersonId) ?? null;
}

/** Alive for the whole of `year` or dies during it (the death year counts as alive). */
export function isAlive(scenario: Scenario, personId: string, year: number): boolean {
  const dy = deathYear(scenario);
  return dy === null || personId !== scenario.survivorship.firstDeathPersonId || year <= dy;
}

export function alivePeople(scenario: Scenario, year: number): Person[] {
  return scenario.people.filter((p) => isAlive(scenario, p.id, year));
}

/** After the death year, the deceased's accounts belong to the survivor (spousal rollover). */
export function ownerIdForYear(scenario: Scenario, account: Account, year: number): string {
  const dy = deathYear(scenario);
  if (dy !== null && year > dy && account.ownerId === scenario.survivorship.firstDeathPersonId) {
    return survivorOf(scenario)!.id;
  }
  return account.ownerId;
}

/** Married filing jointly while both are alive (including the death year), single after. */
export function filingStatusForYear(scenario: Scenario, year: number): FilingStatus {
  return alivePeople(scenario, year).length >= 2 ? 'joint' : 'single';
}

/**
 * People alive in `year` treated as 65 or older on the tax return. The IRS
 * considers a person 65 on the day before their 65th birthday, so someone born
 * on January 1 is 65 at the end of the year before (Pub. 501; Schedule 1-A:
 * "born before January 2, 1961" for 2025).
 */
export function peopleAge65ForTax(scenario: Scenario, year: number): number {
  return alivePeople(scenario, year).filter((p) => {
    const b = parseIsoDate(p.dateOfBirth);
    return b !== null && (year - b.year >= 65 || (year - b.year === 64 && b.month === 1 && b.day === 1));
  }).length;
}

/** People alive in `year` who are 65 or older by the end of it (used for Medicare enrollment in IRMAA). */
export function peopleAge65(scenario: Scenario, year: number): number {
  return alivePeople(scenario, year).filter((p) => {
    const b = parseIsoDate(p.dateOfBirth);
    return b !== null && year - b.year >= 65;
  }).length;
}

/**
 * Household Social Security for `year`, in that year's dollars. After the first
 * death the survivor keeps the larger of their own benefit and the deceased's
 * (if the deceased had started it), a simplification of the survivor benefit rules.
 */
export function socialSecurityForYear(scenario: Scenario, year: number): number {
  const g = Math.pow(1 + scenario.analysis.inflationRate, year - scenario.startYear);
  const benefitIf = (p: Person, y: number) => {
    const b = parseIsoDate(p.dateOfBirth);
    return b && y - b.year >= p.socialSecurityStartAge ? p.socialSecurityBenefit : 0;
  };
  const dy = deathYear(scenario);
  if (dy === null || year <= dy) {
    return scenario.people.reduce((s, p) => s + benefitIf(p, year), 0) * g;
  }
  const survivor = survivorOf(scenario)!;
  const deceased = scenario.people.find((p) => p.id === scenario.survivorship.firstDeathPersonId)!;
  return Math.max(benefitIf(survivor, year), benefitIf(deceased, dy)) * g;
}

/** Share of entered other income that continues in `year`. */
export function otherIncomeFactor(scenario: Scenario, year: number): number {
  const dy = deathYear(scenario);
  return dy !== null && year > dy ? scenario.survivorship.otherIncomeAfter : 1;
}

/** Share of the spending amount that continues in `year`. */
export function spendingFactor(scenario: Scenario, year: number): number {
  const dy = deathYear(scenario);
  return dy !== null && year > dy ? scenario.survivorship.spendingAfter : 1;
}
