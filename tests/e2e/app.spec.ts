import { expect, test, type Page } from '@playwright/test';

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

async function openInputs(page: Page) {
  if (isMobile(page)) {
    const toggle = page.getByRole('button', { name: 'Inputs & planning levers' });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
}

async function expectNoHorizontalScroll(page: Page) {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

const stat = (page: Page, label: string) => page.getByTestId('summary-stats').locator('div', { hasText: label }).first();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'RMD Smoothing Analyzer' })).toBeVisible();
});

test('loads with the chart rendered and no horizontal scroll', async ({ page }) => {
  await expect(page.getByText('Model future required distributions and evaluate smoothing strategies.')).toBeVisible();
  await expect(page.getByTestId('rmd-chart').locator('.recharts-bar-rectangle').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('client inputs recalculate the projection', async ({ page }) => {
  await openInputs(page);
  const peak = stat(page, 'Peak annual RMD');
  const before = await peak.textContent();

  const balance = page.getByLabel('Traditional IRA 1 — prior December 31 balance');
  await balance.fill('3000000');
  await balance.blur();
  await expect(balance).toHaveValue('$3,000,000');
  await expect(peak).not.toHaveText(before!);

  // Invalid input shows an instant message.
  await balance.fill('-10');
  await expect(page.getByText('Must be at least $0.')).toBeVisible();
  await balance.fill('1400000');

  await page.getByLabel('Date of birth').fill('1960-03-10');
  await expect(page.getByText(/RMDs begin at 75 \(2035\)/)).toBeVisible();

  await page.getByLabel('Projection ending age').fill('90');
  await expect(page.getByTestId('rmd-chart')).toBeVisible();

  await page.getByRole('button', { name: 'Add Traditional IRA' }).click();
  await page.getByLabel('Traditional IRA 3 — prior December 31 balance').fill('100000');
  await page.getByRole('button', { name: 'Remove Traditional IRA 3' }).click();
  await expect(page.getByLabel('Traditional IRA 3 — prior December 31 balance')).toHaveCount(0);

  await page.getByLabel('Roth IRA — prior December 31 balance').fill('200000');
  await page.getByLabel('Annual Roth contribution').fill('8000');
  await page.getByLabel('Contribute through age').fill('72');
  await page.getByLabel('Per year').first().fill('10000');
  await page.getByLabel('From age').first().fill('70');
  await page.getByLabel('Through age').first().fill('80');
  await expectNoHorizontalScroll(page);
});

test('April 1 deferral creates a two-RMD year', async ({ page }) => {
  await openInputs(page);
  await page.getByLabel('Date of birth').fill('1956-06-15');
  await page.getByRole('checkbox', { name: /Delay first RMD/ }).check();
  await page.getByRole('button', { name: 'Open year detail' }).click();
  const detail = page.getByTestId('year-detail');
  await detail.getByLabel('Select year').selectOption('2030');
  await expect(detail.getByRole('rowheader', { name: 'Prior-year RMD deferred to April 1' })).toBeVisible();
});

test('return assumptions: single rate and stock/bond mix', async ({ page }) => {
  await openInputs(page);
  const peak = stat(page, 'Peak annual RMD');
  const before = await peak.textContent();
  await page.getByLabel('Annual expected return').fill('3');
  await expect(peak).not.toHaveText(before!);
  await page.getByRole('button', { name: 'Stock / bond mix' }).click();
  await page.getByLabel('Stocks', { exact: true }).fill('50');
  await page.getByLabel('Stock return').fill('8');
  await page.getByLabel('Bond return').fill('4');
  await expect(page.getByTestId('weighted-return')).toContainText('6.00%');
  await page.getByRole('button', { name: 'Single rate' }).click();
  await expect(page.getByLabel('Annual expected return')).toBeVisible();
});

test('Roth conversion schedule: fill, edit, delete, block, clear', async ({ page }) => {
  await openInputs(page);
  await page.getByTestId('conv-start').fill('70');
  await page.getByTestId('conv-end').fill('74');
  await page.getByTestId('conv-amount').fill('100000');
  await page.getByRole('button', { name: 'Apply to range' }).click();
  const table = page.getByTestId('conversion-table');
  await expect(table.locator('tbody tr')).toHaveCount(5);

  await page.getByLabel('Conversion amount for age 71 (2027)').fill('150000');
  await page.getByRole('button', { name: 'Delete conversion for age 72 (2028)' }).click();
  await expect(table.locator('tbody tr')).toHaveCount(4);

  await page.getByLabel('Pay the conversion tax from').selectOption('withhold');

  // An oversized conversion in an RMD year is limited with a message.
  await page.getByTestId('conv-start').fill('80');
  await page.getByTestId('conv-end').fill('80');
  await page.getByTestId('conv-amount').fill('99000000');
  await page.getByRole('button', { name: 'Apply to range' }).click();
  await expect(page.getByTestId('conversion-messages')).toContainText('exceeds');
  await expect(table.getByText('Limited')).toBeVisible();

  // Conversions show as a separate series that can be hidden.
  await expect(page.getByText('Roth conversions (not RMDs)')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Show Roth conversions' }).uncheck();
  await expect(page.getByText('Roth conversions (not RMDs)')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.getByText('No conversions scheduled.')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('QCDs: recurring and one-time, with limit and age checks', async ({ page }) => {
  await openInputs(page);
  await page.getByRole('button', { name: 'Add recurring QCD' }).click();
  await page.getByTestId('qcd-rec-amount-0').fill('150000');
  await expect(page.getByTestId('qcd-messages')).toContainText('exceeds the');
  await page.getByTestId('qcd-rec-amount-0').fill('25000');
  await page.getByTestId('qcd-rec-start-0').fill('68');
  await expect(page.getByTestId('qcd-messages')).toContainText('70½');
  await page.getByTestId('qcd-rec-start-0').fill('71');
  await page.getByTestId('qcd-rec-end-0').fill('85');

  await page.getByRole('button', { name: 'Add one-time QCD' }).click();
  await page.getByTestId('qcd-one-age-0').fill('80');
  await page.getByTestId('qcd-one-amount-0').fill('50000');
  await page.getByTestId('qcd-future-limit').fill('120000');

  await page.getByRole('button', { name: 'Taxable IRA Distributions' }).click();
  await expect(page.getByTestId('chart-caption')).toContainText('Taxable IRA distributions');

  await page.getByRole('button', { name: 'Remove one-time QCD 1' }).click();
  await page.getByRole('button', { name: 'Remove recurring QCD 1' }).click();
  await expect(page.getByTestId('qcd-messages')).toHaveCount(0);
});

test('chart: axis toggle, click/tap a bar for details, table view', async ({ page }) => {
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await expect(page.getByTestId('rmd-chart').getByText(/^20\d\d$/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Age', exact: true }).click();

  // Default client (born 1956) has RMDs from 2029; baseline bars render first, one per RMD year.
  const target = page.getByTestId('rmd-chart').locator('.recharts-bar-rectangle').nth(12);
  if (isMobile(page)) await target.tap();
  else {
    await target.hover();
    await expect(page.getByText('Click or tap for year details')).toBeVisible();
    await target.click();
  }
  const detail = page.getByTestId('year-detail');
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading')).toContainText('2041');
  await expect(detail.getByRole('rowheader', { name: 'Distribution period (Uniform Lifetime Table)' })).toBeVisible();
  const heading = await detail.getByRole('heading').textContent();
  await detail.getByRole('button', { name: 'Next year' }).click();
  await expect(detail.getByRole('heading')).not.toHaveText(heading!);
  await detail.getByRole('button', { name: 'Previous year' }).click();
  await expect(detail.getByRole('heading')).toHaveText(heading!);
  await detail.getByRole('button', { name: 'Close year detail' }).click();
  await expect(detail).toHaveCount(0);

  await page.getByRole('button', { name: 'Show year-by-year table' }).click();
  await expect(page.getByTestId('year-table')).toBeVisible();
  await page.getByRole('button', { name: 'Hide year-by-year table' }).click();
  await expectNoHorizontalScroll(page);
});

test('account balances tab keeps inputs and toggles the baseline', async ({ page }) => {
  await openInputs(page);
  await page.getByTestId('conv-amount').fill('75000');
  await page.getByRole('button', { name: 'Apply to range' }).click();
  await page.getByRole('tab', { name: 'Wealth' }).click();
  await expect(page.getByTestId('wealth-chart').locator('.recharts-line').first()).toBeVisible();
  await page.getByRole('button', { name: 'Account balances' }).click();
  await expect(page.getByTestId('balance-chart').locator('.recharts-line').first()).toBeVisible();
  await expect(page.getByText('Roth IRA, no strategy')).toBeVisible();
  // Tap/click a point on the balance chart opens that year.
  const chart = page.getByTestId('balance-chart');
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  const n = 2051 - new Date().getFullYear() + 1; // years in the default projection
  const x = box.x + 56 + ((box.width - 56 - 12) * 5) / (n - 1);
  const y = box.y + box.height / 2;
  if (isMobile(page)) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await expect(page.getByTestId('year-detail').getByRole('heading')).toContainText(String(new Date().getFullYear() + 5));
  await page.getByRole('checkbox', { name: 'Show no-strategy lines' }).uncheck();
  await expect(page.getByText('Roth IRA, no strategy')).toHaveCount(0);
  await page.getByRole('tab', { name: 'RMD Projections' }).click();
  await expect(page.getByTestId('conversion-table').locator('tbody tr')).toHaveCount(5);
  await expectNoHorizontalScroll(page);
});

test('methodology panel and reset', async ({ page }) => {
  await page.getByRole('button', { name: 'Methodology' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Methodology' });
  await expect(dialog.getByText('Annual calculation order')).toBeVisible();
  await expect(dialog.getByTestId('limitations')).toContainText('Joint and Last Survivor');
  await dialog.getByRole('button', { name: 'Close methodology' }).click();
  await expect(dialog).toHaveCount(0);

  await openInputs(page);
  await page.getByLabel('Traditional IRA 1 — prior December 31 balance').fill('5');
  await page.getByRole('button', { name: 'Reset' }).click();
  await openInputs(page);
  await expect(page.getByLabel('Traditional IRA 1 — prior December 31 balance')).toHaveValue('$1,400,000');
});

test('sidebar sections collapse and expand', async ({ page }) => {
  await openInputs(page);
  const sectionBtn = page.getByRole('button', { name: 'Investment returns' });
  await sectionBtn.click();
  await expect(sectionBtn).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Annual expected return')).toBeHidden();
  await sectionBtn.click();
  await expect(page.getByLabel('Annual expected return')).toBeVisible();
});

test('findings, trade-offs, and assumptions respond to the strategy', async ({ page }) => {
  await openInputs(page);
  await expect(page.getByTestId('finding-strategy')).toContainText('No Roth conversions or QCDs');
  await page.getByRole('button', { name: 'Apply to range' }).click();
  await page.getByRole('button', { name: 'Add recurring QCD' }).click();
  await expect(page.getByTestId('finding-tax')).toContainText('The strategy adds about');
  const summary = page.getByTestId('tax-summary');
  const before = await summary.textContent();
  await page.getByTestId('state-rate').fill('5');
  await expect(summary).not.toHaveText(before!);
  await page.getByTestId('heirs-rate').fill('32');
  await page.getByRole('button', { name: 'Add spouse' }).click();
  await page.getByLabel('Spouse date of birth').fill('1958-02-02');
  await page.getByTestId('ss-benefit').fill('48000');
  await page.getByTestId('ss-age').fill('70');
  await page.getByTestId('other-income').fill('30000');
  await page.getByTestId('qualified-income').fill('8000');
  await page.getByTestId('tax-exempt').fill('2000');
  await page.getByTestId('itemized').fill('40000');
  await page.getByTestId('inflation').fill('3');
  await page.getByRole('checkbox', { name: /Discount at the investment return/ }).uncheck();
  await page.getByTestId('discount-rate').fill('5');
  await expect(page.getByTestId('tradeoffs')).toContainText('Present value at 5.0% a year');
  await page.getByTestId('trad-contribution').fill('7000');
  await page.getByTestId('trad-contribution-age').fill('75');
  await page.getByRole('checkbox', { name: 'Contributions are tax-deductible' }).uncheck();
  await expectNoHorizontalScroll(page);
});

test('IRMAA tab: chart and tap/click year detail with MAGI', async ({ page }) => {
  await page.getByRole('tab', { name: 'IRMAA' }).click();
  const chart = page.getByTestId('income-chart');
  await expect(chart.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  const n = 2051 - new Date().getFullYear() + 1;
  // Centre of the 4th band (index 3).
  const x = box.x + 56 + ((box.width - 56 - 8) * 3.5) / n;
  const y = box.y + box.height / 2;
  if (isMobile(page)) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  const detail = page.getByTestId('year-detail');
  await expect(detail.getByRole('heading')).toContainText(String(new Date().getFullYear() + 3));
  await expect(detail.getByRole('rowheader', { name: 'Estimated MAGI (for IRMAA)' })).toBeVisible();
  await expect(detail.getByRole('rowheader', { name: 'Federal bracket' })).toBeVisible();
  await expect(detail.getByRole('rowheader', { name: /IRMAA tier for \d{4} premiums/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('compare strategies: save, load, delete', async ({ page }) => {
  await openInputs(page);
  await page.getByRole('button', { name: 'Apply to range' }).click();
  await page.getByLabel('Strategy name').fill('Convert 50K');
  await page.getByRole('button', { name: 'Save current' }).click();
  const table = page.getByTestId('compare-table');
  await expect(table.getByRole('columnheader', { name: /Convert 50K/ })).toBeVisible();
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.getByRole('button', { name: 'Load Convert 50K' }).click();
  await expect(page.getByTestId('conversion-table').locator('tbody tr')).toHaveCount(5);
  await page.getByRole('button', { name: 'Delete Convert 50K' }).click();
  await expect(table.getByRole('columnheader', { name: /Convert 50K/ })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test('presentation mode and print summary', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed++;
    };
  });
  await page.reload();
  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page.getByRole('button', { name: 'Exit presentation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inputs & planning levers' })).toBeHidden();
  await expect(page.getByTestId('findings')).toBeVisible();
  await expect(page.getByTestId('disclosures')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Exit presentation' }).click();
  await page.getByRole('button', { name: 'Print summary' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
});

test('fill-to-bracket conversions and the Tax Brackets tab', async ({ page }) => {
  await openInputs(page);
  await page.getByRole('button', { name: 'Fill to a bracket' }).click();
  await page.getByLabel('Fill to top of').selectOption('0.24');
  await page.getByLabel('Also stay within').selectOption('2');
  await page.getByRole('button', { name: 'Apply to range' }).click();
  await expect(page.getByTestId('fill-rules')).toContainText('Fill to 24%, ages 70–74, IRMAA tier 2 or lower');
  await page.getByRole('tab', { name: 'Tax Brackets' }).click();
  await expect(page.getByTestId('bracket-chart').locator('.recharts-bar-rectangle').first()).toBeVisible();
  // The first year's conversion cell holds the amount the rule computed.
  const firstConversion = page.getByTestId('plan-table').locator('tbody tr').first().locator('td').first();
  await expect(firstConversion).toHaveText(/^\$[1-9][\d,]*$/);
  await expect(page.getByTestId('finding-brackets')).toContainText('federal bracket');
  await page.getByRole('button', { name: /Remove fill to 24% rule/ }).click();
  await expect(page.getByTestId('fill-rules')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test('taxable account, cash, spending, tax source, and the Wealth tab', async ({ page }) => {
  await openInputs(page);
  await page.getByTestId('spending').fill('30000');
  await page.getByTestId('taxable-balance').fill('400000');
  await page.getByTestId('taxable-basis').fill('300000');
  await page.getByTestId('taxable-yield').fill('1.5');
  await page.getByTestId('cash-balance').fill('20000');
  await page.getByTestId('cash-rate').fill('4');
  await page.getByRole('button', { name: 'Apply to range' }).click();
  for (const source of ['cash', 'withhold', 'taxable']) {
    await page.getByLabel('Pay the conversion tax from').selectOption(source);
    await expect(page.getByTestId('finding-wealth')).toContainText('after-tax value is');
  }
  await page.getByRole('tab', { name: 'Wealth' }).click();
  await expect(page.getByTestId('wealth-chart').locator('.recharts-line').first()).toBeVisible();
  await page.getByRole('button', { name: 'Account balances' }).click();
  await expect(page.getByText('Taxable account, strategy')).toBeVisible();
  await page.getByRole('button', { name: 'After-tax value' }).click();
  await expect(page.getByTestId('wealth-chart')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('spouse, first death, and survivor view', async ({ page }) => {
  await openInputs(page);
  await page.getByRole('button', { name: 'Add spouse' }).click();
  await page.getByLabel('Spouse date of birth').fill('1959-02-02');
  await page.getByTestId('spouse-ss').fill('22000');
  await page.getByTestId('spouse-ss-age').fill('67');
  await page.getByLabel('Spouse Traditional IRA 1 — prior December 31 balance').fill('600000');
  await page.getByRole('button', { name: 'Add spouse Traditional IRA' }).click();
  await page.getByRole('button', { name: 'Remove Spouse Traditional IRA 2' }).click();
  await page.getByTestId('balance-spouse-roth').fill('50000');
  await page.getByRole('checkbox', { name: /Model the first death/ }).check();
  await page.getByLabel('Who dies first').selectOption('client');
  await page.getByTestId('death-age').fill('84');
  await page.getByTestId('income-after').fill('60');
  await page.getByTestId('spending-after').fill('80');
  await expect(page.getByTestId('finding-survivor')).toContainText('the survivor files single');
  await page.getByRole('group', { name: 'Convert from' }).getByRole('button', { name: 'Spouse’s IRAs' }).click();
  await page.getByRole('button', { name: 'Apply to range' }).click();
  await page.getByRole('group', { name: 'QCDs from' }).getByRole('button', { name: 'Spouse’s IRAs' }).click();
  await page.getByRole('tab', { name: 'Tax Brackets' }).click();
  await expect(page.getByTestId('bracket-chart').getByText('First death')).toBeVisible();
  await expect(page.getByTestId('plan-table')).toContainText('Single');
  await page.getByRole('button', { name: 'Remove spouse', exact: true }).click();
  await expect(page.getByTestId('finding-survivor')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test('Heirs tab: 10-year rule comparison and bracket-based heirs tax', async ({ page }) => {
  await expect(page.getByTestId('finding-heirs')).toContainText('heirs would inherit');
  const tab = page.getByRole('tab', { name: 'Heirs' });
  await tab.scrollIntoViewIfNeeded();
  await tab.click();
  await expect(page.getByTestId('legacy-table')).toContainText('What heirs keep, present value');
  await expect(page.locator('[data-testid="heirs-chart"] .recharts-bar-rectangle').first()).toBeVisible();
  await openInputs(page);
  const income = page.getByRole('button', { name: "From heirs' income" });
  await income.scrollIntoViewIfNeeded();
  await income.click();
  await page.getByTestId('heirs-count').fill('1');
  await page.getByTestId('heirs-income').fill('250000');
  await expect(page.getByTestId('legacy-table')).toContainText('Highest federal bracket an heir reaches');
  await expect(page.getByTestId('finding-heirs')).toContainText('bracket for each heir');
  await expectNoHorizontalScroll(page);
});

test('Joint and Last Survivor Table for a spouse more than 10 years younger', async ({ page }) => {
  await openInputs(page);
  await page.getByRole('button', { name: 'Add spouse' }).click();
  await page.getByLabel('Spouse date of birth').fill('1966-02-02');
  await expect(page.getByTestId('joint-life-table')).toHaveCount(0);
  await page.getByLabel('Spouse date of birth').fill('1968-02-02');
  const sole = page.getByRole('checkbox', { name: /Spouse is the sole beneficiary of all of the client’s IRAs/ });
  await expect(sole).toBeChecked();
  const detailFor = async (y: string) => {
    const open = page.getByRole('button', { name: 'Open year detail' });
    if (await open.count()) {
      await open.scrollIntoViewIfNeeded();
      await open.click();
    }
    await page.getByLabel('Select year').selectOption(y);
    return page.getByTestId('year-detail');
  };
  await expect(await detailFor('2029')).toContainText('Distribution period, client (Joint and Last Survivor Table)');
  await sole.scrollIntoViewIfNeeded();
  await sole.uncheck();
  await expect(page.getByTestId('year-detail')).toContainText('Distribution period, client (Uniform Lifetime Table)');
  await expectNoHorizontalScroll(page);
});

test('a selected year can be cleared: same year again, Show all years, or Esc', async ({ page }) => {
  const bar = page.getByTestId('rmd-chart').locator('.recharts-bar-rectangle').nth(12);
  const select = async () => (isMobile(page) ? bar.tap() : bar.click());
  const detail = page.getByTestId('year-detail');

  await select();
  await expect(detail).toBeVisible();
  await select();
  await expect(detail).toHaveCount(0);

  await select();
  await page.getByTestId('show-all-years').click();
  await expect(detail).toHaveCount(0);
  await expect(page.getByTestId('show-all-years')).toHaveCount(0);

  if (!isMobile(page)) {
    await select();
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
  }
});
