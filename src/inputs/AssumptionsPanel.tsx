import { useId } from 'react';
import type { AnalysisSettings, EngineMessage, Scenario } from '../types';
import { NumberField } from './NumberField';

interface Props {
  scenario: Scenario;
  update: (fn: (s: Scenario) => Scenario) => void;
  messages: EngineMessage[];
}

/** Household income, filing status, and tax assumptions used for the tax estimate and IRMAA. */
export function AssumptionsPanel({ scenario, update, messages }: Props) {
  const spouseId = useId();
  const a = scenario.analysis;
  const set = (patch: Partial<AnalysisSettings>) => update((s) => ({ ...s, analysis: { ...s.analysis, ...patch } }));
  const err = (field: string) => messages.find((m) => m.severity === 'error' && m.field === field)?.text;
  const spouseErr = err('spouseDateOfBirth');

  return (
    <div className="space-y-3">
      <div>
        <span className="field-label" id="filing-label">Filing status</span>
        <div className="seg w-full" role="group" aria-labelledby="filing-label">
          <button
            type="button"
            className="seg-btn flex-1"
            aria-pressed={a.filingStatus === 'single'}
            onClick={() => set({ filingStatus: 'single' })}
          >
            Single
          </button>
          <button
            type="button"
            className="seg-btn flex-1"
            aria-pressed={a.filingStatus === 'joint'}
            onClick={() =>
              set({ filingStatus: 'joint', spouseDateOfBirth: a.spouseDateOfBirth || scenario.people[0]?.dateOfBirth || '' })
            }
          >
            Married filing jointly
          </button>
        </div>
      </div>

      {a.filingStatus === 'joint' && (
        <div>
          <label htmlFor={spouseId} className="field-label">Spouse date of birth</label>
          <input
            id={spouseId}
            type="date"
            className={`field-input ${spouseErr ? 'field-input-error' : ''}`}
            value={a.spouseDateOfBirth}
            aria-invalid={spouseErr ? true : undefined}
            aria-describedby={`${spouseId}-note`}
            onChange={(e) => set({ spouseDateOfBirth: e.target.value })}
          />
          <p id={`${spouseId}-note`} className={spouseErr ? 'field-error' : 'field-hint'}>
            {spouseErr ??
              "Used for the age-65 deductions and Medicare. The spouse's own IRAs are not modeled yet; include any spouse income below."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Social Security per year"
          kind="currency"
          min={0}
          value={a.socialSecurityBenefit}
          externalError={err('socialSecurityBenefit')}
          onCommit={(v) => set({ socialSecurityBenefit: v })}
          testId="ss-benefit"
        />
        <NumberField
          label="Starting at client age"
          kind="integer"
          min={0}
          max={120}
          value={a.socialSecurityStartAge}
          externalError={err('socialSecurityStartAge')}
          onCommit={(v) => set({ socialSecurityStartAge: v })}
          testId="ss-age"
        />
      </div>
      <p className="field-hint -mt-1">Household benefits before tax. The taxable share is calculated each year.</p>

      <NumberField
        label="Pensions, wages, and interest"
        kind="currency"
        min={0}
        value={a.otherOrdinaryIncome}
        externalError={err('otherOrdinaryIncome')}
        onCommit={(v) => set({ otherOrdinaryIncome: v })}
        testId="other-income"
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Qualified dividends and gains"
          kind="currency"
          min={0}
          value={a.qualifiedInvestmentIncome}
          externalError={err('qualifiedInvestmentIncome')}
          onCommit={(v) => set({ qualifiedInvestmentIncome: v })}
          testId="qualified-income"
        />
        <NumberField
          label="Tax-exempt interest"
          kind="currency"
          min={0}
          value={a.taxExemptInterest}
          externalError={err('taxExemptInterest')}
          onCommit={(v) => set({ taxExemptInterest: v })}
          testId="tax-exempt"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Itemized deductions"
          kind="currency"
          min={0}
          value={a.itemizedDeductions}
          externalError={err('itemizedDeductions')}
          onCommit={(v) => set({ itemizedDeductions: v })}
          hint="Used only if larger than the standard deduction."
          testId="itemized"
        />
        <NumberField
          label="State income tax rate"
          kind="percent"
          min={0}
          max={100}
          value={a.stateTaxRate}
          externalError={err('stateTaxRate')}
          onCommit={(v) => set({ stateTaxRate: v })}
          hint="Flat rate; Social Security exempt."
          testId="state-rate"
        />
      </div>
      <p className="field-hint">All amounts are in today's dollars and grow with inflation.</p>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Inflation"
          kind="percent"
          min={-50}
          max={20}
          value={a.inflationRate}
          externalError={err('inflationRate')}
          onCommit={(v) => set({ inflationRate: v })}
          testId="inflation"
        />
        <NumberField
          label="Heirs' tax rate"
          kind="percent"
          min={0}
          max={100}
          value={a.heirsTaxRate}
          externalError={err('heirsTaxRate')}
          onCommit={(v) => set({ heirsTaxRate: v })}
          testId="heirs-rate"
        />
      </div>
      <p className="field-hint -mt-1">
        Inflation grows the amounts above and indexes brackets and IRMAA after 2026. The heirs' rate applies to the
        pre-tax balance left at the end.
      </p>

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
              Used for present values. Turn off to enter your own discount rate.
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
