import { describe, expect, it } from 'vitest';
import { JOINT_LAST_SURVIVOR_TABLE } from '../../src/data/jointLastSurvivorTable';
import { UNIFORM_LIFETIME_TABLE } from '../../src/data/uniformLifetimeTable';
import { runProjection } from '../../src/calculations/projection';
import { jointLastSurvivorDivisor, lifetimeDistributionPeriod } from '../../src/calculations/rmdRules';
import type { ProjectionResult } from '../../src/types';
import { scenario } from './helpers';

const year = (r: ProjectionResult, y: number) => r.years.find((x) => x.year === y)!;
const NONE = { otherOrdinaryIncome: 0, qualifiedInvestmentIncome: 0, taxExemptInterest: 0, socialSecurityBenefit: 0 };

describe('Joint and Last Survivor Table data (Treas. Reg. §1.401(a)(9)-9(d))', () => {
  it('stores spouse ages 0 through owner − 11 for owners 72–120', () => {
    for (let o = 72; o <= 120; o++) expect(JOINT_LAST_SURVIVOR_TABLE[o]!.length).toBe(o - 10);
  });

  it('spot values from the regulation', () => {
    expect(jointLastSurvivorDivisor(75, 64)).toBe(25.3);
    expect(jointLastSurvivorDivisor(72, 60)).toBe(28.8);
    expect(jointLastSurvivorDivisor(80, 60)).toBe(27.8);
    expect(jointLastSurvivorDivisor(90, 70)).toBe(19.1);
    // Pub. 590-B prints 14.8 here; the regulation (symmetric, smooth with its neighbors) has 14.7.
    expect(jointLastSurvivorDivisor(90, 76)).toBe(14.7);
    // 120 and older use the 120+ row.
    expect(jointLastSurvivorDivisor(125, 60)).toBe(jointLastSurvivorDivisor(120, 60));
  });

  it('falls as either age rises, and is at least the Uniform Lifetime Table', () => {
    for (let o = 72; o <= 120; o++) {
      const row = JOINT_LAST_SURVIVOR_TABLE[o]!;
      for (let s = 1; s < row.length; s++) expect(row[s]!).toBeLessThanOrEqual(row[s - 1]!);
      if (o > 72) {
        const prev = JOINT_LAST_SURVIVOR_TABLE[o - 1]!;
        for (let s = 0; s < prev.length; s++) expect(row[s]!).toBeLessThanOrEqual(prev[s]!);
      }
      expect(row[row.length - 1]!).toBeGreaterThanOrEqual(UNIFORM_LIFETIME_TABLE[o]!);
    }
  });

  it('applies only to a spouse more than 10 years younger', () => {
    expect(lifetimeDistributionPeriod(75, 64)).toEqual({ period: 25.3, table: 'joint' });
    expect(lifetimeDistributionPeriod(75, 65)).toEqual({ period: 24.6, table: 'uniform' });
    expect(lifetimeDistributionPeriod(75, null)).toEqual({ period: 24.6, table: 'uniform' });
    expect(() => jointLastSurvivorDivisor(75, 65)).toThrow();
  });
});

describe('Joint and Last Survivor Table in the projection', () => {
  it('Pub. 590-B example: $100,000, owner 75 and spouse 64 → 25.3 → $3,953', () => {
    const r = runProjection(
      scenario({ dob: '1951-03-01', endAge: 75, traditional: [100_000], analysis: NONE, spouse: { dob: '1962-03-01' } }),
    );
    const p = year(r, 2026).people.find((x) => x.personId === 'p1')!;
    expect(p.distributionTable).toBe('joint');
    expect(p.distributionPeriod).toBe(25.3);
    expect(Math.round(year(r, 2026).totals.requiredRmd)).toBe(3_953);
  });

  it('uses the Uniform Lifetime Table when the spouse is not the sole beneficiary', () => {
    const r = runProjection(
      scenario({
        dob: '1951-03-01',
        endAge: 75,
        traditional: [100_000],
        analysis: NONE,
        spouse: { dob: '1962-03-01' },
        spouseIsSoleBeneficiary: false,
      }),
    );
    expect(year(r, 2026).people.find((x) => x.personId === 'p1')!.distributionTable).toBe('uniform');
    expect(Math.round(year(r, 2026).totals.requiredRmd)).toBe(4_065);
  });

  it('uses the Uniform Lifetime Table for a spouse exactly 10 years younger', () => {
    const r = runProjection(
      scenario({ dob: '1951-03-01', endAge: 75, traditional: [100_000], analysis: NONE, spouse: { dob: '1961-03-01' } }),
    );
    expect(year(r, 2026).people.find((x) => x.personId === 'p1')!.distributionTable).toBe('uniform');
  });

  it('keeps the joint table through the year the younger spouse dies, then switches', () => {
    // Spouse (sole beneficiary) dies at 66 in 2028; the client is still married on January 1, 2028.
    const r = runProjection(
      scenario({
        dob: '1951-03-01',
        endAge: 79,
        traditional: [1_000_000],
        analysis: NONE,
        spouse: { dob: '1962-03-01' },
        survivorship: { enabled: true, firstDeathPersonId: 'p2', deathAge: 66 },
      }),
    );
    const t = (y: number) => year(r, y).people.find((x) => x.personId === 'p1')!;
    expect(t(2028).distributionTable).toBe('joint');
    expect(t(2028).distributionPeriod).toBe(jointLastSurvivorDivisor(77, 66));
    expect(t(2029).distributionTable).toBe('uniform');
    expect(t(2029).distributionPeriod).toBe(UNIFORM_LIFETIME_TABLE[78]);
  });
});
