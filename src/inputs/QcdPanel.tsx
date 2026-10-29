import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { dateAttaining70AndAHalf, formatCalendarDate, parseIsoDate } from '../calculations/dates';
import { qcdLimitForYear } from '../calculations/qcd';
import { MessageList } from '../components/MessageList';
import { LATEST_PUBLISHED_QCD_YEAR } from '../data/qcdLimits';
import type { EngineMessage, OneTimeQcd, RecurringQcdRule, Scenario } from '../types';
import { formatUsd } from '../utils/format';
import { NumberField } from './NumberField';
import { PersonPicker } from './PersonPicker';

interface Props {
  scenario: Scenario;
  update: (fn: (s: Scenario) => Scenario) => void;
  messages: EngineMessage[];
}

let nextId = 1;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${nextId++}`;

export function QcdPanel({ scenario, update, messages }: Props) {
  const [personId, setPersonId] = useState(scenario.people[0]!.id);
  const person = scenario.people.find((p) => p.id === personId) ?? scenario.people[0]!;
  const birth = parseIsoDate(person.dateOfBirth);
  const halfDate = birth ? dateAttaining70AndAHalf(birth) : null;
  const firstEligibleAge = birth && halfDate ? halfDate.year - birth.year : 71;
  const currentAge = birth ? scenario.startYear - birth.year : 70;
  const defaultStart = Math.max(firstEligibleAge, currentAge);
  const { recurringQcds, oneTimeQcds } = scenario.strategy;
  const qcdMessages = messages.filter((m) => m.field === 'qcd' || m.field?.startsWith('qcd:'));

  const setRecurring = (fn: (r: RecurringQcdRule[]) => RecurringQcdRule[]) =>
    update((s) => ({ ...s, strategy: { ...s.strategy, recurringQcds: fn(s.strategy.recurringQcds) } }));
  const setOneTime = (fn: (r: OneTimeQcd[]) => OneTimeQcd[]) =>
    update((s) => ({ ...s, strategy: { ...s.strategy, oneTimeQcds: fn(s.strategy.oneTimeQcds) } }));

  return (
    <div className="space-y-4">
      <PersonPicker people={scenario.people} value={person.id} onChange={setPersonId} label="QCDs from" />
      <p className="text-xs text-ink-2">
        {halfDate ? <>Eligible from age 70½ ({formatCalendarDate(halfDate)}). </> : null}
        Limit {formatUsd(qcdLimitForYear(scenario.qcdLimits, scenario.startYear))} per person in {scenario.startYear}. QCDs count
        toward the RMD first and are excluded from taxable distributions; they do not reduce the required amount.
      </p>

      <fieldset className="space-y-2">
        <legend className="field-label">Recurring QCDs</legend>
        {recurringQcds.map((q, i) => (
          <div key={q.id} className="flex items-end gap-2">
            <div className="grid flex-1 grid-cols-3 gap-2">
              <NumberField label="Per year" kind="currency" min={0} value={q.annualAmount} testId={`qcd-rec-amount-${i}`}
                onCommit={(v) => setRecurring((rs) => rs.map((r) => (r.id === q.id ? { ...r, annualAmount: v } : r)))} />
              <NumberField label="From age" kind="integer" min={0} max={120} value={q.startAge} testId={`qcd-rec-start-${i}`}
                onCommit={(v) => setRecurring((rs) => rs.map((r) => (r.id === q.id ? { ...r, startAge: v } : r)))} />
              <NumberField label="Through age" kind="integer" min={0} max={120} value={q.endAge} testId={`qcd-rec-end-${i}`}
                onCommit={(v) => setRecurring((rs) => rs.map((r) => (r.id === q.id ? { ...r, endAge: v } : r)))} />
            </div>
            <button type="button" className="btn-icon mb-0.5" aria-label={`Remove recurring QCD ${i + 1}`}
              onClick={() => setRecurring((rs) => rs.filter((r) => r.id !== q.id))}>
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button type="button" className="btn w-full"
          onClick={() => setRecurring((rs) => [...rs, { id: newId('qr'), personId: person.id, annualAmount: 20_000, startAge: defaultStart, endAge: scenario.endAge }])}>
          <Plus aria-hidden className="h-4 w-4" /> Add recurring QCD
        </button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="field-label">One-time QCDs</legend>
        {oneTimeQcds.map((q, i) => {
          const age = birth ? q.year - birth.year : q.year;
          return (
            <div key={q.id} className="flex items-end gap-2">
              <div className="grid flex-1 grid-cols-2 gap-2">
                <NumberField label="At age" kind="integer" min={0} max={120} value={age} testId={`qcd-one-age-${i}`}
                  onCommit={(v) => birth && setOneTime((os) => os.map((o) => (o.id === q.id ? { ...o, year: birth.year + v } : o)))} />
                <NumberField label="Amount" kind="currency" min={0} value={q.amount} testId={`qcd-one-amount-${i}`}
                  onCommit={(v) => setOneTime((os) => os.map((o) => (o.id === q.id ? { ...o, amount: v } : o)))} />
              </div>
              <button type="button" className="btn-icon mb-0.5" aria-label={`Remove one-time QCD ${i + 1}`}
                onClick={() => setOneTime((os) => os.filter((o) => o.id !== q.id))}>
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        <button type="button" className="btn w-full" disabled={!birth}
          onClick={() => birth && setOneTime((os) => [...os, { id: newId('qo'), personId: person.id, year: birth.year + defaultStart, amount: 25_000 }])}>
          <Plus aria-hidden className="h-4 w-4" /> Add one-time QCD
        </button>
      </fieldset>

      <NumberField
        label={`Assumed QCD limit after ${LATEST_PUBLISHED_QCD_YEAR}`}
        kind="currency"
        min={0}
        value={scenario.qcdLimits.assumedFutureLimit}
        onCommit={(v) => update((s) => ({ ...s, qcdLimits: { ...s.qcdLimits, assumedFutureLimit: v } }))}
        hint={`The limit is indexed for inflation. Default holds the ${LATEST_PUBLISHED_QCD_YEAR} limit flat.`}
        testId="qcd-future-limit"
      />
      <MessageList messages={qcdMessages} max={6} testId="qcd-messages" />
    </div>
  );
}
