import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { DEFAULT_SURVIVOR_SHARE, INCOME_KIND_LABELS } from '../calculations/income';
import { parseIsoDate } from '../calculations/dates';
import { MessageList } from '../components/MessageList';
import type { EngineMessage, IncomeItem, IncomeKind, Person, Scenario } from '../types';
import { NumberField } from './NumberField';

interface Props {
  scenario: Scenario;
  update: (fn: (s: Scenario) => Scenario) => void;
  messages: EngineMessage[];
}

const KINDS = Object.keys(INCOME_KIND_LABELS) as IncomeKind[];

/** The calendar year a person reaches an age (shown beside each age). */
function yearAt(person: Person | undefined, age: number | null): number | null {
  const b = person ? parseIsoDate(person.dateOfBirth) : null;
  return b && age !== null ? b.year + age : null;
}

/** A whole-number age that may be left blank (blank means "already started" or "for life"). */
function OptionalAgeField({
  label,
  value,
  blankText,
  owner,
  onCommit,
  testId,
}: {
  label: string;
  value: number | null;
  blankText: string;
  owner: Person | undefined;
  onCommit: (v: number | null) => void;
  testId: string;
}) {
  const id = useId();
  const [text, setText] = useState(value === null ? '' : String(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const year = yearAt(owner, value);
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className={`field-input ${error ? 'field-input-error' : ''}`}
        value={text}
        placeholder={blankText}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || year !== null ? `${id}-hint` : undefined}
        data-testid={testId}
        onChange={(e) => {
          const t = e.target.value.trim();
          setText(e.target.value);
          if (t === '') {
            setError(null);
            onCommit(null);
          } else if (/^\d{1,3}$/.test(t) && Number(t) <= 120) {
            setError(null);
            onCommit(Number(t));
          } else {
            setError('Enter an age from 0 to 120, or leave blank.');
          }
        }}
      />
      {(error || year !== null) && (
        <p id={`${id}-hint`} className={error ? 'field-error' : 'field-hint'}>
          {error ?? `In ${year}`}
        </p>
      )}
    </div>
  );
}

/**
 * Income timeline: each person's Social Security, and wages, pensions,
 * annuities, rental income, interest, and other income, each with its own
 * start and end age. Feeds every year's tax estimate.
 */
