import { describe, expect, it } from 'vitest';
import { buildRmdRows, conversionsBy, convertersPresent } from '../../src/charts/RmdChart';
import { runProjection } from '../../src/calculations/projection';
import { scenario } from './helpers';

describe('conversion markers: who converted each year', () => {
  // Client born 1956 converts at 70–71; spouse (p2, born 1958) converts at 68 and 69 (2026, 2027).
  const s = scenario({
    dob: '1956-03-01',
    endAge: 75,
    traditional: [1_000_000],
    spouse: { dob: '1958-03-01', traditional: 500_000 },
    strategy: {
      conversions: [
        { personId: 'p1', year: 2026, amount: 40_000 },
        { personId: 'p2', year: 2026, amount: 25_000 },
        { personId: 'p1', year: 2027, amount: 40_000 },
        { personId: 'p2', year: 2028, amount: 25_000 },
      ],
    },
  });
  const r = runProjection(s);
  const year = (y: number) => r.years.find((x) => x.year === y)!;

  it('labels each year client, spouse, or both, with each person’s amount', () => {
    expect(conversionsBy(year(2026), 'p1')).toEqual({ client: 40_000, spouse: 25_000, converter: 'both' });
    expect(conversionsBy(year(2027), 'p1')).toEqual({ client: 40_000, spouse: 0, converter: 'client' });
    expect(conversionsBy(year(2028), 'p1')).toEqual({ client: 0, spouse: 25_000, converter: 'spouse' });
    expect(conversionsBy(year(2029), 'p1').converter).toBeNull();
  });

  it('feeds the chart rows and the legend', () => {
    const rows = buildRmdRows(r.years, r.years, 'required', 'age', 'p1');
    expect(rows.find((x) => x.year === 2026)).toMatchObject({ converter: 'both', conversion: 65_000, clientConversion: 40_000, spouseConversion: 25_000 });
    expect(rows.find((x) => x.year === 2029)).toMatchObject({ converter: null, conversion: null });
    expect(convertersPresent(r.years, 'p1')).toEqual(['client', 'spouse', 'both']);
  });
});
