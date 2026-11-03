import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';
import { expandInputs } from './expandInputs';

describe('income timeline', () => {
  it('adds an income with start and end ages, shows the calendar year, and updates the summary', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    const timeline = screen.getByTestId('income-timeline');
    // Default: one pension already being paid.
    expect(within(timeline).getByTestId('income-start-0')).toHaveAttribute('placeholder', 'Already started');

    await user.click(within(timeline).getByRole('button', { name: 'Add income' }));
    const item = within(timeline).getByTestId('income-item-1');
    await user.selectOptions(within(item).getByLabelText('Type'), 'rental');
    const amount = within(item).getByLabelText('Amount / yr');
    await user.clear(amount);
    await user.type(amount, '18000');
    // Default client born 1956: age 72 is 2028.
    await user.type(within(item).getByTestId('income-start-1'), '72');
    expect(item).toHaveTextContent('In 2028');
    await user.type(within(item).getByTestId('income-end-1'), '80');
    expect(item).toHaveTextContent('In 2036');

    await user.click(screen.getByRole('button', { name: /^Client & household/ }));
    expect(screen.getByTestId('household-summary')).toHaveTextContent('Rental $18K from 72 to 80');

    await user.click(screen.getByRole('button', { name: /^Client & household/ }));
    await user.click(within(screen.getByTestId('income-timeline')).getByRole('button', { name: 'Remove rental income (net)' }));
    expect(within(screen.getByTestId('income-timeline')).queryByTestId('income-item-1')).toBeNull();
  });

  it('rejects an end age before the start age', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    const item = screen.getByTestId('income-item-0');
    await user.type(within(item).getByTestId('income-start-0'), '80');
    await user.type(within(item).getByTestId('income-end-0'), '75');
    expect(screen.getByTestId('income-timeline')).toHaveTextContent('An income’s last age must be on or after its first age.');
  });
});
