import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberField, parseNumberInput } from '../../src/inputs/NumberField';

describe('parseNumberInput', () => {
  it('accepts formatted dollars and percents', () => {
    expect(parseNumberInput('$1,250,000', 'currency')).toEqual({ ok: true, value: 1_250_000 });
    expect(parseNumberInput('6.5%', 'percent')).toEqual({ ok: true, value: 6.5 });
  });
  it('rejects junk, decimals for integers, and out-of-range values', () => {
    expect(parseNumberInput('abc', 'currency').ok).toBe(false);
    expect(parseNumberInput('', 'currency').ok).toBe(false);
    expect(parseNumberInput('72.5', 'integer').ok).toBe(false);
    expect(parseNumberInput('-1', 'currency', 0)).toEqual({ ok: false, error: 'Must be at least $0.' });
  });
});

describe('NumberField', () => {
  it('commits valid values immediately and shows a message for invalid ones', async () => {
    const onCommit = vi.fn();
    render(<NumberField label="Balance" kind="currency" min={0} value={100} onCommit={onCommit} />);
    const input = screen.getByLabelText('Balance');
    expect(input).toHaveValue('$100');
    await userEvent.clear(input);
    await userEvent.type(input, '2500');
    expect(onCommit).toHaveBeenLastCalledWith(2500);
    onCommit.mockClear();
    await userEvent.clear(input);
    await userEvent.type(input, '-5');
    expect(screen.getByRole('alert')).toHaveTextContent('Must be at least $0.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(onCommit).not.toHaveBeenCalledWith(-5);
  });

  it('stores percents as fractions', async () => {
    const onCommit = vi.fn();
    render(<NumberField label="Return" kind="percent" value={0.06} onCommit={onCommit} />);
    const input = screen.getByLabelText('Return');
    expect(input).toHaveValue('6%');
    await userEvent.clear(input);
    await userEvent.type(input, '4.5');
    expect(onCommit).toHaveBeenLastCalledWith(0.045);
  });
});
