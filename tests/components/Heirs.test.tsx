import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';

describe('heirs and the 10-year rule', () => {
  it('shows what heirs inherit and keep, and switches to bracket-based heirs tax', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('finding-heirs')).toHaveTextContent(/heirs would inherit \$[\d,]+ of pre-tax IRA/);

    await user.click(screen.getByRole('tab', { name: 'Heirs' }));
    const table = screen.getByTestId('legacy-table');
    expect(within(table).getByRole('rowheader', { name: 'Inherited pre-tax IRA' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'What heirs keep, present value' })).toBeInTheDocument();
    expect(within(table).queryByRole('rowheader', { name: 'Highest federal bracket an heir reaches' })).toBeNull();
    // Rate mode: the default 24% heirs' rate is the average rate in both columns.
    const avg = within(table).getByRole('rowheader', { name: "Heirs' average tax rate" }).closest('tr')!;
    expect(avg).toHaveTextContent(/24\.0%.*24\.0%/);

    await user.click(screen.getByRole('button', { name: "From heirs' income" }));
    expect(within(screen.getByTestId('legacy-table')).getByRole('rowheader', { name: 'Highest federal bracket an heir reaches' })).toBeInTheDocument();
    expect(screen.getByText("Top of each federal bracket (heirs' filing status)")).toBeInTheDocument();
    expect(screen.getByTestId('finding-heirs')).toHaveTextContent(/reaches the \d+% bracket for each heir/);

    const taxRow = () => within(screen.getByTestId('legacy-table')).getByRole('rowheader', { name: "Heirs' tax on those withdrawals" }).closest('tr')!.textContent;
    const before = taxRow();
    const income = screen.getByLabelText("Each heir's income / yr");
    await user.clear(income);
    await user.type(income, '400000');
    expect(taxRow()).not.toBe(before);
  });
});
