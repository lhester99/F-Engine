import type { EngineMessage, HeirSettings, Scenario } from '../types';
import { NumberField } from './NumberField';

interface Props {
  scenario: Scenario;
  update: (fn: (s: Scenario) => Scenario) => void;
  messages: EngineMessage[];
}

/** How heirs' tax on an inherited pre-tax IRA is estimated. */
export function HeirsPanel({ scenario, update, messages }: Props) {
  const h = scenario.heirs;
  const set = (patch: Partial<HeirSettings>) => update((s) => ({ ...s, heirs: { ...s.heirs, ...patch } }));
  const err = (field: string) => messages.find((m) => m.severity === 'error' && m.field === field)?.text;

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-2">
        Heirs inherit at the end of the projection. A non-spouse heir must empty an inherited IRA within 10 years; the app
        withdraws it evenly. The Roth IRA passes tax-free and the taxable account gets a step-up in basis.
      </p>
      <div>
        <span className="field-label" id="heirs-mode-label">Heirs' tax on the inherited IRA</span>
        <div className="seg w-full" role="group" aria-labelledby="heirs-mode-label">
          <button type="button" className="seg-btn flex-1" aria-pressed={h.mode === 'rate'} onClick={() => set({ mode: 'rate' })}>
            Enter a rate
          </button>
          <button type="button" className="seg-btn flex-1" aria-pressed={h.mode === 'income'} onClick={() => set({ mode: 'income' })}>
            From heirs' income
          </button>
        </div>
      </div>

      {h.mode === 'rate' ? (
        <NumberField
          label="Heirs' tax rate"
          kind="percent"
          min={0}
          max={100}
          value={scenario.analysis.heirsTaxRate}
          externalError={err('heirsTaxRate')}
          onCommit={(v) => update((s) => ({ ...s, analysis: { ...s.analysis, heirsTaxRate: v } }))}
          hint="Federal plus state rate on the inherited IRA withdrawals."
          testId="heirs-rate"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Number of heirs"
              kind="integer"
              min={1}
              max={20}
              value={h.count}
              externalError={err('heirsCount')}
              onCommit={(v) => set({ count: v })}
              testId="heirs-count"
            />
            <NumberField
              label="Each heir's income / yr"
              kind="currency"
              min={0}
              value={h.otherIncome}
              externalError={err('heirsIncome')}
              onCommit={(v) => set({ otherIncome: v })}
              testId="heirs-income"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="heirs-filing" className="field-label">Heirs file</label>
              <select
                id="heirs-filing"
                className="field-input"
                value={h.filingStatus}
                onChange={(e) => set({ filingStatus: e.target.value as HeirSettings['filingStatus'] })}
              >
                <option value="joint">Married jointly</option>
                <option value="single">Single</option>
              </select>
            </div>
            <NumberField
              label="Heirs' state tax rate"
              kind="percent"
              min={0}
              max={100}
              value={h.stateTaxRate}
              externalError={err('heirsStateRate')}
              onCommit={(v) => set({ stateTaxRate: v })}
              testId="heirs-state"
            />
          </div>
          <p className="field-hint">
            Each heir's share is added on top of their own income (today's dollars, grown with inflation) and taxed through
            the federal brackets. Heirs share equally and are assumed to be under 65 with the standard deduction.
          </p>
        </>
      )}
    </div>
  );
}
