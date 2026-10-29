import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';
import { expandInputs } from './expandInputs';

describe('heirs and the 10-year rule', () => {
  it('shows what heirs inherit and keep, and switches to bracket-based heirs tax', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
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
    await user.click(screen.getByRole('button', { name: "Heirs' income and brackets" }));
    expect(screen.getByText("Top of each federal bracket (heirs' filing status)")).toBeInTheDocument();
    expect(screen.getByTestId('finding-heirs')).toHaveTextContent(/reaches the \d+% bracket for each heir/);

    const taxRow = () => within(screen.getByTestId('legacy-table')).getByRole('rowheader', { name: "Heirs' tax on those withdrawals" }).closest('tr')!.textContent;
    const before = taxRow();
    const income = screen.getByLabelText("Each heir's income / yr");
    await user.clear(income);
    await user.type(income, '400000');
    expect(taxRow()).not.toBe(before);
  });

  it('shows the inherited Roth IRA growing tax-free, and what it adds for heirs', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    await user.click(screen.getByRole('button', { name: 'Apply to range' }));
    await user.click(screen.getByRole('tab', { name: 'Heirs' }));
    expect(screen.getByTestId('inheritance-chart')).toBeInTheDocument();
    expect(screen.getByText('Roth IRA, strategy')).toBeInTheDocument();
    const table = screen.getByTestId('legacy-table');
    const row = (name: string) => within(table).getByRole('rowheader', { name }).closest('tr')!;
    const dollars = (text: string) => [...text.matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1]!.replace(/,/g, '')));
    // Conversions move money into the Roth IRA, which grows tax-free over the 10 years.
    const [bRoth, sRoth] = dollars(row('Inherited Roth IRA').textContent!);
    const [bGrown, sGrown] = dollars(row('Roth IRA after tax-free growth, withdrawn in year 10').textContent!);
    expect(sRoth!).toBeGreaterThan(bRoth!);
    expect(sGrown!).toBeGreaterThan(sRoth!);
    expect(bGrown!).toBeGreaterThan(bRoth!);
    expect(row('share from the Roth IRA (tax-free)')).toHaveTextContent(/\d+\.\d%.*\d+\.\d%/);
    await user.click(screen.getByRole('button', { name: 'Pre-tax withdrawals' }));
    expect(screen.getByTestId('heirs-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('inheritance-chart')).toBeNull();
  });
});
