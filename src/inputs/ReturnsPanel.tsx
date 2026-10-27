import { effectiveAnnualReturn } from '../calculations/returns';
import type { EngineMessage, ReturnAssumption, Scenario } from '../types';
import { formatPercent } from '../utils/format';
import { NumberField } from './NumberField';

interface Props {
  scenario: Scenario;
  update: (fn: (s: Scenario) => Scenario) => void;
  messages: EngineMessage[];
}

export function ReturnsPanel({ scenario, update, messages }: Props) {
  const r = scenario.returns;
  const setReturns = (next: ReturnAssumption) => update((s) => ({ ...s, returns: next }));
  const err = messages.find((m) => m.field === 'returns' && m.severity === 'error')?.text;
  const rate = effectiveAnnualReturn(r);

  const switchMode = (mode: ReturnAssumption['mode']) => {
    if (mode === r.mode) return;
    if (mode === 'single') setReturns({ mode: 'single', annualReturn: Number.isFinite(rate) ? rate : 0.06 });
    else setReturns({ mode: 'allocation', stockWeight: 0.6, stockReturn: 0.075, bondReturn: 0.04 });
  };

  return (
    <div className="space-y-3">
      <div className="seg" role="group" aria-label="Return input method">
        <button type="button" className="seg-btn" aria-pressed={r.mode === 'single'} onClick={() => switchMode('single')}>
          Single rate
        </button>
        <button type="button" className="seg-btn" aria-pressed={r.mode === 'allocation'} onClick={() => switchMode('allocation')}>
          Stock / bond mix
        </button>
      </div>

      {r.mode === 'single' ? (
        <NumberField
          label="Annual expected return"
          kind="percent"
          min={-99}
          max={100}
          value={r.annualReturn}
          onCommit={(v) => setReturns({ ...r, annualReturn: v })}
          testId="return-single"
        />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Stocks"
            kind="percent"
            min={0}
            max={100}
            value={r.stockWeight}
            onCommit={(v) => setReturns({ ...r, stockWeight: v })}
            testId="stock-weight"
          />
          <NumberField
            label="Stock return"
            kind="percent"
            min={-99}
            max={100}
            value={r.stockReturn}
            onCommit={(v) => setReturns({ ...r, stockReturn: v })}
            testId="stock-return"
          />
          <NumberField
            label="Bond return"
            kind="percent"
            min={-99}
            max={100}
            value={r.bondReturn}
            onCommit={(v) => setReturns({ ...r, bondReturn: v })}
            testId="bond-return"
          />
        </div>
      )}
      {r.mode === 'allocation' && (
        <p className="text-xs text-ink-2" data-testid="weighted-return">
          Bonds {formatPercent(1 - r.stockWeight, 0)}. Weighted return:{' '}
          <span className="font-semibold">{Number.isFinite(rate) ? formatPercent(rate, 2) : '—'}</span>
        </p>
      )}
      {err && <p className="field-error">{err}</p>}
      <p className="field-hint">Applied to all accounts every year. Hypothetical; not a forecast.</p>
    </div>
  );
}
