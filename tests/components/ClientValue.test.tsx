import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';

async function addStrategy(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Apply to range' }));
  await user.click(screen.getByRole('button', { name: 'Add recurring QCD' }));
}

describe('client-value features', () => {
  it('shows plain-English findings that update with the strategy', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('finding-size')).toHaveTextContent(/Without a strategy, required RMDs start at/);
    expect(screen.getByTestId('finding-strategy')).toHaveTextContent(/No Roth conversions or QCDs/);
    await addStrategy(user);
    expect(screen.getByTestId('finding-strategy')).toHaveTextContent(/This strategy lowers the peak RMD/);
    expect(screen.getByTestId('finding-shift')).toHaveTextContent(/Conversions move \$250,000 of taxable income into ages 70–74/);
    expect(screen.getByTestId('finding-tax')).toHaveTextContent(/estimated income tax is about/);
    expect(screen.getByTestId('finding-irmaa')).toHaveTextContent(/Without a strategy:/);
  });

  it('recalculates the tax trade-off when the assumed rates change', async () => {
    const user = userEvent.setup();
    render(<App />);
    await addStrategy(user);
    const breakeven = screen.getByTestId('breakeven');
    const before = breakeven.textContent;
    const added = screen.getByLabelText('On income added');
    await user.clear(added);
    await user.type(added, '12');
    expect(screen.getByTestId('breakeven').textContent).not.toBe(before);
    // Invalid rate shows an instant message and does not change the result.
    await user.clear(added);
    await user.type(added, '150');
    expect(screen.getByText('Must be at most 100%.')).toBeInTheDocument();
  });

  it('lets you enter your own discount rate', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByLabelText('Discount rate (present value)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Discount at the investment return/ }));
    expect(screen.getByLabelText('Discount rate (present value)')).toHaveValue('4%');
  });

  it('switches filing status and Medicare enrollees', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Joint' }));
    await user.click(screen.getByRole('button', { name: '2 people' }));
    expect(screen.getByRole('button', { name: 'Joint' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByTestId('tradeoffs')).getByText(/two people on\s+Medicare \(joint thresholds\)/)).toBeInTheDocument();
  });

  it('shows the Income & IRMAA tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: 'Income & IRMAA' }));
    expect(screen.getByTestId('income-chart')).toBeInTheDocument();
    expect(screen.getByTestId('chart-caption')).toHaveTextContent(/Estimated MAGI by income year/);
  });

  it('saves, loads, and deletes strategies for side-by-side comparison', async () => {
    const user = userEvent.setup();
    render(<App />);
    await addStrategy(user);
    await user.type(screen.getByLabelText('Strategy name'), 'Convert and give');
    await user.click(screen.getByRole('button', { name: 'Save current' }));
    const table = screen.getByTestId('compare-table');
    expect(within(table).getByRole('columnheader', { name: /Convert and give/ })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /Current \(unsaved\)/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('No conversions scheduled.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load Convert and give' }));
    expect(screen.getByTestId('conversion-table')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Convert and give' }));
    expect(within(screen.getByTestId('compare-table')).queryByRole('columnheader', { name: /Convert and give/ })).not.toBeInTheDocument();
  });

  it('presentation mode hides the inputs and editing controls, then restores them', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Present' }));
    expect(screen.getByRole('complementary', { hidden: true })).toHaveClass('hidden');
    expect(screen.queryByRole('button', { name: 'Save current' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
    expect(screen.getByTestId('disclosures')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exit presentation' }));
    expect(screen.getByRole('button', { name: 'Save current' })).toBeInTheDocument();
  });

  it('accepts pre-tax Traditional IRA contributions', async () => {
    const user = userEvent.setup();
    render(<App />);
    const field = screen.getByLabelText('Annual pre-tax contribution');
    await user.clear(field);
    await user.type(field, '7000');
    await user.tab();
    expect(field).toHaveValue('$7,000');
    expect(screen.getByRole('checkbox', { name: 'Contributions are tax-deductible' })).toBeChecked();
  });
});
