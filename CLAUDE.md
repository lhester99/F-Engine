# Engine F — Instructions for Claude Code

## Scope isolation (read this first)

This is a **standalone personal project**, unrelated to any other repository or
project you may have context on. Specifically:

- Do **not** reference, reuse, or pull patterns from any "Emberfell" project (a
  3D game codebase) or any Portuguese/language-learning app project.
- Do not assume shared conventions, file structure, or naming from those
  projects apply here. Treat this repo as a clean slate.
- If you have any ambient memory, CLAUDE.md, or context from those other
  projects, disregard it for this repo.
- This tool is for personal use only. It is not a Vanguard product, not
  client-facing, and should never be represented as financial advice.

## What this is

Engine F is a personal, tactile financial-planning toy: one hero chart
(net worth over time) driven by physics-y sliders, a live Monte Carlo
simulation with a togglable confidence band, and a federal + NC marginal
tax bracket monitor. Aesthetic is a dark, amber/green CRT phosphor,
Nostromo-style holographic console — status readouts, ship's-computer
framing, a PS1-style boot sequence.

## Current state: v1 already exists

A working v1 has already been built and tested (screenshotted in a headless
browser, confirmed functioning). It is plain HTML/CSS/JS, no build step,
GitHub-Pages-ready. The files:

- `index.html` — structure: boot screen, dashboard, hazard modal
- `style.css` — CRT/holographic visual system
- `engine.js` — tax bracket engine (federal + NC, versioned by year) and
  Monte Carlo simulation engine (percentile bands, success probability)
- `app.js` — wires sliders to the engine, renders the canvas chart, drives
  status readouts, boot sequence, hazard modal
- `README.md` — full accounting of what works and what's simplified in v1

**Do not rebuild from scratch.** Start by reading all five files to
understand what's already working, then extend from there.

## Confirmed working in v1 (verified via screenshot testing)

- Monte Carlo engine produces percentile bands (5/25/50/75/95) that respond
  correctly to slider changes
- Confidence-band toggle (50–99%) correctly changes which percentiles are
  rendered as the outer band, and the readout label updates accordingly
- Federal (progressive) + NC (flat) marginal tax calculation, with
  bracket-crossing ("creep") event detection over a projected income path
- Hazard modal fires correctly when simulated success probability drops
  below 50%
- Boot sequence (spinning cube logo, synth stinger, boot log) plays and is
  skippable
- Default scenario boots into a stable (~85% success) baseline rather than
  already-broken state

## Current model (post "mega update")

The engine is now an income-driven household cash-flow model, not a
savings-rate toy. One shared `stepYear` drives both the Monte Carlo and the
deterministic `projectPlan`, so they never drift. Working years: (household +
spouse) income − tax − expenses − per-account contributions = surplus → taxable
brokerage. Retirement: Social Security (85% taxable) + RMDs cover spend first,
then withdrawals sequence taxable → Traditional (grossed up on top of the SS/RMD
base) → Roth. `projectPlan` returns rich per-year rows (buckets, income, tax,
`freeCash`) that power the chart-inspect snapshot, the year-by-year table, and
the tax panel. Federal/NC brackets are **inflation-indexed forward** from the
base table year (the exact `defl · tax(income/defl)` identity), matching the
IRMAA treatment — so nominal growth no longer trips phantom bracket creep.
Wages track inflation by default (`WAGE_GROWTH_DAMP = 1.0`). Each row's
`freeCash` = disposable "money to enjoy": working years = income − tax −
expenses − all contributions − debt; retirement = the funded lifestyle spend.
Surfaced as a Free-cash column in the table and a line in the inspect tooltip.

## Known simplifications — pick up from here

1. **Filing status**: Single + MFJ supported (`filingStatus` threaded through
   the tax/IRMAA functions). MFJ is derived as 2× single — exact except the
   federal top bracket. NC/IRMAA MFJ are exactly 2×.
2. **Social Security**: flat 85%-taxable for federal + NC (real rule uses
   provisional-income thresholds; NC exempts SS). One combined household of
   accounts under MFJ; RMD uses the primary's birth year, not per-spouse.
3. **Taxable brokerage**: no cost-basis tracking / LTCG schedule yet;
   withdrawals add no ordinary income and windfalls are treated as after-tax
   cash. This is the main remaining tax-accuracy gap.
4. **Single return distribution**: one normal (mean/stdev) — no glide path,
   no pre/post-retirement volatility split.
5. **2026 estimates**: contribution limits and IRMAA/tax 2026 figures are
   best-estimate where the IRS/CMS haven't published; update the versioned
   tables.
6. **Subsystem naming**: panel labels are still generic (e.g. "MARGINAL RATE
   MONITOR"). Cryptic MU-TH-UR-style designations are left for Logan to name —
   don't invent final names, just leave clear labels swappable.

## Suggested next build priorities (in order)

1. ~~Scenario save/compare~~ — **DONE**
2. ~~Account-type-aware modeling~~ — **DONE**
3. ~~IRMAA cliff detection~~ — **DONE**
4. ~~GitHub Pages deploy config~~ — **DONE** (`.nojekyll`; served from branch)
5. ~~Income-driven cash flow + per-account contributions + chart inspect +
   today's-dollars~~ — **DONE** (mega update stage 1)
6. ~~Filing status/MFJ + Social Security + RMDs~~ — **DONE** (stage 2)
7. ~~Goals & debt timeline events~~ — **DONE** (stage 3)
8. Taxable-account cost-basis + LTCG modeling — **NEXT** (main tax-accuracy gap)
9. Full per-spouse modeling (separate accounts/RMD ages) + explicit MFJ tables
10. Provisional-income SS taxation; Part D IRMAA; healthcare/ACA expense line
11. Export / printable plan summary; visual polish; real subsystem names

## Working style for this project

- Keep the math correct above all else — this is the one place bugs are a
  different class of problem than UI bugs. Sanity-check tax and Monte Carlo
  logic with test cases (see prior session's node-based validation approach
  in the repo history/commits, if present).
- Keep it a single-repo, no-build-step static site unless a real need for
  tooling emerges.
- Preserve the "no clamping" philosophy on sliders — extreme inputs should
  produce extreme, even broken, outcomes. That's a feature, not a bug.
