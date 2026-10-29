import { Save, Trash2, Upload } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { metricsForStrategy, type SavedStrategy, type ScenarioMetrics } from '../calculations/compare';
import type { Scenario } from '../types';
import { formatPercent, formatUsd } from '../utils/format';

export const MAX_SAVED = 4;

interface Props {
  scenario: Scenario;
  saved: SavedStrategy[];
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  /** Hide save/load/delete controls (presentation and print). */
  readOnly?: boolean;
}

interface Column {
  id: string;
  name: string;
  m: ScenarioMetrics;
  kind: 'baseline' | 'saved' | 'current';
}

interface RowDef {
  label: string;
  value: (c: Column) => string;
}

const ROWS: RowDef[] = [
  { label: 'Peak annual RMD', value: (c) => (c.m.summary.peakRmd ? `${formatUsd(c.m.summary.peakRmd.amount)} (age ${c.m.summary.peakRmd.age})` : '—') },
  { label: 'Total required RMDs', value: (c) => formatUsd(c.m.summary.totalRequiredRmd) },
  { label: 'Total taxable IRA income', value: (c) => formatUsd(c.m.summary.totalTaxableDistributions + c.m.summary.totalConversions) },
  { label: 'Roth conversions', value: (c) => formatUsd(c.m.summary.totalConversions) },
  { label: 'QCDs', value: (c) => formatUsd(c.m.summary.totalQcd) },
  {
    label: 'IRMAA surcharges',
    value: (c) => (c.m.irmaa.yearsWithSurcharge === 0 ? 'None' : `${formatUsd(c.m.irmaa.totalSurcharge)} (${c.m.irmaa.yearsWithSurcharge} yr)`),
  },
  { label: 'Estimated taxes during projection', value: (c) => formatUsd(c.m.taxTotals.lifetime) },
  { label: 'Taxes including heirs (present value)', value: (c) => formatUsd(c.m.taxTotals.totalPv) },
  {
    label: 'Vs. no strategy (present value)',
    value: (c) => {
      if (c.kind === 'baseline' || !c.m.tax) return '—';
      const v = c.m.tax.netTaxPv;
      return Math.abs(v) < 0.5 ? '$0' : v > 0 ? `${formatUsd(v)} lower` : `${formatUsd(-v)} higher`;
    },
  },
  {
    label: 'Breakeven heirs’ tax rate',
    value: (c) => {
      const be = c.m.tax?.breakevenHeirsRate;
      if (c.kind === 'baseline' || be === null || be === undefined) return '—';
      return be === 0 ? 'Any' : formatPercent(be);
    },
  },
  { label: 'After-tax value at end', value: (c) => formatUsd(c.m.afterTaxEnd) },
  { label: 'What heirs keep (present value)', value: (c) => formatUsd(c.m.taxTotals.legacy.netToHeirsPv) },
  {
    label: 'Breakeven age (after-tax value)',
    value: (c) => {
      if (c.kind === 'baseline' || !c.m.wealth) return '—';
      const w = c.m.wealth;
      if (w.identical) return '—';
      return w.breakevenAge === null ? 'Not reached' : w.crossesOver ? `Age ${w.breakevenAge}` : 'From the start';
    },
  },
  { label: 'Ending pre-tax balance', value: (c) => formatUsd(c.m.summary.endingPretax) },
  { label: 'Ending Roth balance', value: (c) => formatUsd(c.m.summary.endingRoth) },
];

/** Save named sets of planning levers and compare them side by side on the current client inputs. */
export function ScenarioCompare({ scenario, saved, onSave, onLoad, onDelete, readOnly }: Props) {
  const nameId = useId();
  const [name, setName] = useState('');

  const columns = useMemo<Column[]>(() => {
    const current = metricsForStrategy(scenario, { strategy: scenario.strategy, returns: scenario.returns });
    if (!current) return [];
    const cols: Column[] = [{ id: 'baseline', name: 'No strategy', m: current.baseline, kind: 'baseline' }];
    for (const s of saved) {
      const r = metricsForStrategy(scenario, s);
      if (r) cols.push({ id: s.id, name: s.name, m: r.strategy, kind: 'saved' });
    }
    cols.push({ id: 'current', name: saved.length ? 'Current (unsaved)' : 'Current strategy', m: current.strategy, kind: 'current' });
    return cols;
  }, [scenario, saved]);

  if (columns.length === 0) return null;
  const full = saved.length >= MAX_SAVED;

  return (
    <section className="panel p-3 sm:p-4" aria-labelledby="compare-title" data-testid="scenario-compare">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="compare-title" className="text-sm font-semibold text-ink">Compare strategies</h2>
          <p className="text-xs text-muted">
            Each saved strategy keeps its conversions, QCDs, and return assumption, and runs on the current client inputs.
            Saved strategies are not stored after you leave the page.
          </p>
        </div>
        {!readOnly && (
          <form
            className="flex w-full items-end gap-2 sm:w-auto print:hidden"
            onSubmit={(e) => {
              e.preventDefault();
              if (full) return;
              onSave(name.trim() || `Strategy ${saved.length + 1}`);
              setName('');
            }}
          >
            <div className="min-w-0 flex-1 sm:w-56">
              <label htmlFor={nameId} className="field-label">Strategy name</label>
              <input
                id={nameId}
                className="field-input"
                value={name}
                maxLength={40}
                placeholder={`Strategy ${saved.length + 1}`}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={full}>
              <Save aria-hidden className="h-4 w-4" /> Save current
            </button>
          </form>
        )}
      </div>
      {!readOnly && <p className="mb-2 text-xs text-muted print:hidden">Use descriptive names only; avoid client names.{full ? ` Up to ${MAX_SAVED} strategies can be saved.` : ''}</p>}

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[560px] text-sm tabular-nums" data-testid="compare-table">
          <caption className="sr-only">Strategy comparison</caption>
          <thead className="bg-canvas text-xs text-muted">
            <tr>
              <th scope="col" className="px-2 py-2 text-left font-medium">Measure</th>
              {columns.map((c) => (
                <th key={c.id} scope="col" className="px-2 py-2 text-right align-bottom font-medium">
                  <span className={`block ${c.kind === 'current' ? 'text-ink' : ''}`}>{c.name}</span>
                  {c.kind === 'saved' && !readOnly && (
                    <span className="mt-1 inline-flex gap-1 print:hidden">
                      <button type="button" className="btn-icon h-7 w-7" aria-label={`Load ${c.name}`} title="Load into planning levers" onClick={() => onLoad(c.id)}>
                        <Upload aria-hidden className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" className="btn-icon h-7 w-7" aria-label={`Delete ${c.name}`} title="Delete" onClick={() => onDelete(c.id)}>
                        <Trash2 aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-t border-line-soft">
                <th scope="row" className="px-2 py-1.5 text-left font-normal text-ink-2">{r.label}</th>
                {columns.map((c) => (
                  <td key={c.id} className={`px-2 py-1.5 text-right ${c.kind === 'current' ? 'font-semibold text-ink' : 'text-ink'}`}>
                    {r.value(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
