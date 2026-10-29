import type { ConversionEntry, Strategy } from '../types';

/** Total QCD requested by a person in a year, from recurring rules and one-time entries. */
export function requestedQcd(
  strategy: Pick<Strategy, 'recurringQcds' | 'oneTimeQcds'>,
  personId: string,
  year: number,
  age: number,
): number {
  let total = 0;
  for (const r of strategy.recurringQcds) {
    if (r.personId === personId && age >= r.startAge && age <= r.endAge) total += r.annualAmount;
  }
  for (const q of strategy.oneTimeQcds) {
    if (q.personId === personId && q.year === year) total += q.amount;
  }
  return total;
}

export function requestedConversion(conversions: readonly ConversionEntry[], personId: string, year: number): number {
  return conversions
    .filter((c) => c.personId === personId && c.year === year)
    .reduce((s, c) => s + c.amount, 0);
}

/**
 * Sets the conversion amount for every year in [startAge, endAge] for one
 * person, replacing existing entries in that range. Pass amount 0 to clear.
 */
export function fillConversionRange(
  conversions: readonly ConversionEntry[],
  personId: string,
  birthYear: number,
  startAge: number,
  endAge: number,
  amount: number,
): ConversionEntry[] {
  const startYear = birthYear + startAge;
  const endYear = birthYear + endAge;
  const kept = conversions.filter((c) => c.personId !== personId || c.year < startYear || c.year > endYear);
  const added: ConversionEntry[] = [];
  if (amount > 0) {
    for (let y = startYear; y <= endYear; y++) added.push({ personId, year: y, amount });
  }
  return [...kept, ...added].sort((a, b) => a.year - b.year);
}

export function setConversionYear(
  conversions: readonly ConversionEntry[],
  personId: string,
  year: number,
  amount: number,
): ConversionEntry[] {
  const kept = conversions.filter((c) => c.personId !== personId || c.year !== year);
  return [...kept, { personId, year, amount }].sort((a, b) => a.year - b.year);
}

export function removeConversionYear(
  conversions: readonly ConversionEntry[],
  personId: string,
  year: number,
): ConversionEntry[] {
  return conversions.filter((c) => c.personId !== personId || c.year !== year);
}

/** Strategy with no levers: the "No strategy" baseline. */
export function emptyStrategy(conversionTaxSource: Strategy['conversionTaxSource'] = 'taxable'): Strategy {
  return { conversions: [], bracketFills: [], conversionTaxSource, recurringQcds: [], oneTimeQcds: [] };
}
