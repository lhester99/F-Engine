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
    expect(screen.getByTestId('finding-brackets')).toHaveTextContent(/In conversion years \(ages 70–74\), income reaches the \d+% federal bracket/);
    expect(screen.getByTestId('finding-tax')).toHaveTextContent(/The strategy adds about \$[\d,]+ of federal, state, and IRMAA costs/);
    expect(screen.getByTestId('finding-irmaa')).toHaveTextContent(/Without a strategy:/);
  });

  it('recalculates the tax trade-off when assumptions change', async () => {
    const user = userEvent.setup();
    render(<App />);
    await addStrategy(user);
    const summary = screen.getByTestId('tax-summary');
    const before = summary.textContent;
    const state = screen.getByLabelText('State income tax rate');
    await user.clear(state);
    await user.type(state, '5');
    expect(screen.getByTestId('tax-summary').textContent).not.toBe(before);
    const heirs = screen.getByLabelText("Heirs' tax rate");
    await user.clear(heirs);
    await user.type(heirs, '150');
    expect(screen.getByText('Must be at most 100%.')).toBeInTheDocument();
  });

  it('lets you enter your own discount rate', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByLabelText('Discount rate (present value)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Discount at the investment return/ }));
    expect(screen.getByLabelText('Discount rate (present value)')).toHaveValue('4%');
  });

  it('adds a spouse, files jointly, and models the first death', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('filing-status')).toHaveTextContent('single');
    await user.click(screen.getByRole('button', { name: 'Add spouse' }));
    expect(screen.getByLabelText('Spouse date of birth')).toHaveValue('1958-06-15');
    expect(screen.getByTestId('filing-status')).toHaveTextContent('married filing jointly');
    expect(screen.getByLabelText('Spouse Traditional IRA 1 — prior December 31 balance')).toHaveValue('$400,000');

    await user.click(screen.getByRole('checkbox', { name: /Model the first death/ }));
    expect(screen.getByTestId('filing-status')).toHaveTextContent('then single for the survivor');
    expect(screen.getByTestId('finding-survivor')).toHaveTextContent(/After Client dies at 85 \(2041\), the survivor files single/);

    await user.click(screen.getByRole('tab', { name: 'Tax Brackets' }));
    const table = screen.getByTestId('plan-table');
    expect(within(table).getByRole('rowheader', { name: '85 (2041)' }).parentElement).toHaveTextContent('Joint');
    expect(within(table).getByRole('rowheader', { name: '86 (2042)' }).parentElement).toHaveTextContent('Single');

    await user.click(screen.getByRole('button', { name: 'Remove spouse' }));
    expect(screen.getByTestId('filing-status')).toHaveTextContent('single');
  });

  it('lets conversions come from either spouse', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add spouse' }));
    await user.click(within(screen.getByRole('group', { name: 'Convert from' })).getByRole('button', { name: 'Spouse’s IRAs' }));
    await user.click(screen.getByRole('button', { name: 'Apply to range' }));
    expect(screen.getByTestId('conversion-table')).toBeInTheDocument();
    expect(screen.getByTestId('finding-shift')).toHaveTextContent(/Conversions move \$250,000/);
  });

  it('shows the Tax Brackets tab with the year-by-year plan', async () => {
    const user = userEvent.setup();
    render(<App />);
    await addStrategy(user);
    await user.click(screen.getByRole('tab', { name: 'Tax Brackets' }));
    expect(screen.getByTestId('bracket-chart')).toBeInTheDocument();
    const table = screen.getByTestId('plan-table');
    expect(within(table).getByRole('rowheader', { name: '70 (2026)' })).toBeInTheDocument();
  });

  it('sets up a fill-to-bracket rule', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Fill to a bracket' }));
    await user.selectOptions(screen.getByLabelText('Fill to top of'), '0.22');
    await user.selectOptions(screen.getByLabelText('Also stay within'), '0');
    await user.click(screen.getByRole('button', { name: 'Apply to range' }));
    expect(screen.getByTestId('fill-rules')).toHaveTextContent('Fill to 22%, ages 70–74, no IRMAA surcharge');
    expect(within(screen.getByTestId('conversion-table')).getAllByText('Fill to 22%').length).toBe(5);
    await user.click(screen.getByRole('button', { name: /Remove fill to 22% rule/ }));
    expect(screen.queryByTestId('fill-rules')).not.toBeInTheDocument();
  });

  it('shows the IRMAA tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: 'IRMAA' }));
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

describe('step 2: taxable account, cash, spending, and wealth', () => {
  it('changing how the conversion tax is paid changes the Roth balance', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Apply to range' }));
    await user.click(screen.getByRole('tab', { name: 'Wealth' }));
    await user.click(screen.getByRole('button', { name: 'Open year detail' }));
    const rothEnd = () =>
      within(screen.getByTestId('year-detail')).getByRole('rowheader', { name: 'Ending Dec 31 balance (Roth IRA)' }).parentElement!
        .querySelectorAll('td')[1]!.textContent;
    const fromTaxable = rothEnd();
    await user.selectOptions(screen.getByLabelText('Pay the conversion tax from'), 'withhold');
    expect(rothEnd()).not.toBe(fromTaxable);
    expect(within(screen.getByTestId('year-detail')).getByRole('rowheader', { name: 'conversion tax withheld' })).toBeInTheDocument();
  });

  it('spending reduces what is invested from RMDs', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('finding-excess')).toHaveTextContent(/left after taxes over the projection/);
    const spend = screen.getByLabelText('Spending from IRA withdrawals, per year');
    await user.clear(spend);
    await user.type(spend, '40000');
    expect(screen.getByTestId('finding-excess')).toHaveTextContent(/left after taxes and spending/);
  });

  it('shows after-tax value and the breakeven age', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Apply to range' }));
    expect(screen.getByTestId('finding-wealth')).toHaveTextContent(/after-tax value is \$[\d,]+ with the strategy/);
    expect(within(screen.getByTestId('summary-stats')).getByText('After-tax value at end')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Wealth' }));
    expect(screen.getByTestId('wealth-chart')).toBeInTheDocument();
  });

  it('validates the new inputs instantly', async () => {
    const user = userEvent.setup();
    render(<App />);
    const yieldField = screen.getByLabelText('Dividend yield on the taxable account');
    await user.clear(yieldField);
    await user.type(yieldField, '30');
    expect(screen.getByText('Must be at most 20%.')).toBeInTheDocument();
  });
});
