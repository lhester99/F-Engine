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

## Known simplifications in v1 — pick up from here

1. **Tax model**: single-filer only, placeholder 2025 bracket figures
   hardcoded in `engine.js` (`FEDERAL_BRACKETS`, `NC_TAX`). No IRMAA cliff
   detection yet.
2. **Retirement income proxy**: bracket-creep detection during retirement
   uses withdrawal amount as a stand-in for taxable income — there's no
   real account-type model (Traditional vs. Roth vs. taxable brokerage)
   driving actual taxable withdrawals yet.
3. **Single return distribution**: one normal distribution (mean/stdev) for
   all years — no glide path, no different volatility pre- vs.
   post-retirement.
4. **No persistence**: refreshing the page resets to the default scenario.
   No scenario save/compare yet.
5. **Subsystem naming**: panel/subsystem labels are still generic
   (e.g. "MARGINAL RATE MONITOR"). Cryptic MU-TH-UR-style designations are
   intentionally left for Logan to name — don't invent final names, just
   leave clear labels swappable.

## Suggested next build priorities (in order)

1. Scenario save/compare — name a scenario, persist slider state + result,
   allow comparing 2+ scenarios side by side
2. Account-type-aware modeling — split starting balance into Traditional /
   Roth / taxable buckets, tax withdrawals accordingly
3. IRMAA cliff detection layered onto the tax panel
4. GitHub Pages deploy config
5. Visual polish pass once the above is solid: refine the tail-band opacity
   contrast (currently subtle), consider ambient audio drone refinements

## Working style for this project

- Keep the math correct above all else — this is the one place bugs are a
  different class of problem than UI bugs. Sanity-check tax and Monte Carlo
  logic with test cases (see prior session's node-based validation approach
  in the repo history/commits, if present).
- Keep it a single-repo, no-build-step static site unless a real need for
  tooling emerges.
- Preserve the "no clamping" philosophy on sliders — extreme inputs should
  produce extreme, even broken, outcomes. That's a feature, not a bug.
