# RMD Smoothing Analyzer

A web app for financial advisors that shows a client what a multi-year Roth
conversion plan does to their taxes now, their taxes later, and what they and their
heirs end up with, compared with doing nothing. Future Required Minimum Distributions
(RMDs) are one of the outputs.

It answers:

- What does the conversion plan look like year by year: income, federal bracket, tax?
- What tax is paid now versus avoided later, and what is the breakeven?
- How large could future RMDs get, and how fast do they grow?

Lower RMDs and conversions are not automatically better. The app compares results
neutrally and does not make recommendations.

**Build plan:** 1) tax engine, bracket view, fill-to-bracket conversions (done);
2) taxable account for unneeded RMDs, how conversion taxes are paid (withheld, taxable
account, or cash), after-tax wealth and breakeven age (done); 3) spouses and the
survivor's switch to single filing; 4) heirs under the 10-year rule.

> Hypothetical illustration only. Not a recommendation, forecast, or tax advice.

## How to open it

- **Live site:** see "Deployment status" below.
- **On your own computer (for a developer):** install Node.js 20+, then run
  `npm install` and `npm run dev`, and open the address it prints.

Nothing you type is stored or sent anywhere. All calculations run in your browser,
and refreshing the page resets to the default hypothetical client.

## What the app does

**Inputs:** date of birth; each account's prior December 31 balance (more than one
Traditional IRA allowed, plus a Roth IRA); projection ending age (default 95);
annual return, entered as one rate or as a stock/bond mix; optional Roth IRA
contributions; optional pre-tax Traditional IRA contributions (with a "deductible"
checkbox); optional extra pre-tax withdrawals; and an option to delay the first RMD
to April 1 of the next year.

