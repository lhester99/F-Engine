import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { parseIsoDate } from '../calculations/dates';
import { MessageList } from '../components/MessageList';
import { fillConversionRange, removeConversionYear, setConversionYear } from '../strategies/schedule';
import type { EngineMessage, ProjectionResult, Scenario } from '../types';
import { formatUsd } from '../utils/format';
import { NumberField } from './NumberField';

interface Props {
  scenario: Scenario;
  update: (fn: (s: Scenario) => Scenario) => void;
  result: ProjectionResult;
  messages: EngineMessage[];
}

export function ConversionPanel({ scenario, update, result, messages }: Props) {
  const person = scenario.people[0]!;
  const birth = parseIsoDate(person.dateOfBirth);
  const currentAge = birth ? scenario.startYear - birth.year : 65;
  const [range, setRange] = useState({ startAge: Math.max(currentAge, 0), endAge: Math.max(currentAge + 4, 0), amount: 50_000 });
  const [rangeError, setRangeError] = useState<string | null>(null);

  const rows = scenario.strategy.conversions.filter((c) => c.personId === person.id);
  const byYear = new Map(result.years.map((y) => [y.year, y]));
  const conversionMessages = messages.filter((m) => m.field === 'conversion');
  const withholdingErr = messages.find((m) => m.field === 'conversionWithholding')?.text;

  const setConversions = (fn: (c: Scenario['strategy']['conversions']) => Scenario['strategy']['conversions']) =>
    update((s) => ({ ...s, strategy: { ...s.strategy, conversions: fn(s.strategy.conversions) } }));

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
    setConversions((c) => fillConversionRange(c, person.id, birth.year, start, end, range.amount));
  };

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="field-label">Fill a range of years</legend>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Start age" kind="integer" min={0} max={120} value={range.startAge} onCommit={(v) => setRange((r) => ({ ...r, startAge: v }))} testId="conv-start" />
          <NumberField label="End age" kind="integer" min={0} max={120} value={range.endAge} onCommit={(v) => setRange((r) => ({ ...r, endAge: v }))} testId="conv-end" />
          <NumberField label="Amount / yr" kind="currency" min={0} value={range.amount} onCommit={(v) => setRange((r) => ({ ...r, amount: v }))} testId="conv-amount" />
        </div>
        {rangeError && <p className="field-error" role="alert">{rangeError}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary flex-1" onClick={applyRange}>
            Apply to range
          </button>
          <button type="button" className="btn" onClick={() => setConversions(() => [])} disabled={rows.length === 0}>
            Clear all
          </button>
        </div>
        <p className="field-hint">Applying replaces any amounts already set for those ages. Enter $0 to clear a range.</p>
      </fieldset>

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

      {rows.length > 0 ? (
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
              {rows.map((c) => {
                const y = byYear.get(c.year);
                const converted = y?.people.find((p) => p.personId === person.id)?.conversionGross;
                const blocked = converted !== undefined && converted + 0.5 < c.amount;
                const age = birth ? c.year - birth.year : null;
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
