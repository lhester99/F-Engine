import type { CashFlowSettings, EngineMessage, Scenario } from '../types';
import { NumberField } from './NumberField';

interface Props {
  scenario: Scenario;
  update: (fn: (s: Scenario) => Scenario) => void;
  messages: EngineMessage[];
}

/** Taxable account, cash, and how much of the IRA withdrawals the client spends. */
export function CashFlowPanel({ scenario, update, messages }: Props) {
  const cf = scenario.cashFlow;
  const set = (patch: Partial<CashFlowSettings>) => update((s) => ({ ...s, cashFlow: { ...s.cashFlow, ...patch } }));
  const err = (field: string) => messages.find((m) => m.severity === 'error' && m.field === field)?.text;

  return (
    <div className="space-y-3">
      <NumberField
        label="Spending from IRA withdrawals, per year"
        kind="currency"
        min={0}
        value={cf.spendingFromIra}
        externalError={err('spendingFromIra')}
        onCommit={(v) => set({ spendingFromIra: v })}
        hint="What the client actually uses from RMDs, in today's dollars. The rest, after tax, is invested in the taxable account. $0 = none needed."
        testId="spending"
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Taxable account"
          kind="currency"
          min={0}
          value={cf.taxableBalance}
          externalError={err('taxableBalance')}
          onCommit={(v) => set({ taxableBalance: v })}
          testId="taxable-balance"
        />
        <NumberField
          label="Its cost basis"
          kind="currency"
          min={0}
          value={cf.taxableBasis}
          externalError={err('taxableBasis')}
          onCommit={(v) => set({ taxableBasis: v })}
          testId="taxable-basis"
        />
      </div>
      <NumberField
        label="Dividend yield on the taxable account"
        kind="percent"
        min={0}
        max={20}
        value={cf.taxableYield}
        externalError={err('taxableYield')}
        onCommit={(v) => set({ taxableYield: v })}
        hint="Paid out and taxed each year as qualified dividends. The account's total return is the investment return."
        testId="taxable-yield"
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Cash"
          kind="currency"
          min={0}
          value={cf.cashBalance}
          externalError={err('cashBalance')}
          onCommit={(v) => set({ cashBalance: v })}
          testId="cash-balance"
        />
        <NumberField
          label="Cash interest rate"
          kind="percent"
          min={-50}
          max={20}
          value={cf.cashRate}
          externalError={err('cashRate')}
          onCommit={(v) => set({ cashRate: v })}
          testId="cash-rate"
        />
      </div>
      <p className="field-hint">
        Balances today. These accounts pay the tax on IRA income and conversions; spending that RMDs don't cover comes from
        the taxable account, then cash, then the Roth IRA.
      </p>
    </div>
  );
}