**Household income & taxes:** filing status (single or married filing jointly, with
the spouse's date of birth), Social Security benefits and the age they start,
pensions/wages/interest, qualified dividends and gains, tax-exempt interest, itemized
deductions, a flat state tax rate, inflation, the heirs' tax rate, and a discount rate
(by default the investment return). All amounts are entered in today's dollars.

**Taxable account, cash & spending:** taxable brokerage balance, its cost basis, and
dividend yield; cash and its interest rate; and how much of the IRA withdrawals the
client spends each year. RMD money left after tax and spending is invested in the
taxable account.

**Planning levers** (side panel on desktop, "Inputs & planning levers" button on a phone):
- **Investment returns.** Everything updates immediately.
- **Roth conversions.** Either a fixed amount for a range of ages (then edit or
  delete single years), or **fill to a bracket**: each year converts as much as fits
  under the top of the chosen bracket, optionally also staying within an IRMAA tier.
  Choose how the conversion tax is paid: from the taxable account, from cash, or
  withheld from the conversion (falls back to the next source if one runs short). Any conversion that would use RMD dollars is blocked or
  reduced, with a message explaining why.
- **QCDs.** Recurring (amount, from age, through age) and one-time gifts. Age 70½
  eligibility and the annual limit are enforced. QCDs count toward the RMD first.

**Key findings:** three to five plain-English sentences at the top: how large RMDs
get and how fast, what the strategy changes, when income is taxed, the estimated tax
trade-off with its breakeven rate, and IRMAA years.

**Tab 1, RMD Projections:** one bar per year (by age or calendar year). Switch
between *Required RMDs* and *Taxable IRA Distributions*. A "No strategy" baseline
(same inputs, no conversions or QCDs) appears beside each bar, shown with a striped
pattern. Conversions can be shown as a separate line. Click or tap a year for a full
breakdown, baseline versus strategy. A year-by-year table is available.

**Tab 2, Tax Brackets:** taxable income each year with the conversion shown on top,
against the top of each federal bracket, plus a year-by-year plan table: conversion,
taxable income, bracket, rate on the next dollar, federal and state tax, IRMAA tier,
and the change from no strategy.

**Tab 3, IRMAA:** estimated MAGI each year, strategy against no strategy, with the
IRMAA tier thresholds that apply two years later.

**Tab 4, Wealth:** after-tax value each year (Roth + taxable + cash + pre-tax after
the heirs' tax rate), strategy against no strategy, with the breakeven age marked; or
account balances (Traditional, Roth, taxable, cash, total).

**Tax trade-off:** federal, state, and IRMAA costs with and without the strategy;
tax paid earlier versus avoided later (including heirs' tax on the pre-tax balance
left), in dollars and present value; and the breakeven heirs' tax rate.

**Compare strategies:** save up to four named sets of levers and compare them side
by side on the current client. Saved strategies live only in the open page.

**Header:** Present (hides the inputs for screen-sharing with a client), Print
summary (a printable client handout with the disclosures), Methodology, and Reset.
Disclosures appear on every view and cannot be turned off.

## Methodology (summary)

Each year, for every scenario:

1. Start with the prior December 31 balance.
2. Required RMD = prior December 31 balance ÷ Uniform Lifetime Table factor.
3. Apply QCDs (they count toward the RMD first).
4. Take the rest of the RMD as a taxable distribution.
5. Apply extra withdrawals.
6. Apply Roth conversions (only after the RMD is satisfied).
7. Add contributions.
8. Apply the year's return to what remains.
9. Record the December 31 balance.

Balances are never rounded mid-calculation; only displayed numbers are rounded.

Deductible IRA contributions for years on or after age 70½ make an equal amount of
later QCDs taxable (the QCD still counts toward the RMD).

**Federal tax:** each year is estimated from the 2026 brackets (IRS Rev. Proc.
2025-32): taxable Social Security, the larger of standard (plus age-65 additions) or
itemized deductions, the 2025–2028 senior deduction and its phase-out, 0/15/20% rates
on qualified income, and the 3.8% NIIT. State tax is a flat rate. Later years are
indexed at the inflation rate entered.

**Tax trade-off:** taxes with and without the strategy, year by year, plus the
heirs' rate times the pre-tax balance left at the end. The breakeven is the heirs'
rate at which the present-value totals are equal.

**Cash flows:** each year the tax caused by IRA income, conversions, and the taxable
and cash accounts (total tax minus tax on the entered income alone) is paid from RMD
cash first; the conversion's share is paid from the source chosen. Leftover RMD cash
is invested. Spending RMDs don't cover comes from the taxable account, then cash, then
the Roth IRA. Taxable-account dividends are taxed yearly; selling realizes gains,
which are taxed in the same year.

**After-tax value and breakeven age:** after-tax value = Roth + taxable + cash +
pre-tax × (1 − heirs' rate). The breakeven age is the first age from which the
strategy stays at or above no strategy.

**IRMAA:** MAGI = AGI + tax-exempt interest; it sets premiums two years later for each
person 65 or older. 2026 thresholds and surcharges are published figures; later years
are projected at the inflation rate entered.

RMD start age: born before 7/1/1949 → 70½; 7/1/1949–1950 → 72; 1951–1959 → 73
(1959 per the 2024 proposed regulations); 1960 or later → 75. Full sources and
verification notes are in [`docs/research.md`](docs/research.md).

## Supported accounts

| Account | Phase 1 | Rules applied |
|---|---|---|
| Traditional IRA (one or more) | Yes | RMD per IRA, total may come from any IRA (modeled pro rata) |
| Roth IRA | Yes | No lifetime RMDs; receives conversions and contributions |
| 401(k), 403(b), SEP, SIMPLE, Roth 401(k) | Not yet | The engine already holds their rules; the app doesn't offer them yet |

## Known limitations

- One person's IRAs only. A spouse can be entered for joint filing, but the spouse's
  IRAs, the first death, and single filing for the survivor come in build step 3.
  The Joint and Last Survivor Table is not used.
- Heirs are one tax rate on the pre-tax balance left; the 10-year rule comes in step 4.
- Other entered income pays its own tax and isn't spent from the modeled accounts.
  The taxable account earns the IRA return; dividends are all qualified; Roth
  withdrawals for spending are assumed tax-free.
- After-tax value is a legacy view (pre-tax at the heirs' rate, taxable gains
  stepped up), not what the client would net by cashing out in one year.
- Traditional and Roth IRAs only. The still-working exception is not modeled.
- Out of scope: inherited accounts, non-spouse beneficiaries, the 10-year rule,
  death of a spouse during the projection, spousal rollovers.
- Assumes none of the current year's RMD has been taken yet. A prior-year first RMD
  deferred into this year is not modeled.
- One constant return for every account in every year; no sequence-of-returns risk.
- All flows happen before the year's growth, which slightly understates growth.
- Withdrawals and conversions are taken pro rata across Traditional IRAs.
- QCDs are annual. In the 70½ year they must be made on or after the 70½ date. The
  one-time split-interest QCD is not modeled. Limits after 2026 use an editable
  assumed value, held flat by default.
- Federal tax is a simplified estimate: no credits, AMT, QBI deduction, or the 10%
  early-distribution penalty. State tax is one flat rate. Tax law after 2026 is
  projected from current law. Balance totals are pre-tax.
- Entered income grows with inflation every year (pensions without COLAs are
  overstated later).
- The tax comparison counts QCD gifts as income not taxed but not the gifts
  themselves as a cost.
- IRMAA: married filing separately and appeals are not modeled; everyone on the
  return is assumed on Medicare from 65. Thresholds after 2026 are projections.
- Roth and Traditional contribution limits, deductibility, and five-year rules are
  not checked. Pre-tax contributions go to the first Traditional IRA.

## Testing

- `npm test`: 144 calculation and component tests, including IRS boundary cases,
  hand-calculated multi-year projections, hand-calculated federal tax cases (Social
  Security taxation, senior deduction, capital-gains stacking, NIIT), fill-to-bracket
  conversions, the QCD contribution offset, IRMAA tiers and indexing, a
  hand-calculated tax comparison, and hand-calculated cash flows (paying conversion
  tax from each source, realized gains settling, unneeded RMDs invested, Roth covering
  spending, IRMAA paid two years later, after-tax value and breakeven age).
- `npm run test:e2e`: browser tests on desktop Chrome and an emulated iPhone 13
  viewport (iPhone screen size, touch, and user agent, but running in Chromium, not
  real Safari). Set `PW_WEBKIT=1` to add a real WebKit run where WebKit is installed,
  and `PW_BASE_URL=<url>` to test a deployed site.
- `npm run typecheck` and `npm run build`.

## How to redeploy

The site is hosted on Vercel and linked to this GitHub repository. Any change pushed
to the branch Vercel deploys from (currently `claude/rmd-smoothing-foundation-kc53hd`)
goes live automatically within about a minute.
To redeploy by hand: sign in at vercel.com, open the project, go to **Deployments**,
click **⋯** on the latest one, and choose **Redeploy**.

## Deployment status

Hosted on Vercel, connected to the GitHub repository `lhester99/F-Engine`. Vercel's
production branch is set to `claude/rmd-smoothing-foundation-kc53hd`, so every
change pushed to that branch goes live automatically. The live address is shown on
the project's page in Vercel (it ends in `.vercel.app`). It has not yet been
verified by an automated test.

## Project layout

```
src/calculations/  pure TypeScript math (projection engine, RMD rules, validation)
src/data/          IRS tables and dated limits (Uniform Lifetime Table, QCD limits, account rules)
src/strategies/    conversion and QCD schedule helpers
src/inputs/        input panels
src/charts/        Recharts charts and legends
src/components/    layout, summary, year detail, methodology
tests/             Vitest (calculations, components) and Playwright (e2e)
docs/research.md   sources and verification notes
```
