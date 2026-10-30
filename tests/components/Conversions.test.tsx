import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';
import { expandInputs } from './expandInputs';

describe('Roth conversion summary on the Tax Brackets tab', () => {
  it('appears once conversions are entered, with cost, breakeven rate, and breakeven age', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    expect(screen.queryByRole('tab', { name: 'Roth Conversions' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Tax Brackets' }));
    expect(screen.queryByTestId('conversion-summary')).toBeNull();

    // Default fixed plan: $50,000 a year, ages 70–74.
    await user.click(screen.getByRole('button', { name: 'Apply to range' }));
    expect(screen.getByTestId('conv-total')).toHaveTextContent('$250,000');
    expect(screen.getByTestId('conv-total')).toHaveTextContent('ages 70–74, 5 years');
    expect(screen.getByTestId('conv-cost')).toHaveTextContent(/\$[\d,]+ federal & state .*per \$1 converted/);
    expect(screen.getByTestId('conv-breakeven-rate')).toHaveTextContent(/Breakeven tax rate/);
    expect(screen.getByTestId('conv-breakeven-age')).toHaveTextContent(/Age \d+|Not reached/);
    // The bracket chart and plan table are still there.
    expect(screen.getByTestId('bracket-chart')).toBeInTheDocument();
    expect(screen.getByTestId('plan-table')).toBeInTheDocument();
  });
});
