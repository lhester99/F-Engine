# Engine F — v1 (Build-01)

A tactile, dark-mode financial planning toy. Drag sliders, watch a Monte Carlo
net-worth trajectory react live, and see federal + NC marginal tax bracket
creep tracked alongside it.

## Running it

No build step — it's plain HTML/CSS/JS, same shape as Emberfell.

1. Open a terminal in this folder
2. `python3 -m http.server 8080` (or any static file server)
3. Visit `http://localhost:8080`

Or just open `index.html` directly in a browser (audio may be blocked until
you click something, due to browser autoplay policy — this is expected and
handled gracefully).

## What's working

- **Income-driven cash flow** (`engine.js`) — the accumulation engine takes
  household (and spouse, MFJ) income, computes taxes, subtracts living
  expenses and every account contribution, and routes the surplus to the
  taxable brokerage. There is no "savings rate" input — savings is a result.
- **Budget spreadsheet + Cash flow tab** (`app.js`) — living expenses come
  from an itemized monthly budget (editable rows, add/remove categories); its
  total drives the whole model, and the main-tab expense field is read-only.
  A dedicated Cash flow tab charts **fun money** (each year's free cash ÷ 12 as
  monthly bars, red when negative) alongside a **cumulative uninvested-cash
  line** — a reminder of the idle cash pile that builds if surplus isn't
  invested (it plateaus at retirement, in today's dollars).
- **Freedom Point** — the headline "when can I retire?" answer: the earliest
  age where **90% of simulations survive**, solved by binary-searching the
  retirement age (success rises monotonically with it). Shown as a topbar
  "Freedom age" readout and a gliding green flag on the net-worth chart that
  slides to the new age as you drag sliders (red "NOT ON TRACK" when no age
  clears the bar). Solved on its own debounce so it never janks the controls.
- **Per-account contributions** — Traditional 401k, **Roth 401k**,
  Traditional IRA, Roth IRA, taxable, plus an **employer match** (rate up to
  a % of pay). Traditional 401k/IRA reduce current taxable income; Roth do
  not. The UI flags amounts over the age-aware 2026 IRS 401k/IRA limits
  (guidance only — never clamped).
- **Account-type model** — three buckets (Traditional / Roth / taxable).
  Retirement withdrawals are sequenced taxable → Traditional → Roth and
  taxed by type; Traditional is grossed up (Newton solve) so after-tax
  proceeds meet the spend, on top of any Social Security / RMD income.
- **Tax engine** — federal (progressive) + NC (flat), versioned by year
  (2025/2026, 2026 default) **and filing status** (Single / MFJ; MFJ derived
  as 2× single, exact except the top bracket). Bracket-creep detection runs
  on the real projected ordinary taxable income.
- **Social Security** — per-person benefit + claim age (today's dollars,
  grows with COLA). SS covers spend first; 85% counts as taxable income.
- **RMDs** — forced Traditional withdrawals from age 73/75 (by birth year)
  via the IRS Uniform Lifetime Table; excess over the spend need is
  reinvested. Drives late-retirement bracket creep and IRMAA.
- **Goals & debt** — timeline events: one-time spend, windfall/inheritance,
  or a recurring debt (mortgage) that drops off at a payoff age.
- **IRMAA cliff detection** — Medicare Part B tiers (2025, filing-status
  aware), SSA 2-year look-back, inflation-indexed thresholds. Tax panel
  shows cliff count, peak surcharge, and each crossing.
- **Hero chart** (`app.js`, canvas) — median line, 25–75 band, confidence
  tail band, retirement marker. **Tap/hover any point** for a full snapshot
  (net worth + Traditional/Roth/taxable split + income & tax at that age).
  A **today's-dollars toggle** switches the whole view to real dollars.
- **Sectioned controls** — Profile / Income & Expenses / Contributions /
  Social Security / Goals & Debt / Markets / Display / Archive. No clamping.
- **Scenario archive** — name + save the full input schema to `localStorage`
  (persists), overlay up to 4 on the chart, load, delete.
- **Status readouts**, **hazard modal**, **boot sequence**, and the
  **amber/green CRT** aesthetic as before.

## Known simplifications (pick up from here)

- MFJ tax/IRMAA tiers are derived as 2× single — exact except the federal
  top-bracket (37%) threshold. Add explicit MFJ figures if that edge matters.
- Social Security taxation is a flat 85%-taxable (federal + NC); the real
  rule uses provisional-income thresholds and NC exempts SS entirely.
- One combined household of accounts under MFJ (spouse income + two SS
  benefits + two claim ages, but not separate per-spouse account buckets or
  per-spouse RMD ages — RMD uses the primary's birth year).
- Taxable-brokerage withdrawals aren't cost-basis tracked (no LTCG schedule),
  so they add no ordinary income and pay no capital-gains tax; windfalls are
  treated as after-tax cash, not ordinary income.
- One asset-return distribution (normal) — no glide path, no pre/post-
  retirement volatility split.
- Contribution and IRMAA/limit figures for 2026 are best-estimate; update the
  versioned tables when the IRS/CMS publish.
- Subsystem naming in the panels is still generic — open for MU-TH-UR-style
  designations.

## Natural next steps

- Taxable-account cost-basis + long-term capital-gains modeling
- Full per-spouse modeling (separate accounts, RMD ages) + explicit MFJ tables
- Provisional-income Social Security taxation; Part D IRMAA
- Healthcare / ACA-before-65 + Medicare premium expense line
- Export / printable plan summary
- Real subsystem names + visual polish
