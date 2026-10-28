import type { AnalysisSettings, EngineMessage, Scenario } from '../types';
import { NumberField } from './NumberField';

interface Props {
  scenario: Scenario;
  update: (fn: (s: Scenario) => Scenario) => void;
  errors: EngineMessage[];
}

/** Filing status, other income, and tax-rate assumptions for the IRMAA check and tax comparison. */
export function AssumptionsPanel({ scenario, update, errors }: Props) {
  const a = scenario.analysis;
  const set = (patch: Partial<AnalysisSettings>) => update((s) => ({ ...s, analysis: { ...s.analysis, ...patch } }));
  const err = (field: string) => errors.find((m) => m.field === field)?.text;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="field-label" id="filing-label">Filing status</span>
          <div className="seg w-full" role="group" aria-labelledby="filing-label">
            <button type="button" className="seg-btn flex-1" aria-pressed={a.filingStatus === 'single'} onClick={() => set({ filingStatus: 'single' })}>
              Single
            </button>
            <button type="button" className="seg-btn flex-1" aria-pressed={a.filingStatus === 'joint'} onClick={() => set({ filingStatus: 'joint' })}>
              Joint
            </button>
          </div>
        </div>
        <div>
          <span className="field-label" id="enrollees-label">On Medicare</span>
          <div className="seg w-full" role="group" aria-labelledby="enrollees-label">
            <button type="button" className="seg-btn flex-1" aria-pressed={a.medicareEnrollees === 1} onClick={() => set({ medicareEnrollees: 1 })}>
              1 person
            </button>
            <button type="button" className="seg-btn flex-1" aria-pressed={a.medicareEnrollees === 2} onClick={() => set({ medicareEnrollees: 2 })}>
              2 people
            </button>
          </div>
        </div>
      </div>

      <NumberField
        label="Other income each year (counted in MAGI)"
        kind="currency"
        min={0}
        value={a.otherIncome}
        externalError={err('otherIncome')}
        onCommit={(v) => set({ otherIncome: v })}
        hint="Pensions, taxable Social Security, wages, interest (including tax-exempt), dividends, capital gains. Include a spouse's income if filing jointly. In today's dollars."
        testId="other-income"
      />
      <NumberField
        label="Inflation"
        kind="percent"
        min={-50}
        max={20}
        value={a.inflationRate}
        externalError={err('inflationRate')}
        onCommit={(v) => set({ inflationRate: v })}
        hint="Grows other income and indexes IRMAA thresholds and surcharges after 2026."
        testId="inflation"
      />

      <fieldset className="space-y-2">
        <legend className="field-label">Assumed tax rates for the trade-off estimate</legend>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="On income added"
            kind="percent"
            min={0}
            max={100}
            value={a.addedIncomeTaxRate}
            externalError={err('addedIncomeTaxRate')}
            onCommit={(v) => set({ addedIncomeTaxRate: v })}
            testId="rate-added"
          />
          <NumberField
            label="On income avoided"
            kind="percent"
            min={0}
            max={100}
            value={a.avoidedIncomeTaxRate}
            externalError={err('avoidedIncomeTaxRate')}
            onCommit={(v) => set({ avoidedIncomeTaxRate: v })}
            testId="rate-avoided"
          />
        </div>
        <p className="field-hint">
          Marginal rates you expect: on income the strategy adds (mostly conversion years), and on income it avoids
          later, including pre-tax money left at the end. Federal plus state, if you want both reflected.
        </p>
      </fieldset>
      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-accent"
            checked={a.discountMatchesReturn}
            onChange={(e) => set({ discountMatchesReturn: e.target.checked })}
          />
          <span>
            Discount at the investment return
            <span className="block text-xs text-muted">
              Keeps a conversion tax-neutral when both rates are equal. Turn off to enter your own discount rate.
            </span>
          </span>
        </label>
        {!a.discountMatchesReturn && (
          <NumberField
            label="Discount rate (present value)"
            kind="percent"
            min={-50}
            max={30}
            value={a.discountRate}
            externalError={err('discountRate')}
            onCommit={(v) => set({ discountRate: v })}
            testId="discount-rate"
          />
        )}
      </div>
    </div>
  );
}
