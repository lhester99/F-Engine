# RMD Smoothing Analyzer

A web app for financial advisors that shows a client what a multi-year Roth
conversion plan does to their taxes now, their taxes later, and what they and their
heirs end up with, compared with doing nothing. Future Required Minimum Distributions
(RMDs) are one of the outputs.

It answers:

- What does the conversion plan look like year by year: income, federal bracket, tax?
- What tax is paid now versus avoided later, and what is the breakeven?
- How large could future RMDs get, and how fast do they grow?
- What happens to RMD money the client doesn't need, and what the survivor pays filing single?
- What do heirs keep from a large pre-tax IRA under the 10-year rule, versus Roth and taxable assets?

Lower RMDs and conversions are not automatically better. The app compares results
neutrally and does not make recommendations.

**Build plan:** 1) tax engine, bracket view, fill-to-bracket conversions (done);
2) taxable account for unneeded RMDs, how conversion taxes are paid (withheld, taxable
account, or cash), after-tax wealth and breakeven age (done); 3) spouses and the
survivor's switch to single filing (done); 4) heirs under the 10-year rule (done).

> Hypothetical illustration only. Not a recommendation, forecast, or tax advice.

## How to open it

- **Live site:** see "Deployment status" below.
- **On your own computer (for a developer):** install Node.js 20+, then run
  `npm install` and `npm run dev`, and open the address it prints.

Nothing you type is stored or sent anywhere. All calculations run in your browser,
and refreshing the page resets to the default hypothetical client.

## What the app does

The side panel (on a phone, the "Inputs & planning levers" button) has three parts:

**Client & household** (set once; shows a short summary until you click **Edit**):
each person's date of birth, Social Security and the age it starts, Traditional IRA
balances (more than one allowed) and Roth IRA balance as of the prior December 31; the
projection ending age; pensions, wages, and interest; qualified dividends and gains;
taxable account and cash balances; and how much of the IRA withdrawals the client
spends each year (the rest, after tax, is invested in the taxable account). With a
spouse more than 10 years younger, a "sole beneficiary" box appears. **More details**
holds the rarely used inputs: tax-exempt interest, itemized deductions, pre-tax and
Roth contributions, extra pre-tax withdrawals, delaying the first RMD to April 1, and
modeling the first death (who dies first, at what age, and how much income and
spending continue for the survivor). All amounts are in today's dollars.

**Planning levers** (everything updates immediately):
- **Roth conversions.** Either a fixed amount for a range of ages (then edit or
  delete single years), or **fill to a bracket**: each year converts as much as fits
  under the top of the chosen bracket, optionally also staying within an IRMAA tier.
  Choose how the conversion tax is paid: from the taxable account, from cash, or
  withheld from the conversion (falls back to the next source if one runs short). Any conversion that would use RMD dollars is blocked or
  reduced, with a message explaining why.
- **QCDs.** Recurring (amount, from age, through age) and one-time gifts. Age 70½
  eligibility and the annual limit are enforced. QCDs count toward the RMD first.
- **Investment returns.** One rate, or a stock/bond mix.

**Assumptions** (one section with a summary line): inflation, a flat state tax rate,
the discount rate for present values (by default the investment return), heirs (one
tax rate, or estimated from the heirs' own income, number, filing status, and state
rate), and the taxable account's cost basis and dividend yield and the cash interest
rate. A group with an input error opens by itself.

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

**Tab 5, Heirs:** what heirs inherit with and without the strategy (pre-tax IRA,
Roth IRA, taxable and cash), the inherited IRA withdrawn over 10 years, heirs' tax and
average rate, the highest bracket an heir reaches (when estimated from their income),
and what heirs keep in present value. The chart shows each year of the 10-year window,
against the heirs' bracket lines when estimated from their income.

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
2. Required RMD = prior December 31 balance ÷ Uniform Lifetime Table factor (or the Joint
   and Last Survivor Table factor when the spouse is the sole beneficiary and more than 10
   years younger).
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
on qualified income, and the 3.8% NIIT (on dividends, gains, and cash-account interest;
IRA income is never subject to it). The age-65 additions follow the IRS rule that a
person is 65 on the day before their 65th birthday. State tax is a flat rate. Later years are
indexed at the inflation rate entered.

