import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { parseIsoDate } from '../calculations/dates';
import { MessageList } from '../components/MessageList';
import { BRACKET_RATES } from '../calculations/validate';
import { fillConversionRange, removeConversionYear, setConversionYear } from '../strategies/schedule';
import type { BracketFillRule, EngineMessage, ProjectionResult, Scenario } from '../types';
import { formatUsd } from '../utils/format';
import { NumberField } from './NumberField';

interface Props {
  scenario: Scenario;
  update: (fn: (s: Scenario) => Scenario) => void;
  result: ProjectionResult;
  messages: EngineMessage[];
}

let ruleCounter = 0;

const irmaaLimitLabel = (t: number | null) =>
  t === null ? 'no IRMAA limit' : t === 0 ? 'no IRMAA surcharge' : `IRMAA tier ${t} or lower`;

export function ConversionPanel({ scenario, update, result, messages }: Props) {
  const person = scenario.people[0]!;
  const birth = parseIsoDate(person.dateOfBirth);
  const currentAge = birth ? scenario.startYear - birth.year : 65;
  const [range, setRange] = useState({ startAge: Math.max(currentAge, 0), endAge: Math.max(currentAge + 4, 0), amount: 50_000 });
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [mode, setMode] = useState<'fixed' | 'fill'>('fixed');
  const [fillRate, setFillRate] = useState(0.24);
  const [irmaaMax, setIrmaaMax] = useState<number | null>(null);
  const fills = scenario.strategy.bracketFills.filter((f) => f.personId === person.id);

  const rows = scenario.strategy.conversions.filter((c) => c.personId === person.id);
  const byYear = new Map(result.years.map((y) => [y.year, y]));
  const conversionMessages = messages.filter((m) => m.field === 'conversion');
  const withholdingErr = messages.find((m) => m.field === 'conversionWithholding')?.text;

  const setConversions = (fn: (c: Scenario['strategy']['conversions']) => Scenario['strategy']['conversions']) =>
    update((s) => ({ ...s, strategy: { ...s.strategy, conversions: fn(s.strategy.conversions) } }));

  const setFills = (fn: (f: BracketFillRule[]) => BracketFillRule[]) =>
    update((s) => ({ ...s, strategy: { ...s.strategy, bracketFills: fn(s.strategy.bracketFills) } }));

  const applyRange = () => {
    if (!birth) return setRangeError('Enter a valid date of birth first.');
    if (range.startAge > range.endAge) return setRangeError('Start age must be on or before end age.');
    const lastAge = scenario.endAge;
    if (range.endAge < currentAge || range.startAge > lastAge) {
      return setRangeError(`Ages must fall within the projection (${currentAge}–${lastAge}).`);
    }
    setRangeError(null);
    const start = Math.max(range.startAge, currentAge);
    const end = Math.min(range.endAge, lastAge);
    if (mode === 'fixed') {
      setConversions((c) => fillConversionRange(c, person.id, birth.year, start, end, range.amount));
      // A fixed amount replaces any fill rule for these ages.
      setFills((fs) => fs.filter((f) => f.personId !== person.id || f.endAge < start || f.startAge > end));
      return;
    }
    // A fill rule replaces fixed amounts and other rules for these ages.
    setConversions((c) => fillConversionRange(c, person.id, birth.year, start, end, 0));
    setFills((fs) => [
      ...fs.filter((f) => f.personId !== person.id || f.endAge < start || f.startAge > end),
      { id: `fill-${++ruleCounter}`, personId: person.id, startAge: start, endAge: end, bracketRate: fillRate, irmaaMaxTier: irmaaMax },
    ]);
  };

  // Every year with a conversion, fixed or from a rule, in age order.
  const fillYears = result.years
    .map((y) => ({ y, p: y.people.find((pp) => pp.personId === person.id) }))
    .filter((x) => x.p?.conversionMethod === 'fill');
  const tableYears = [...new Set([...rows.map((r) => r.year), ...fillYears.map((x) => x.y.year)])].sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="field-label">Set conversions for a range of ages</legend>
        <div className="seg w-full" role="group" aria-label="Conversion method">
          <button type="button" className="seg-btn flex-1" aria-pressed={mode === 'fixed'} onClick={() => setMode('fixed')}>
            Fixed amount
          </button>
          <button type="button" className="seg-btn flex-1" aria-pressed={mode === 'fill'} onClick={() => setMode('fill')}>
            Fill to a bracket
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Start age" kind="integer" min={0} max={120} value={range.startAge} onCommit={(v) => setRange((r) => ({ ...r, startAge: v }))} testId="conv-start" />
          <NumberField label="End age" kind="integer" min={0} max={120} value={range.endAge} onCommit={(v) => setRange((r) => ({ ...r, endAge: v }))} testId="conv-end" />
          {mode === 'fixed' ? (
            <NumberField label="Amount / yr" kind="currency" min={0} value={range.amount} onCommit={(v) => setRange((r) => ({ ...r, amount: v }))} testId="conv-amount" />
          ) : (
            <div>
              <label htmlFor="fill-rate" className="field-label">Fill to top of</label>
              <select id="fill-rate" className="field-input" value={fillRate} onChange={(e) => setFillRate(Number(e.target.value))}>
                {BRACKET_RATES.map((r) => (
                  <option key={r} value={r}>
                    {Math.round(r * 100)}% bracket
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {mode === 'fill' && (
          <div>
            <label htmlFor="fill-irmaa" className="field-label">Also stay within</label>
            <select
              id="fill-irmaa"
              className="field-input"
              value={irmaaMax === null ? 'none' : String(irmaaMax)}
              onChange={(e) => setIrmaaMax(e.target.value === 'none' ? null : Number(e.target.value))}
            >
              <option value="none">No IRMAA limit</option>
              <option value="0">No IRMAA surcharge</option>
              {[1, 2, 3, 4].map((t) => (
                <option key={t} value={t}>
                  IRMAA tier {t} or lower
                </option>
              ))}
            </select>
            <p className="field-hint">
              Each year converts as much as fits, given that year's other income. Amounts update automatically when inputs change.
            </p>
          </div>
        )}
        {rangeError && <p className="field-error" role="alert">{rangeError}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary flex-1" onClick={applyRange}>
            Apply to range
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setConversions(() => []);
              setFills(() => []);
            }}
            disabled={rows.length === 0 && fills.length === 0}
          >
            Clear all
          </button>
        </div>
        <p className="field-hint">Applying replaces whatever was set for those ages. A fixed $0 clears a range.</p>
      </fieldset>

      {fills.length > 0 && (
        <ul className="space-y-1.5" data-testid="fill-rules">
          {fills.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink-2">
              <span>
                <span className="font-semibold text-ink">Fill to {Math.round(f.bracketRate * 100)}%</span>, ages {f.startAge}–{f.endAge},{' '}
                {irmaaLimitLabel(f.irmaaMaxTier)}
              </span>
              <button
                type="button"
                className="btn-icon h-7 w-7"
                aria-label={`Remove fill to ${Math.round(f.bracketRate * 100)}% rule, ages ${f.startAge}–${f.endAge}`}
                onClick={() => setFills((fs) => fs.filter((x) => x.id !== f.id))}
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <NumberField
        label="Tax withholding on conversions"
        kind="percent"
        min={0}
        max={100}
        value={scenario.strategy.conversionWithholdingRate}
        externalError={withholdingErr}
        onCommit={(v) => update((s) => ({ ...s, strategy: { ...s.strategy, conversionWithholdingRate: v } }))}
        hint="Withheld amounts leave the IRA but are not deposited to the Roth IRA."
        testId="conv-withholding"
      />

      {tableYears.length > 0 ? (
        <div className="max-h-72 overflow-y-auto rounded-md border border-line">
          <table className="w-full text-sm" data-testid="conversion-table">
            <caption className="sr-only">Roth conversion schedule</caption>
            <thead className="sticky top-0 bg-canvas text-xs text-muted">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">Age (year)</th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">Requested</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">Converted</th>
                <th scope="col" className="w-9 px-1 py-1.5"><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody>
              {tableYears.map((year) => {
                const c = rows.find((r) => r.year === year);
                const y = byYear.get(year);
                const py = y?.people.find((p) => p.personId === person.id);
                const converted = py?.conversionGross;
                const age = birth ? year - birth.year : null;
                if (!c) {
                  const rule = fills.find((f) => age !== null && age >= f.startAge && age <= f.endAge);
                  return (
                    <tr key={year} className="border-t border-line-soft">
                      <th scope="row" className="px-2 py-1 text-left font-normal whitespace-nowrap text-ink-2">
                        {age} <span className="text-xs text-muted">({year})</span>
                      </th>
                      <td className="px-2 py-1 text-xs text-ink-2">Fill to {rule ? Math.round(rule.bracketRate * 100) : ''}%</td>
                      <td className="px-2 py-1 text-right tabular-nums text-ink">{converted === undefined ? '—' : formatUsd(converted)}</td>
                      <td className="px-1 py-1" />
                    </tr>
                  );
                }
                const blocked = converted !== undefined && converted + 0.5 < c.amount;
                return (
                  <tr key={c.year} className="border-t border-line-soft">
                    <th scope="row" className="px-2 py-1 text-left font-normal whitespace-nowrap text-ink-2">
                      {age} <span className="text-xs text-muted">({c.year})</span>
                    </th>
                    <td className="px-2 py-1">
                      <NumberField
                        label={`Conversion amount for age ${age} (${c.year})`}
                        srOnlyLabel
                        kind="currency"
                        min={0}
                        value={c.amount}
                        onCommit={(v) => setConversions((cs) => setConversionYear(cs, person.id, c.year, v))}
                      />
                    </td>
                    <td className={`px-2 py-1 text-right tabular-nums ${blocked ? 'font-semibold text-error' : 'text-ink-2'}`}>
                      {converted === undefined ? '—' : formatUsd(converted)}
                      {blocked && <span className="block text-[11px] font-medium">Limited</span>}
                    </td>
                    <td className="px-1 py-1 text-right">
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={`Delete conversion for age ${age} (${c.year})`}
                        onClick={() => setConversions((cs) => removeConversionYear(cs, person.id, c.year))}
                      >
                        <Trash2 aria-hidden className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted">No conversions scheduled.</p>
      )}
      <MessageList messages={conversionMessages} max={6} testId="conversion-messages" />
      <p className="field-hint">
        In RMD years the RMD is always satisfied first; a conversion can never be used to satisfy an RMD. Conversions are
        taken pro rata from the Traditional IRAs.
      </p>
    </div>
  );
}
