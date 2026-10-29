import type { AnalysisSettings, EngineMessage, Scenario } from '../types';
import { NumberField } from './NumberField';

interface Props {
  scenario: Scenario;
  update: (fn: (s: Scenario) => Scenario) => void;
  messages: EngineMessage[];
  /** Which fields: household income, rarely used details, the rate assumptions, or (default) all. */
  part?: 'income' | 'details' | 'assumptions';
}

/** Household income, filing status, and tax assumptions used for the tax estimate and IRMAA. */
export function AssumptionsPanel({ scenario, update, messages, part }: Props) {
  const show = (p: 'income' | 'details' | 'assumptions') => !part || part === p;
  const a = scenario.analysis;
  const set = (patch: Partial<AnalysisSettings>) => update((s) => ({ ...s, analysis: { ...s.analysis, ...patch } }));
  const err = (field: string) => messages.find((m) => m.severity === 'error' && m.field === field)?.text;

  return (
    <div className="space-y-3">
      {show('income') && (
        <>
          <p className="text-xs text-ink-2" data-testid="filing-status">
            Filing status:{' '}
            <span className="font-semibold text-ink">
              {scenario.people.length > 1
                ? scenario.survivorship.enabled
                  ? 'married filing jointly, then single for the survivor'
                  : 'married filing jointly'
                : 'single'}
            </span>
            .
          </p>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Pensions, wages, and interest (household)"
              kind="currency"
              min={0}
              value={a.otherOrdinaryIncome}
              externalError={err('otherOrdinaryIncome')}
              onCommit={(v) => set({ otherOrdinaryIncome: v })}
              testId="other-income"
            />
            <NumberField
              label="Qualified dividends and gains"
              kind="currency"
              min={0}
              value={a.qualifiedInvestmentIncome}
              externalError={err('qualifiedInvestmentIncome')}
              onCommit={(v) => set({ qualifiedInvestmentIncome: v })}
              testId="qualified-income"
            />
          </div>
          <p className="field-hint -mt-1">Per year, in today's dollars; grows with inflation.</p>
        </>
      )}

      {show('details') && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Tax-exempt interest"
            kind="currency"
            min={0}
            value={a.taxExemptInterest}
            externalError={err('taxExemptInterest')}
            onCommit={(v) => set({ taxExemptInterest: v })}
            testId="tax-exempt"
          />
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
        </div>
      )}

      {show('assumptions') && (
        <>
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
              label="State income tax rate"
              kind="percent"
              min={0}
              max={100}
              value={a.stateTaxRate}
              externalError={err('stateTaxRate')}
              onCommit={(v) => set({ stateTaxRate: v })}
              testId="state-rate"
            />
          </div>
          <p className="field-hint -mt-1">
            Inflation grows entered income and indexes brackets and IRMAA after 2026. State tax is a flat rate; Social
            Security is exempt.
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
        </>
      )}
    </div>
  );
}
