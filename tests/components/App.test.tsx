import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';
import { expandInputs } from './expandInputs';

const stat = (label: string) => within(screen.getByTestId('summary-stats')).getByText(label).parentElement!;

describe('App', () => {
  it('renders the header, summary, and RMD tab by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'RMD Smoothing Analyzer' })).toBeInTheDocument();
    expect(screen.getByText('Roth conversions, RMDs, taxes now and later, and what heirs keep.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'RMD Projections' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('rmd-chart')).toBeInTheDocument();
  });

  it('keeps inputs and strategies when switching tabs', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    const balance = screen.getByLabelText('Traditional IRA 1 — prior December 31 balance');
    await user.clear(balance);
    await user.type(balance, '2000000');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Apply to range' }));
    expect(screen.getByTestId('conversion-table')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Wealth' }));
    expect(screen.getByTestId('wealth-chart')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Account balances' }));
    expect(screen.getByTestId('balance-chart')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'RMD Projections' }));

    expect(screen.getByLabelText('Traditional IRA 1 — prior December 31 balance')).toHaveValue('$2,000,000');
    expect(screen.getByTestId('conversion-table')).toBeInTheDocument();
  });

  it('recalculates the summary when the return changes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    const before = stat('Peak annual RMD').textContent;
    const rate = screen.getByLabelText('Annual expected return');
    await user.clear(rate);
    await user.type(rate, '2');
    expect(stat('Peak annual RMD').textContent).not.toBe(before);
  });

  it('computes a weighted return from a stock/bond mix', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    await user.click(screen.getByRole('button', { name: 'Stock / bond mix' }));
    // Defaults: 60% × 7.5% + 40% × 4% = 6.10%
    expect(screen.getByTestId('weighted-return')).toHaveTextContent('6.10%');
  });

  it('switches the chart series and caption', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    expect(screen.getByTestId('chart-caption')).toHaveTextContent(/^Required RMDs/);
    await user.click(screen.getByRole('button', { name: 'Taxable IRA Distributions' }));
    expect(screen.getByRole('button', { name: 'Taxable IRA Distributions' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('chart-caption')).toHaveTextContent(/^Taxable IRA distributions/);
  });

  it('shows QCDs reducing taxable distributions but not the required RMD', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    // Default recurring QCD: $20,000/yr from the first eligible age.
    await user.click(screen.getByRole('button', { name: 'Add recurring QCD' }));
    await user.click(screen.getByRole('button', { name: 'Open year detail' }));
    const detail = screen.getByTestId('year-detail');
    const cells = (label: string) =>
      within(detail).getByRole('rowheader', { name: label }).parentElement!.querySelectorAll('td');
    const money = (el: Element) => Number(el.textContent!.replace(/[$,]/g, ''));
    const required = cells('Required RMD this calendar year');
    const taxable = cells('Taxable IRA distribution');
    expect(money(cells('QCD')[1]!)).toBe(20_000);
    // Strategy column: taxable = required − QCD (to rounding).
    expect(Math.abs(money(required[1]!) - money(taxable[1]!) - 20_000)).toBeLessThanOrEqual(1);
    // Baseline column: no QCD, so taxable = required.
    expect(money(required[0]!)).toBe(money(taxable[0]!));
  });

  it('opens a year detail panel and steps between years', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    await user.click(screen.getByRole('button', { name: 'Open year detail' }));
    const detail = screen.getByTestId('year-detail');
    expect(within(detail).getByRole('heading')).toHaveTextContent('age 73');
    expect(within(detail).getByText('Distribution period (Uniform Lifetime Table)')).toBeInTheDocument();
    await user.click(within(detail).getByRole('button', { name: 'Next year' }));
    expect(within(screen.getByTestId('year-detail')).getByRole('heading')).toHaveTextContent('age 74');
    await user.click(screen.getByRole('button', { name: 'Close year detail' }));
    expect(screen.queryByTestId('year-detail')).not.toBeInTheDocument();
  });

  it('opens and closes the methodology panel', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    await user.click(screen.getAllByRole('button', { name: 'Methodology' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'Methodology' });
    expect(within(dialog).getByText('Annual calculation order')).toBeInTheDocument();
    expect(within(dialog).getByTestId('limitations').children.length).toBeGreaterThan(5);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reset restores the default scenario', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    const balance = screen.getByLabelText('Traditional IRA 1 — prior December 31 balance');
    await user.clear(balance);
    await user.type(balance, '5');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Traditional IRA 1 — prior December 31 balance')).toHaveValue('$1,400,000');
  });

  it('shows a clear message for an invalid ending age', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    const end = screen.getByLabelText("Projection ending age (client's age)");
    await user.clear(end);
    await user.type(end, '60');
    expect(screen.getByTestId('input-errors')).toHaveTextContent(/ending age must be at least/i);
  });

  it('adds and removes Traditional IRAs', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expandInputs(user);
    await user.click(screen.getByRole('button', { name: 'Add Traditional IRA' }));
    expect(screen.getByLabelText('Traditional IRA 3 — prior December 31 balance')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Traditional IRA 3' }));
    expect(screen.queryByLabelText('Traditional IRA 3 — prior December 31 balance')).not.toBeInTheDocument();
  });
});
