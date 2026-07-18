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

## What's working in v1

- **Monte Carlo engine** (`engine.js`) — simulates thousands of net-worth
  paths given savings rate, retirement age, spend, expected return, and
  volatility. Outputs percentile bands (5/25/50/75/95, plus whatever the
  confidence toggle needs).
- **Tax engine** (`engine.js`) — federal (progressive brackets) + NC (flat
  rate) marginal tax calculation, versioned by year so brackets can be
  updated annually. Detects bracket-crossing ("creep") events across a
  projected income path.
- **Hero chart** (`app.js`, canvas-based) — median line, 25–75 "likely" band,
  and a confidence-driven tail band that widens/narrows with the toggle.
  Retirement age marked with a dashed line.
- **Sliders** — retirement age, savings rate, retirement spend, expected
  return, volatility, and the confidence-band toggle (50–99%). No clamping —
  push them to the extremes and the plan will actually break.
- **Status readouts** — SOLVENCY / TRAJECTORY / CONF. BAND, styled as
  ship's-computer status lines.
- **Hazard modal** — fires when simulated success probability drops below
  50%, styled as a warning klaxon popup.
- **Boot sequence** — low-poly spinning "F" cube, PS1-style, retro synth
  stinger, scrolling boot log. Skippable.
- **Aesthetic** — amber/green CRT phosphor, scanline overlay, holographic
  panel layout.

## Known simplifications (v1, by design)

- Tax bracket data is single-filer, placeholder 2025 figures, hardcoded in
  `engine.js` — update `FEDERAL_BRACKETS` / `NC_TAX` as real numbers change,
  or extend for filing status.
- Retirement-phase "income" used for bracket-creep detection is a proxy
  (withdrawal amount), not a real withdrawal-sequencing/account-type model
  (no Traditional vs. Roth vs. taxable bucket distinction yet).
- One asset-return distribution (normal, single mean/stdev) — no glide path,
  no separate accumulation vs. retirement volatility.
- Subsystem naming in the tax/sim panels is still generic — open for your
  own MU-TH-UR-style designations.
- No persistence yet — refreshing the page resets to default scenario
  (nothing saved/compared across sessions).

## Natural next steps for Claude Code

- Scenario save/compare (name a scenario, store slider state + result)
- IRMAA cliff detection layered onto the tax panel
- Real subsystem names + copy pass
- Account-type-aware withdrawal modeling (Traditional/Roth/taxable)
- GitHub Pages deploy config
