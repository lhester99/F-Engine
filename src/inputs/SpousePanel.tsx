import { Plus, Trash2, UserPlus } from 'lucide-react';
import { useId } from 'react';
import { ageAttainedInYear, parseIsoDate } from '../calculations/dates';
import { getRmdStart } from '../calculations/rmdRules';
import { MessageList } from '../components/MessageList';
import type { Account, EngineMessage, Person, Scenario, SurvivorshipSettings } from '../types';
import { defaultSpouse, SPOUSE_ID } from '../utils/defaultScenario';
import { NumberField } from './NumberField';

interface Props {
  scenario: Scenario;
  update: (fn: (s: Scenario) => Scenario) => void;
  messages: EngineMessage[];
}

/** Adds or removes a spouse; the spouse's own IRAs and Social Security; and the first-death settings. */
export function SpousePanel({ scenario, update, messages }: Props) {
  const dobId = useId();
  const spouse = scenario.people[1];

  if (!spouse) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-ink-2">Add a spouse to file jointly, model each spouse’s IRAs and RMDs, and show what changes for the survivor.</p>
        <button
          type="button"
          className="btn w-full"
          onClick={() =>
            update((s) => {
              const { person, accounts } = defaultSpouse(s.people[0]!.dateOfBirth);
              return { ...s, people: [s.people[0]!, person], accounts: [...s.accounts, ...accounts] };
            })
          }
        >
          <UserPlus aria-hidden className="h-4 w-4" /> Add spouse
        </button>
      </div>
    );
  }

  const birth = parseIsoDate(spouse.dateOfBirth);
  const rmdStart = birth ? getRmdStart(birth) : null;
  const priorYear = scenario.startYear - 1;
  const mine = (a: Account) => a.ownerId === spouse.id;
  const traditional = scenario.accounts.filter((a) => mine(a) && a.type === 'traditional_ira');
  const roth = scenario.accounts.find((a) => mine(a) && a.type === 'roth_ira');
  const err = (field: string) => messages.find((m) => m.severity === 'error' && m.field === field && (m.personId ?? spouse.id) === spouse.id)?.text;
  const dobErr = err('dateOfBirth');
  const sv = scenario.survivorship;

  const setSpouse = (patch: Partial<Person>) =>
    update((s) => ({ ...s, people: s.people.map((p) => (p.id === spouse.id ? { ...p, ...patch } : p)) }));
  const setAccount = (id: string, patch: Partial<Account>) =>
    update((s) => ({ ...s, accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const setSv = (patch: Partial<SurvivorshipSettings>) => update((s) => ({ ...s, survivorship: { ...s.survivorship, ...patch } }));

  const addTraditional = () =>
    update((s) => {
      const n = s.accounts.filter((a) => mine(a) && a.type === 'traditional_ira').length + 1;
      let i = n;
      while (s.accounts.some((a) => a.id === `spouse-trad-${i}`)) i++;
      return {
        ...s,
        accounts: [
          ...s.accounts,
          { id: `spouse-trad-${i}`, ownerId: spouse.id, type: 'traditional_ira', label: `Spouse Traditional IRA ${n}`, priorYearEndBalance: 0 },
        ],
      };
    });
  const removeTraditional = (id: string) =>
    update((s) => {
      let n = 0;
      return {
        ...s,
        accounts: s.accounts
          .filter((a) => a.id !== id)
          .map((a) => (mine(a) && a.type === 'traditional_ira' ? { ...a, label: `Spouse Traditional IRA ${++n}` } : a)),
      };
    });
  const removeSpouse = () =>
    update((s) => ({
      ...s,
      people: [s.people[0]!],
      accounts: s.accounts.filter((a) => a.ownerId !== SPOUSE_ID && a.ownerId !== spouse.id),
      strategy: {
        ...s.strategy,
        conversions: s.strategy.conversions.filter((c) => c.personId !== spouse.id),
        bracketFills: s.strategy.bracketFills.filter((c) => c.personId !== spouse.id),
        recurringQcds: s.strategy.recurringQcds.filter((c) => c.personId !== spouse.id),
        oneTimeQcds: s.strategy.oneTimeQcds.filter((c) => c.personId !== spouse.id),
      },
      survivorship: { ...s.survivorship, enabled: false, firstDeathPersonId: s.people[0]!.id },
    }));

  const dying = scenario.people.find((p) => p.id === sv.firstDeathPersonId) ?? scenario.people[0]!;
  const dyingBirth = parseIsoDate(dying.dateOfBirth);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={dobId} className="field-label">Spouse date of birth</label>
        <input
          id={dobId}
          type="date"
          className={`field-input ${dobErr ? 'field-input-error' : ''}`}
          value={spouse.dateOfBirth}
          aria-invalid={dobErr ? true : undefined}
          aria-describedby={`${dobId}-note`}
          onChange={(e) => setSpouse({ dateOfBirth: e.target.value })}
        />
        <p id={`${dobId}-note`} className={dobErr ? 'field-error' : 'field-hint'}>
          {dobErr ??
            (rmdStart && birth
              ? `Age ${ageAttainedInYear(birth, scenario.startYear)} in ${scenario.startYear}. RMDs begin at ${rmdStart.applicableAge === 70.5 ? '70½' : rmdStart.applicableAge} (${rmdStart.firstRmdYear}).`
              : '')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Spouse Social Security / yr"
          kind="currency"
          min={0}
          value={spouse.socialSecurityBenefit}
          onCommit={(v) => setSpouse({ socialSecurityBenefit: v })}
          testId="spouse-ss"
        />
        <NumberField
          label="Spouse starting at age"
          kind="integer"
          min={0}
          max={120}
          value={spouse.socialSecurityStartAge}
          onCommit={(v) => setSpouse({ socialSecurityStartAge: v })}
          testId="spouse-ss-age"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="field-label">Spouse’s Traditional IRAs (balances as of December 31, {priorYear})</legend>
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
          <Plus aria-hidden className="h-4 w-4" /> Add spouse Traditional IRA
        </button>
        {roth && (
          <NumberField
            label="Spouse Roth IRA — prior December 31 balance"
            kind="currency"
            min={0}
            value={roth.priorYearEndBalance}
            onCommit={(v) => setAccount(roth.id, { priorYearEndBalance: v })}
            testId="balance-spouse-roth"
          />
        )}
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-accent"
          checked={spouse.delayFirstRmd}
          disabled={!rmdStart || (rmdStart.firstRmdYear < scenario.startYear && !spouse.delayFirstRmd)}
          onChange={(e) => setSpouse({ delayFirstRmd: e.target.checked })}
        />
        Delay the spouse’s first RMD to April 1 of the following year
      </label>

      <fieldset className="space-y-2 rounded-md border border-line p-3">
        <legend className="px-1 text-xs font-semibold text-ink">First death</legend>
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-accent"
            checked={sv.enabled}
            onChange={(e) => setSv({ enabled: e.target.checked })}
          />
          <span>
            Model the first death
            <span className="block text-xs text-muted">
              The survivor rolls the IRAs into their own, files single from the next year, and keeps the larger Social
              Security benefit.
            </span>
          </span>
        </label>
        {sv.enabled && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="first-death" className="field-label">Who dies first</label>
                <select
                  id="first-death"
                  className="field-input"
                  value={sv.firstDeathPersonId}
                  onChange={(e) => setSv({ firstDeathPersonId: e.target.value })}
                >
                  {scenario.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <NumberField
                label="At age"
                kind="integer"
                min={0}
                max={120}
                value={sv.deathAge}
                externalError={err('deathAge')}
                onCommit={(v) => setSv({ deathAge: v })}
                hint={dyingBirth ? `In ${dyingBirth.year + sv.deathAge}` : undefined}
                testId="death-age"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Other income that continues"
                kind="percent"
                min={0}
                max={200}
                value={sv.otherIncomeAfter}
                onCommit={(v) => setSv({ otherIncomeAfter: v })}
                testId="income-after"
              />
              <NumberField
                label="Spending that continues"
                kind="percent"
                min={0}
                max={200}
                value={sv.spendingAfter}
                onCommit={(v) => setSv({ spendingAfter: v })}
                testId="spending-after"
              />
            </div>
            <p className="field-hint">For example, a pension with a 50% survivor benefit: other income continues at about the share it represents.</p>
          </>
        )}
      </fieldset>

      <MessageList messages={messages.filter((m) => m.code === 'joint-life-table' || m.code === 'after-death-ignored')} />

      <button type="button" className="btn w-full" onClick={removeSpouse}>
        Remove spouse
      </button>
    </div>
  );
}
