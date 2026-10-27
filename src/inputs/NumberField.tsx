import { useEffect, useId, useState } from 'react';

export type NumberKind = 'currency' | 'percent' | 'integer';

interface Props {
  label: string;
  /** Stored value. For percent fields this is a fraction (0.06 = 6%). */
  value: number;
  onCommit: (value: number) => void;
  kind: NumberKind;
  /** Bounds in display units (dollars, percent points, or whole numbers). */
  min?: number;
  max?: number;
  hint?: string;
  /** Error from the engine's validation, shown when the field itself is valid. */
  externalError?: string;
  /** Hide the visible label (still announced to screen readers). */
  srOnlyLabel?: boolean;
  className?: string;
  testId?: string;
}

const toDisplayUnits = (v: number, kind: NumberKind) => (kind === 'percent' ? round(v * 100, 6) : v);
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

function formatForBlur(v: number, kind: NumberKind): string {
  if (!Number.isFinite(v)) return '';
  if (kind === 'currency') return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (kind === 'percent') return `${toDisplayUnits(v, kind).toLocaleString('en-US', { maximumFractionDigits: 4 })}%`;
  return String(v);
}

/** Parses user text. Returns the value in display units, or an error message. */
export function parseNumberInput(
  text: string,
  kind: NumberKind,
  min?: number,
  max?: number,
): { ok: true; value: number } | { ok: false; error: string } {
  const cleaned = text.replace(/[$,%\s]/g, '');
  if (cleaned === '') return { ok: false, error: 'Required.' };
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return { ok: false, error: 'Enter a number.' };
  const n = Number(cleaned);
  if (kind === 'integer' && !Number.isInteger(n)) return { ok: false, error: 'Enter a whole number.' };
  const unit = (x: number) => (kind === 'currency' ? `$${x.toLocaleString('en-US')}` : kind === 'percent' ? `${x}%` : String(x));
  if (min !== undefined && n < min) return { ok: false, error: `Must be at least ${unit(min)}.` };
  if (max !== undefined && n > max) return { ok: false, error: `Must be at most ${unit(max)}.` };
  return { ok: true, value: n };
}

/**
 * Text input for dollars, percents, and whole numbers. Values are reformatted
 * when the field loses focus. Valid entries are committed on every
 * keystroke so results update immediately; invalid entries show a message and
 * are not committed.
 */
export function NumberField({ label, value, onCommit, kind, min, max, hint, externalError, srOnlyLabel, className, testId }: Props) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => formatForBlur(value, kind));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) {
      setText(formatForBlur(value, kind));
      setLocalError(null);
    }
  }, [value, kind, focused]);

  const error = localError ?? externalError ?? null;
  const describedBy = [hint && !error ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className={srOnlyLabel ? 'sr-only' : 'field-label'}>
        {label}
      </label>
      <input
        id={id}
        data-testid={testId}
        type="text"
        inputMode={kind === 'integer' ? 'numeric' : 'decimal'}
        autoComplete="off"
        className={`field-input ${error ? 'field-input-error' : ''}`}
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        // The text is left as-is on focus: reformatting here would move the caret and
        // corrupt select-all-then-type edits. "$" and "," are ignored when parsing.
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (!localError) setText(formatForBlur(value, kind));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseNumberInput(e.target.value, kind, min, max);
          if (!parsed.ok) {
            setLocalError(parsed.error);
            return;
          }
          setLocalError(null);
          onCommit(kind === 'percent' ? parsed.value / 100 : parsed.value);
        }}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