export function IncomeTimelinePanel({ scenario, update, messages }: Props) {
  const items = scenario.incomeItems ?? [];
  const people = scenario.people;
  const hasSpouse = people.length > 1;
  const personLabel = (id: string) => people.find((p) => p.id === id)?.label ?? 'Client';
  const setItem = (id: string, patch: Partial<IncomeItem>) =>
    update((s) => ({ ...s, incomeItems: (s.incomeItems ?? []).map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const removeItem = (id: string) => update((s) => ({ ...s, incomeItems: (s.incomeItems ?? []).filter((i) => i.id !== id) }));
  const addItem = () =>
    update((s) => {
      const list = s.incomeItems ?? [];
      let n = list.length + 1;
      while (list.some((i) => i.id === `income-${n}`)) n++;
      const item: IncomeItem = {
        id: `income-${n}`,
        kind: 'wages',
        ownerId: s.people[0]!.id,
        amount: 0,
        startAge: null,
        endAge: null,
        growsWithInflation: true,
        survivorShare: DEFAULT_SURVIVOR_SHARE.wages,
      };
      return { ...s, incomeItems: [...list, item] };
    });
  const setPerson = (id: string, patch: Partial<Person>) =>
    update((s) => ({ ...s, people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const ssError = (p: Person) =>
    messages.find((m) => m.severity === 'error' && m.field === 'socialSecurityBenefit' && m.personId === p.id)?.text;

  return (
    <div className="space-y-3" data-testid="income-timeline">
      {people.map((p, idx) => {
        const client = idx === 0;
        const startYear = yearAt(p, p.socialSecurityStartAge);
        return (
          <div key={p.id} className="grid grid-cols-2 gap-2">
            <NumberField
              label={client ? 'Client Social Security / yr' : 'Spouse Social Security / yr'}
              kind="currency"
              min={0}
              value={p.socialSecurityBenefit}
              externalError={ssError(p)}
              onCommit={(v) => setPerson(p.id, { socialSecurityBenefit: v })}
              testId={client ? 'ss-benefit' : 'spouse-ss'}
            />
            <NumberField
              label={client ? 'Starting at age' : 'Spouse starting at age'}
              kind="integer"
              min={0}
              max={120}
              value={p.socialSecurityStartAge}
              onCommit={(v) => setPerson(p.id, { socialSecurityStartAge: v })}
              hint={startYear !== null ? `In ${startYear}` : undefined}
              testId={client ? 'ss-age' : 'spouse-ss-age'}
            />
          </div>
        );
      })}
      <p className="field-hint -mt-1">Social Security: before tax, in today's dollars; the taxable share is calculated each year.</p>

      <ul className="space-y-2" aria-label="Other income">
        {items.map((item, i) => {
          const owner = people.find((p) => p.id === item.ownerId);
          const typeId = `income-kind-${item.id}`;
          const ownerId = `income-owner-${item.id}`;
          const name = `${hasSpouse ? `${personLabel(item.ownerId)} ` : ''}${INCOME_KIND_LABELS[item.kind].toLowerCase()}`;
          return (
            <li key={item.id} className="space-y-2 rounded-md border border-line-soft p-2.5" data-testid={`income-item-${i}`}>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={typeId} className="field-label">
                    Type
                  </label>
                  <select
                    id={typeId}
                    className="field-input"
                    value={item.kind}
                    onChange={(e) => {
                      const kind = e.target.value as IncomeKind;
                      setItem(item.id, { kind, survivorShare: DEFAULT_SURVIVOR_SHARE[kind] });
                    }}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {INCOME_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" className="btn-icon mb-0.5" aria-label={`Remove ${name}`} onClick={() => removeItem(item.id)}>
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {hasSpouse && (
                  <div>
                    <label htmlFor={ownerId} className="field-label">
                      Whose
                    </label>
                    <select id={ownerId} className="field-input" value={item.ownerId} onChange={(e) => setItem(item.id, { ownerId: e.target.value })}>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <NumberField
                  className={hasSpouse ? '' : 'col-span-2'}
                  label="Amount / yr"
                  kind="currency"
                  min={0}
                  value={item.amount}
                  onCommit={(v) => setItem(item.id, { amount: v })}
                  testId={`income-amount-${i}`}
                />
                <OptionalAgeField
                  label={`From age${hasSpouse ? ` (${personLabel(item.ownerId).toLowerCase()})` : ''}`}
                  value={item.startAge}
                  blankText="Already started"
                  owner={owner}
                  onCommit={(v) => setItem(item.id, { startAge: v })}
                  testId={`income-start-${i}`}
                />
                <OptionalAgeField
                  label="Through age"
                  value={item.endAge}
                  blankText="For life"
                  owner={owner}
                  onCommit={(v) => setItem(item.id, { endAge: v })}
                  testId={`income-end-${i}`}
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-accent"
                  checked={item.growsWithInflation}
                  onChange={(e) => setItem(item.id, { growsWithInflation: e.target.checked })}
                />
                <span>
                  Grows with inflation
                  <span className="block text-xs text-muted">
                    {item.growsWithInflation ? 'Amount is in today’s dollars.' : 'The same dollar amount every year (for example, a pension without a cost-of-living raise).'}
                  </span>
                </span>
              </label>
              {hasSpouse && (
                <NumberField
                  label="Continues for the survivor"
                  kind="percent"
                  min={0}
                  max={100}
                  value={item.survivorShare}
                  onCommit={(v) => setItem(item.id, { survivorShare: v })}
                  hint={`Share paid after the ${personLabel(item.ownerId).toLowerCase()}’s death (used when the first death is modeled).`}
                  testId={`income-survivor-${i}`}
                />
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn w-full" onClick={addItem}>
        <Plus aria-hidden className="h-4 w-4" /> Add income
      </button>
      <p className="field-hint">
        Wages, pensions, annuities, rental income, interest, or other taxable income, each with its own start and end age.
        Ages are the owner’s; leave blank for income already being received, or that lasts for life.
      </p>
      <MessageList messages={messages.filter((m) => m.field === 'incomeItems' && m.severity === 'error')} />
    </div>
  );
}
