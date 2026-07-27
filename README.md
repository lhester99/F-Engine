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

- **Monte Carlo engine** (`engine.js`) — simulates thousands of net-worth
  paths given savings rate, retirement age, spend, expected return, and
  volatility. Outputs percentile bands (5/25/50/75/95, plus whatever the
  confidence toggle needs).
- **Account-type model** (`engine.js`) — starting balance and contributions
  split across three buckets (Traditional / Roth / taxable brokerage) by an
  allocation mix. Retirement withdrawals are sequenced taxable → Traditional
  → Roth and **taxed by type**: Traditional withdrawals are grossed up
  (Newton solve on `G − tax(G) = need`) so after-tax proceeds meet the
  spend, Roth is tax-free. `retirementSpend` is an **after-tax** target.
- **Tax engine** (`engine.js`) — federal (progressive brackets) + NC (flat
  rate) marginal tax, versioned by year (2025 and 2026 shipped; 2026 is the
  default). Bracket-creep ("creep") detection now runs on the **actual
  ordinary taxable income** from a deterministic projection of the account
  model — not a spend proxy.
- **IRMAA cliff detection** (`engine.js`) — Medicare Part B surcharge tiers
  (single filer, 2025 figures), driven by the projected MAGI with the SSA
  **2-year look-back** (so a high final working year can trip IRMAA in the
  first Medicare years). Thresholds are inflation-indexed forward so a long
  retirement isn't pushed into phantom cliffs by nominal growth. The tax
  panel shows cliff count, peak annual surcharge, and each crossing in the
  event log.
- **Hero chart** (`app.js`, canvas-based) — median line, 25–75 "likely" band,
  and a confidence-driven tail band that widens/narrows with the toggle.
  Retirement age marked with a dashed line. Saved scenarios can be overlaid
  as dashed comparison lines.
- **Scenario archive** (`app.js`) — name and save the current config +
  result snapshot to `localStorage` (persists across refresh). Each saved
  scenario shows SOLV%/END/CREEP, can be overlaid on the chart (up to 4 at
  once, distinct colors), loaded back into the sliders, or deleted.
- **Sliders** — retirement age, savings rate, retirement spend, expected
  return, volatility, starting balance, account mix (Traditional/Roth/
  taxable), and the confidence-band toggle (50–99%). No clamping — push them
  to the extremes and the plan will actually break.
- **Status readouts** — SOLVENCY / TRAJECTORY / CONF. BAND, styled as
  ship's-computer status lines.
- **Hazard modal** — fires when simulated success probability drops below
  50%, styled as a warning klaxon popup.
- **Boot sequence** — low-poly spinning "F" cube, PS1-style, retro synth
  stinger, scrolling boot log. Skippable.
- **Aesthetic** — amber/green CRT phosphor, scanline overlay, holographic
  panel layout.

## Known simplifications (pick up from here)

- Tax bracket data is single-filer, hardcoded in `engine.js` (`FEDERAL_
  BRACKETS` / `NC_TAX`) — add filing status or new years there; the engine
  is agnostic to the actual figures.
- IRMAA is Part B only, single-filer, 2025 tiers (inflation-indexed
  forward). Part D IRMAA and filing-status variants aren't modeled; MAGI is
  approximated by the model's ordinary taxable income.
- Taxable-brokerage withdrawals are **not** cost-basis tracked, so they add
  no ordinary income and pay no capital-gains tax in the model (a real LTCG
  schedule + basis tracking is future work). Traditional/Roth *contribution*
  tax treatment during accumulation is likewise not differentiated — only
  the withdrawal side is taxed.
- One asset-return distribution (normal, single mean/stdev) — no glide path,
  no separate accumulation vs. retirement volatility.
- Subsystem naming in the tax/sim panels is still generic — open for your
  own MU-TH-UR-style designations.

## Natural next steps

- GitHub Pages deploy config
- Taxable-account cost-basis + long-term capital-gains modeling (would also
  sharpen MAGI for IRMAA)
- Part D IRMAA + filing-status variants
- Real subsystem names + copy pass
- Visual polish (tail-band opacity contrast, ambient drone)