**Tax trade-off:** taxes with and without the strategy, year by year, plus heirs'
tax on the pre-tax balance left at the end. The breakeven is the flat heirs' rate at
which the present-value totals are equal.

**Heirs and the 10-year rule:** heirs inherit at the end of the projection. The
inherited pre-tax IRA keeps growing at the investment return and is withdrawn evenly
(year k takes the balance ÷ (11 − k)), so it is empty after 10 years; this meets the
annual RMDs required in years 1–9 for heirs 81 or younger in the first year after the death. Heirs' tax is
either the rate entered, or each heir's extra federal tax on their share stacked on
their own income (current brackets, indexed), plus a flat state rate. The Roth IRA
passes tax-free; the taxable account gets a step-up in basis.

**Spouses and the first death:** each spouse's RMDs use their own IRAs and age;
the couple files jointly. Conversions are sized after both spouses' RMDs are known.
In the death year the couple still files jointly and the deceased's full RMD is taken.
From the next January the survivor rolls the IRAs into their own (RMDs on the
survivor's own age), files single, and keeps the larger Social Security benefit.

**Cash flows:** each year the tax caused by IRA income, conversions, and the taxable
and cash accounts (total tax minus tax on the entered income alone) is paid from RMD
cash first; the conversion's share is paid from the source chosen. Leftover RMD cash
is invested. Spending RMDs don't cover comes from the taxable account, then cash, then
the Roth IRA. Taxable-account dividends are taxed yearly; selling realizes gains,
which are taxed in the same year.

**After-tax value and breakeven age:** after-tax value = Roth + taxable + cash +
pre-tax × (1 − heirs' rate, or their estimated average rate). The breakeven age is the first age from which the
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

- The Joint and Last Survivor Table applies when the spouse is more than 10 years
  younger and the "sole beneficiary" box (shown only for such couples) is checked. The
  app can't check the actual beneficiary designations.
- First death: always a spousal rollover; one death only; Social Security survivor
  benefit simplified to the larger of the two entered benefits.
- Heirs: everyone is a non-spouse heir under the 10-year rule, inheriting at the end
  of the projection and withdrawing evenly. Eligible designated beneficiaries (minor
  children, disabled or chronically ill heirs, heirs not more than 10 years younger),
  trusts as beneficiaries, and estate tax are not modeled. Heirs estimated from income
  share equally and have the same income and filing status; standard deduction only.
- Other entered income pays its own tax and isn't spent from the modeled accounts.
  The taxable account earns the IRA return; dividends are all qualified; Roth
  withdrawals for spending are assumed tax-free.
- After-tax value is a legacy view (pre-tax at the heirs' rate, taxable gains
  stepped up), not what the client would net by cashing out in one year.
- Traditional and Roth IRAs only. The still-working exception is not modeled.
- Out of scope: accounts the client has already inherited.
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

- `npm test`: 192 calculation and component tests, including IRS boundary cases,
  hand-calculated multi-year projections, hand-calculated federal tax cases (Social
  Security taxation, senior deduction, capital-gains stacking, NIIT), fill-to-bracket
  conversions, the QCD contribution offset, IRMAA tiers and indexing, a
  hand-calculated tax comparison, and hand-calculated cash flows (paying conversion
  tax from each source, realized gains settling, unneeded RMDs invested, Roth covering
  spending, IRMAA paid two years later, after-tax value and breakeven age), and
  spouses (independent RMDs, joint deductions, the death-year RMD, spousal rollover
  RMDs on the survivor's age, single filing, survivor Social Security), and heirs
  (hand-calculated 10-year withdrawals, heirs' tax at a rate and from heirs' brackets).
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
src/data/          IRS tables and dated limits (Uniform Lifetime and Joint and Last Survivor tables, QCD limits, account rules)
src/strategies/    conversion and QCD schedule helpers
src/inputs/        input panels
src/charts/        Recharts charts and legends
src/components/    layout, summary, year detail, methodology
tests/             Vitest (calculations, components) and Playwright (e2e)
docs/research.md   sources and verification notes
```
