import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { getRmdStart } from '../calculations/rmdRules';
import { parseIsoDate, ageAttainedInYear } from '../calculations/dates';
import { MessageList } from '../components/MessageList';
import type { Account, EngineMessage, Scenario } from '../types';
import { NumberField } from './NumberField';

interface Props {
  scenario: Scenario;
  update: (fn: (s: Scenario) => Scenario) => void;
  messages: EngineMessage[];
}

const fieldError = (messages: EngineMessage[], field: string) =>
  messages.find((m) => m.severity === 'error' && m.field === field)?.text;

export function ClientPanel({ scenario, update, messages }: Props) {
  const dobId = useId();
  const person = scenario.people[0]!;
  const birth = parseIsoDate(person.dateOfBirth);
  const rmdStart = birth ? getRmdStart(birth) : null;
  const priorYear = scenario.startYear - 1;
  const mine = (a: Account) => a.ownerId === person.id;
  const traditional = scenario.accounts.filter((a) => mine(a) && a.type === 'traditional_ira');
  const roth = scenario.accounts.find((a) => mine(a) && a.type === 'roth_ira');
  const firstTrad = traditional[0];
  const tradContribution = firstTrad?.contribution ?? { annualAmount: 0, throughAge: 72, deductible: true };
  const extra = scenario.extraWithdrawals[0];
  const dobError = fieldError(messages, 'dateOfBirth');
  const deferralNotes = messages.filter((m) => m.field === 'delayFirstRmd');
  const deferralAvailable = rmdStart !== null && rmdStart.firstRmdYear >= scenario.startYear;

  const setAccount = (id: string, patch: Partial<Account>) =>
    update((s) => ({ ...s, accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));

  const addTraditional = () =>
    update((s) => {
      const n = s.accounts.filter((a) => mine(a) && a.type === 'traditional_ira').length + 1;
      let i = n;
      while (s.accounts.some((a) => a.id === `trad-${i}`)) i++;
      const acct: Account = {
        id: `trad-${i}`,
        ownerId: person.id,
        type: 'traditional_ira',
        label: `Traditional IRA ${n}`,
        priorYearEndBalance: 0,
      };
      const rothIdx = s.accounts.findIndex((a) => mine(a) && a.type === 'roth_ira');
      const accounts = [...s.accounts];
      accounts.splice(rothIdx === -1 ? accounts.length : rothIdx, 0, acct);
      return { ...s, accounts };
    });

  const removeTraditional = (id: string) =>
    update((s) => {
      let n = 0;
      return {
        ...s,
        accounts: s.accounts
          .filter((a) => a.id !== id)
          .map((a) => (mine(a) && a.type === 'traditional_ira' ? { ...a, label: `Traditional IRA ${++n}` } : a)),
      };
    });

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={dobId} className="field-label">
          Date of birth
        </label>
        <input
          id={dobId}
          type="date"
          className={`field-input ${dobError ? 'field-input-error' : ''}`}
          value={person.dateOfBirth}
          min="1900-01-01"
          max={`${scenario.startYear - 1}-12-31`}
          aria-invalid={dobError ? true : undefined}
          aria-describedby={`${dobId}-note`}
          onChange={(e) => {
            const v = e.target.value;
            update((s) => ({ ...s, people: s.people.map((p, i) => (i === 0 ? { ...p, dateOfBirth: v } : p)) }));
          }}
        />
        <p id={`${dobId}-note`} className={dobError ? 'field-error' : 'field-hint'} role={dobError ? 'alert' : undefined}>
          {dobError ??
            (rmdStart && birth
              ? `Age ${ageAttainedInYear(birth, scenario.startYear)} in ${scenario.startYear}. RMDs begin at ${rmdStart.applicableAge === 70.5 ? '70½' : rmdStart.applicableAge} (${rmdStart.firstRmdYear}).`
              : 'Used only to determine RMD age; not stored.')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Client Social Security / yr"
          kind="currency"
          min={0}
          value={person.socialSecurityBenefit}
          externalError={messages.find((m) => m.severity === 'error' && m.field === 'socialSecurityBenefit' && m.personId === person.id)?.text}
          onCommit={(v) => update((s) => ({ ...s, people: s.people.map((p, i) => (i === 0 ? { ...p, socialSecurityBenefit: v } : p)) }))}
          testId="ss-benefit"
        />
        <NumberField
          label="Starting at age"
          kind="integer"
          min={0}
          max={120}
          value={person.socialSecurityStartAge}
          onCommit={(v) => update((s) => ({ ...s, people: s.people.map((p, i) => (i === 0 ? { ...p, socialSecurityStartAge: v } : p)) }))}
          testId="ss-age"
        />
      </div>
      <p className="field-hint -mt-1">Before tax, in today's dollars. The taxable share is calculated each year.</p>

      <NumberField
        label="Projection ending age (client's age)"
        kind="integer"
        value={scenario.endAge}
        min={1}
        max={120}
        externalError={fieldError(messages, 'endAge')}
        onCommit={(v) => update((s) => ({ ...s, endAge: v }))}
        testId="end-age"
      />

      <fieldset className="space-y-2">
        <legend className="field-label">Traditional IRAs (balances as of December 31, {priorYear})</legend>
        {traditional.map((a) => (
          <div key={a.id} className="flex items-end gap-2">
            <NumberField
              className="flex-1"
              label={`${a.label} — prior December 31 balance`}
              kind="currency"
              min={0}
              value={a.priorYearEndBalance}
              onCommit={(v) => setAccount(a.id, { priorYearEndBalance: v })}
              testId={`balance-${a.id}`}
            />
            <button
              type="button"
              className="btn-icon mb-0.5"
              aria-label={`Remove ${a.label}`}
              disabled={traditional.length <= 1}
              onClick={() => removeTraditional(a.id)}
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button type="button" className="btn w-full" onClick={addTraditional}>
          <Plus aria-hidden className="h-4 w-4" /> Add Traditional IRA
        </button>
      </fieldset>

      {firstTrad && (
        <fieldset className="space-y-2">
          <legend className="field-label">Pre-tax contributions to {firstTrad.label}</legend>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Annual pre-tax contribution"
              kind="currency"
              min={0}
              value={tradContribution.annualAmount}
              onCommit={(v) => setAccount(firstTrad.id, { contribution: { ...tradContribution, annualAmount: v } })}
              testId="trad-contribution"
            />
            <NumberField
              label="Pre-tax contributions through age"
              kind="integer"
              min={0}
              max={120}
              value={tradContribution.throughAge}
              onCommit={(v) => setAccount(firstTrad.id, { contribution: { ...tradContribution, throughAge: v } })}
              testId="trad-contribution-age"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={tradContribution.deductible !== false}
              onChange={(e) => setAccount(firstTrad.id, { contribution: { ...tradContribution, deductible: e.target.checked } })}
            />
            Contributions are tax-deductible
          </label>
          <p className="field-hint">
            Added after the year's RMD, so they raise next year's RMD. Deductible contributions after age 70½ make an equal
            amount of later QCDs taxable. Deductibility and contribution limits are not checked.
          </p>
        </fieldset>
      )}

      {roth && (
        <fieldset className="space-y-2">
          <legend className="sr-only">Roth IRA</legend>
          <NumberField
            label="Roth IRA — prior December 31 balance"
            kind="currency"
            min={0}
            value={roth.priorYearEndBalance}
            onCommit={(v) => setAccount(roth.id, { priorYearEndBalance: v })}
            testId="balance-roth"
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Annual Roth contribution"
              kind="currency"
              min={0}
              value={roth.contribution?.annualAmount ?? 0}
              onCommit={(v) =>
                setAccount(roth.id, { contribution: { throughAge: roth.contribution?.throughAge ?? 75, annualAmount: v } })
              }
              testId="roth-contribution"
            />
            <NumberField
              label="Contribute through age"
              kind="integer"
              min={0}
              max={120}
              value={roth.contribution?.throughAge ?? 75}
              onCommit={(v) =>
                setAccount(roth.id, { contribution: { annualAmount: roth.contribution?.annualAmount ?? 0, throughAge: v } })
              }
              testId="roth-contribution-age"
            />
          </div>
          <p className="field-hint">Contribution limits and earned-income rules are not enforced.</p>
        </fieldset>
      )}

      {extra && (
        <fieldset className="space-y-2">
          <legend className="field-label">Extra pre-tax withdrawals (beyond the RMD)</legend>
          <div className="grid grid-cols-3 gap-2">
            <NumberField
              label="Per year"
              kind="currency"
              min={0}
              value={extra.annualAmount}
              onCommit={(v) => update((s) => ({ ...s, extraWithdrawals: [{ ...extra, annualAmount: v }] }))}
              testId="extra-amount"
            />
            <NumberField
              label="From age"
              kind="integer"
              min={0}
              max={120}
              value={extra.startAge}
              onCommit={(v) => update((s) => ({ ...s, extraWithdrawals: [{ ...extra, startAge: v }] }))}
              testId="extra-start"
            />
            <NumberField
              label="Through age"
              kind="integer"
              min={0}
              max={120}
              value={extra.endAge}
              onCommit={(v) => update((s) => ({ ...s, extraWithdrawals: [{ ...extra, endAge: v }] }))}
              testId="extra-end"
            />
          </div>
          <MessageList messages={messages.filter((m) => m.field === 'extraWithdrawals' && m.severity === 'error')} />
        </fieldset>
      )}

      <div>
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-accent"
            checked={person.delayFirstRmd}
            disabled={!deferralAvailable && !person.delayFirstRmd}
            onChange={(e) => {
              const v = e.target.checked;
              update((s) => ({ ...s, people: s.people.map((p, i) => (i === 0 ? { ...p, delayFirstRmd: v } : p)) }));
            }}
          />
          <span>
            Delay first RMD to April 1 of the following year
            <span className="block text-xs text-muted">
              {rmdStart
                ? deferralAvailable
                  ? `The ${rmdStart.firstRmdYear} RMD would be taken by April 1, ${rmdStart.firstRmdYear + 1}, so two RMDs fall in ${rmdStart.firstRmdYear + 1}.`
                  : `Not available: the first RMD year (${rmdStart.firstRmdYear}) is before ${scenario.startYear}.`
                : 'Enter a valid date of birth.'}
            </span>
          </span>
        </label>
        <MessageList messages={deferralNotes} />
      </div>
    </div>
  );
}
