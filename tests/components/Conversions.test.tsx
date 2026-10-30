import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';
import { expandInputs } from './expandInputs';

describe('Roth Conversions tab', () => {
  it('shows an empty state, then the cost, breakeven rate and age, and the year-by-year table', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    await user.click(screen.getByRole('tab', { name: 'Roth Conversions' }));
    expect(screen.getByTestId('conversion-empty')).toHaveTextContent('No Roth conversions are entered yet');

    // Default fixed plan: $50,000 a year, ages 70–74.
    await user.click(screen.getByRole('button', { name: 'Apply to range' }));
    expect(screen.getByTestId('conv-total')).toHaveTextContent('$250,000');
    expect(screen.getByTestId('conv-total')).toHaveTextContent('ages 70–74, 5 years');
    expect(screen.getByTestId('conv-cost')).toHaveTextContent(/\$[\d,]+ federal & state .*per \$1 converted/);
    expect(screen.getByTestId('conv-breakeven-rate')).toHaveTextContent(/Breakeven tax rate/);
    expect(screen.getByTestId('conv-breakeven-age')).toHaveTextContent(/Age \d+|Not reached/);

    const table = screen.getByTestId('conversion-cost-table');
    const rows = within(table).getAllByRole('row');
    // Header, five conversion years, and the total.
    expect(rows).toHaveLength(7);
    expect(rows[1]).toHaveTextContent('70 (');
    expect(rows[1]).toHaveTextContent('$50,000');
    expect(within(table).getByRole('rowheader', { name: 'Total' }).closest('tr')).toHaveTextContent('$250,000');
    expect(screen.getByTestId('conversion-chart')).toBeInTheDocument();
  });
});
