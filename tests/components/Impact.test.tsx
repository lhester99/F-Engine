import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';
import { expandInputs } from './expandInputs';

describe('impact charts', () => {
  it('compare no strategy with the strategy, in future or today’s dollars', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    const mix = screen.getByTestId('impact-mix');
    // No strategy yet: the two scenarios match.
    expect(mix).toHaveTextContent(/Roth (\$[\d.]+[KM]) → \1/);
    await user.click(screen.getByRole('button', { name: 'Apply to range' }));
    const headline = within(screen.getByTestId('impact-mix')).getByText(/^Roth \$/).textContent!;
    const [before, after] = headline.replace('Roth ', '').split(' → ');
    expect(before).not.toBe(after);
    expect(screen.getByTestId('impact-wealth')).toHaveTextContent(/[▲▼] [+−]\$[\d.]+[KM] \([+−][\d.]+%\)/);
    expect(screen.getByTestId('impact-heirs')).toHaveTextContent('in present value');
    // Accessible table behind each chart.
    expect(within(screen.getByTestId('impact-mix')).getByRole('table')).toHaveTextContent('With strategy');

    const wealthBefore = within(screen.getByTestId('impact-wealth')).getByText(/→/).textContent;
    const heirsBefore = within(screen.getByTestId('impact-heirs')).getByText(/→/).textContent;
    await user.click(screen.getByRole('button', { name: 'Today’s dollars' }));
    expect(within(screen.getByTestId('impact-wealth')).getByText(/→/).textContent).not.toBe(wealthBefore);
    // Present values do not change with the switch.
    expect(within(screen.getByTestId('impact-heirs')).getByText(/→/).textContent).toBe(heirsBefore);
  });
});
