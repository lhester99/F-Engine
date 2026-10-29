import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';

describe('simplified sidebar', () => {
  it('shows the client facts as a summary until Edit is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);
    const summary = screen.getByTestId('household-summary');
    // Default hypothetical client: born 1956; $1.4M + $350K Traditional, $150K Roth; $250K taxable, $50K cash.
    expect(summary).toHaveTextContent(/Client \d+ · Single/);
    expect(summary).toHaveTextContent('$1.8M Traditional · $150K Roth');
    expect(summary).toHaveTextContent('$250K taxable · $50K cash');
    expect(summary).toHaveTextContent('Social Security $36K · Other $15K per year');

    const edit = screen.getByRole('button', { name: /^Client & household/ });
    expect(edit).toHaveAttribute('aria-expanded', 'false');
    expect(edit).toHaveTextContent('Edit');
    expect(screen.queryByRole('button', { name: 'Add Traditional IRA' })).toBeNull();

    await user.click(edit);
    expect(edit).toHaveTextContent('Done');
    expect(screen.queryByTestId('household-summary')).toBeNull();
    // Rarely used fields stay behind More details.
    expect(screen.queryByRole('checkbox', { name: 'Contributions are tax-deductible' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^More details/ }));
    expect(screen.getByRole('checkbox', { name: 'Contributions are tax-deductible' })).toBeInTheDocument();

    const cash = screen.getByLabelText('Cash');
    await user.clear(cash);
    await user.type(cash, '80000');
    await user.click(edit);
    expect(screen.getByTestId('household-summary')).toHaveTextContent('$250K taxable · $80K cash');
  });

  it('puts the levers first and the rate assumptions in one summarized section', async () => {
    const user = userEvent.setup();
    render(<App />);
    const titles = within(document.getElementById('inputs-panel')!)
      .getAllByRole('button', { expanded: undefined })
      .filter((b) => b.hasAttribute('aria-expanded'))
      .map((b) => b.textContent ?? '');
    expect(titles.map((t) => t.replace(/(Edit|Done|None|\d.*)$/, '').trim())).toEqual([
      'Client & household',
      'Roth conversions',
      'Qualified charitable distributions',
      'Investment returns',
      'Assumptions',
    ]);
    expect(screen.getByRole('button', { name: /^Roth conversions/ })).toHaveAttribute('aria-expanded', 'true');

    const summary = screen.getByTestId('assumptions-summary');
    expect(summary).toHaveTextContent('Inflation 2.5% · State tax 0.0% · Heirs 24% · Discount = return');
    await user.click(screen.getByRole('button', { name: /^Assumptions/ }));
    const state = screen.getByLabelText('State income tax rate');
    await user.clear(state);
    await user.type(state, '5');
    await user.click(screen.getByRole('button', { name: /^Assumptions/ }));
    expect(screen.getByTestId('assumptions-summary')).toHaveTextContent('State tax 5.0%');
  });
});
