# RMD Smoothing Analyzer

A web app for financial advisors that projects a client's future Required Minimum
Distributions (RMDs). It shows how return assumptions, multi-year Roth conversions,
and Qualified Charitable Distributions (QCDs) change the size and path of those
distributions.

It answers three questions:

1. How large could future RMDs get?
2. How fast do they grow?
3. How can conversions, QCDs, and return assumptions manage that path?

Lower RMDs are not automatically better. The app compares results neutrally and
does not make recommendations.

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

**Tax & IRMAA assumptions:** filing status (single or joint), how many people are on
Medicare, one "other income" amount (pensions, taxable Social Security, interest,
and so on, entered, never calculated), inflation, two assumed tax rates (on income
the strategy adds and on income it avoids), and a discount rate (by default the
investment return).

**Planning levers** (side panel on desktop, "Inputs & planning levers" button on a phone):
- **Investment returns.** Everything updates immediately.
- **Roth conversions.** Fill a range of ages with an amount, then edit or delete
  single years. Optional tax withholding. Any conversion that would use RMD dollars
  is blocked or reduced, with a message explaining why.
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

**Tab 2, Income & IRMAA:** estimated MAGI each year, strategy against no strategy,
with the IRMAA tier thresholds that apply two years later.

**Tab 3, Account Balances:** Traditional, Roth, and total December 31 balances,
strategy (solid lines) versus no strategy (dashed lines).

**Trade-offs:** estimated income tax on income added and avoided, in dollars and
present value; the breakeven tax rate; and IRMAA surcharge years and totals for both.
These are estimates at the rates you enter, not tax calculations.

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

**Tax trade-off:** each year's change in taxable IRA income (taxable distributions
plus conversions) is taxed at the "added" or "avoided" rate. The pre-tax balance
left at the end counts too. The breakeven is the avoided rate at which the
present-value difference is zero. With equal rates and the default discount rate,
a conversion comes out tax-neutral, which is the standard result.

**IRMAA:** estimated MAGI = other income (grown with inflation) + taxable IRA
distributions + conversions − deductible IRA contributions; it sets premiums two
years later, from age 65. 2026 thresholds and surcharges are published figures;
later years are projected at the inflation rate entered.

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

- One person only. Spouses and the Joint and Last Survivor Table are not modeled
  yet; the Uniform Lifetime Table is always used.
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
- Taxes are estimates at two entered rates, not a tax calculation: no brackets,
  deductions, Social Security taxation, or state rules. Balance totals are pre-tax.
- The tax comparison counts QCD gifts as income not taxed but not the gifts
  themselves as a cost.
- IRMAA uses one entered other-income figure. Married filing separately, appeals, and
  a spouse's separate Medicare timing are not modeled. Thresholds after 2026 are
  projections.
- Roth and Traditional contribution limits, deductibility, and five-year rules are
  not checked. Pre-tax contributions go to the first Traditional IRA.

## Testing

- `npm test`: 113 calculation and component tests, including IRS boundary cases,
  hand-calculated multi-year projections, the QCD contribution offset, IRMAA tiers
  and indexing, a hand-calculated tax comparison, and the conversion-neutrality check.
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
