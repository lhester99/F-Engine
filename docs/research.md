# Research log — IRS rules used by the RMD Smoothing Analyzer

Last updated: October 27, 2026 (Phase 1).

## How these were verified, and what wasn't

The build environment's network policy **blocked direct access to IRS.gov, the
Federal Register, eCFR, and investor.vcm.com** (connection refused by the proxy,
October 27, 2026). Primary sources could not be opened from the build machine.

What was done instead:

1. Rules and table values were taken from the regulations and publications cited
   below, as known to the engineer.
2. Each figure was cross-checked against several independent secondary sources
   found by web search on October 27, 2026 (custodian and practitioner reproductions
   of the IRS tables). The figures checked are listed below. All sources agreed.
3. The Victory Capital Future RMD Calculator (investor.vcm.com) could not be
   reached, so it was not used for comparison.

**Action item for the advisor:** before relying on the app with clients, spot-check
the Uniform Lifetime Table and QCD limits against the current IRS Publication 590-B
(https://www.irs.gov/publications/p590b). The values live in `src/data/` and are
easy to change.

## 1. RMD applicable age by date of birth

| Born | Applicable age | Authority |
|---|---|---|
| Before July 1, 1949 | 70½ | IRC §401(a)(9)(C) before the SECURE Act |
| July 1, 1949 – Dec 31, 1950 | 72 | SECURE Act (2019) §114 |
| 1951 – 1959 | 73 | SECURE 2.0 (2022) §107 |
| 1960 or later | 75 | SECURE 2.0 (2022) §107 |

**The 1959 drafting issue.** As written, SECURE 2.0 §107 gives people born in 1959
two applicable ages (73 and 75). The IRS proposed regulations published in the
Federal Register on **July 19, 2024** (alongside final regulations T.D. 10001) treat
the 1959 cohort as **age 73**, consistent with congressional intent and a Senate
technical-corrections discussion draft. Several secondary sources checked
October 27, 2026 describe this provision as still *proposed*, not final. Re-checked
October 28, 2026: per a Morgan Lewis post (March 2026) on IRS Announcement 2026-7,
the applicability of the delayed RMD provisions, including the 1959 clarification,
was pushed to January 1, 2027 at the earliest, and those final regulations had not
been published as of that post. Until they apply, a reasonable good-faith reading of
the statute governs, and the industry uses 73. The app uses 73 and says so in the
Methodology panel.

- The first distribution year is the calendar year the applicable age is reached.
- Age 70½ is the date six calendar months after the 70th birthday (Pub. 590-B).
- Required beginning date: April 1 of the year after the first distribution year.

## 2. Uniform Lifetime Table (Table III)

Source: Treas. Reg. §1.401(a)(9)-9(c) as amended by **T.D. 9930** (85 FR 72472,
Nov. 12, 2020), effective for distribution years beginning January 1, 2022.
Reproduced in IRS Pub. 590-B, Appendix B, Table III.

Values in `src/data/uniformLifetimeTable.ts`, ages 72–120+ (120 and over = 2.0).
Values confirmed against secondary sources on October 27, 2026: 72 → 27.4,
73 → 26.5, 74 → 25.5, 75 → 24.6, 76 → 23.7, 77 → 22.9, 78 → 22.0, 79 → 21.1,
80 → 20.2, 81 → 19.4, 82 → 18.5, 85 → 16.0, 90 → 12.2, 95 → 8.9, 99 → 6.8,
100 → 6.4, 101 → 6.0, 105 → 4.6, 110 → 3.5, 114 → 3.0, 115 → 2.9, 116 → 2.8,
117 → 2.7, 118 → 2.5, 119 → 2.3, 120+ → 2.0. The other ages come from the same
regulation and were not individually cross-checked.

**Joint and Last Survivor Table (Table II)** applies only when the sole beneficiary
for the entire year is a spouse more than 10 years younger. It is not included
yet (Phase 1 is single-person) and is listed as a known limitation.

## 3. RMD computation

- RMD = account balance on December 31 of the prior year ÷ distribution period for
  the age reached in the distribution year (Treas. Reg. §1.401(a)(9)-5; Pub. 590-B).
- IRAs: compute each IRA's RMD separately; the total may come from any one or more
  IRAs (Pub. 590-B; Treas. Reg. §1.408-8). Employer plans: each plan's RMD must come
  from that plan.
- First-year deferral: the first RMD may be taken by April 1 of the next year. The
  second year's RMD is still based on the December 31 balance of the first year,
  which is not reduced by the deferred amount (Pub. 590-B).
- In a distribution year, the first amounts distributed count toward the RMD.
  RMDs cannot be rolled over or converted, so a Roth conversion is possible only
  after that year's RMD is satisfied (Treas. Reg. §1.402(c)-2; §1.408-8; Pub. 590-B).
  In the first distribution year this applies even when the RMD is deferred.
- Roth IRAs: no lifetime RMDs for the original owner. Designated Roth accounts in
  employer plans: no lifetime RMDs starting in 2024 (SECURE 2.0 §325).
- Still-working exception: applies only to the current employer's plan, not to
  IRAs and not to 5% owners (IRC §401(a)(9)(C)). Not modeled in Phase 1.
- **Rounding:** neither the regulations nor Pub. 590-B prescribe rounding for the
  RMD division. Custodians usually round to cents. The engine keeps full precision
  and rounds only for display (whole dollars).

## 4. Qualified Charitable Distributions

- IRC §408(d)(8): distribution made directly from an IRA to a qualifying charity,
  on or after the date the owner reaches age 70½. It is excluded from income and
  counts toward the RMD. The 70½ age did not move when the RMD age changed, so
  QCDs can start before RMDs.
- Not eligible: employer plans, or SEP/SIMPLE IRAs that are "ongoing" (receiving an
  employer contribution that plan year).
- Annual per-person limit, indexed from 2024 under SECURE 2.0 §307:

| Year | Limit | Source | Verification |
|---|---|---|---|
| 2022–2023 | $100,000 | IRC §408(d)(8)(A) | Statutory |
| 2024 | $105,000 | IRS Notice 2023-75 | Engineer knowledge; widely reported |
| 2025 | $108,000 | IRS Notice 2024-80 | Engineer knowledge; secondary sources Oct 27, 2026 |
| 2026 | $111,000 | IRS Notice 2025-67 (as cited by secondary sources) | Several secondary sources Oct 27, 2026; one stale source still showed $108,000 |

Years after 2026 use an editable "assumed future limit" (default $111,000 held flat).
Re-checked October 28, 2026: secondary sources said the IRS had not yet published the
2027 limit (one checked October 23, 2026). Some calculators estimate about $114,000
for 2027 from CPI data; that is an estimate, not an IRS figure, so it is not used.
The one-time QCD to a split-interest entity is not modeled.

## 5. QCD reduction for deductible contributions after 70½

IRC §408(d)(8)(A), as amended by SECURE Act (2019) §107(b): the amount of a QCD
excluded from income is reduced by the total deductible IRA contributions for tax
years ending on or after the date the owner reaches 70½, minus amounts already used
to reduce earlier QCDs. The app applies this dollar for dollar, includes the same
year's deductible contribution (as on that year's return), and carries any unused
amount forward. The QCD still counts toward the RMD. Engineer knowledge of the
statute; not separately verified online on October 28, 2026.

## 6. Medicare IRMAA (added October 28, 2026)

Authority: Social Security Act §1839(i) (Part B) and §1860D-13(a)(7) (Part D).
Premiums for a year are based on MAGI (AGI plus tax-exempt interest) from the tax
return two years earlier.

2026 figures, from several secondary sources that agreed with each other, checked
October 28, 2026 (Humana, Medicare Advocates, Current Federal Tax Developments, The
Finance Buff, among others). The CMS fact sheet could not be opened from the build
environment.

| Tier | Single MAGI more than | Joint MAGI more than | Part B surcharge / mo | Part D surcharge / mo |
|---|---|---|---|---|
| 1 | $109,000 | $218,000 | $81.20 | $14.50 |
| 2 | $137,000 | $274,000 | $202.90 | $37.50 |
| 3 | $171,000 | $342,000 | $324.60 | $60.40 |
| 4 | $205,000 | $410,000 | $446.30 | $83.30 |
| 5 | $500,000 or more | $750,000 or more | $487.00 | $91.00 |

Standard 2026 Part B premium: $202.90.

- The top-tier thresholds are fixed in statute through 2027 and indexed afterward.
  Indexed thresholds are rounded to the nearest $1,000.
- **2027 figures were not published** as of the October 28, 2026 check (expected
  November 2026). Some sources say the 2027 Medicare & You handbook shows $111,000 /
  $222,000 for tier 1; projections range from $111,000 to $113,000. The app projects
  every year after 2026 from the 2026 table at the inflation rate the advisor enters
  (default 2.5%), and labels these as projections.
- Married filing separately uses a different schedule and is not supported.

## 7. Federal income tax (added October 29, 2026)

2026 figures from IRS Rev. Proc. 2025-32, as reported by several secondary sources
that agreed with each other (Tax Foundation, ustax.tools, PennyCalc, Kiplinger and
others), checked October 29, 2026. One source (TaxLumo) showed 2025 figures labeled as
2026 and was disregarded. The IRS document itself could not be opened from the build
environment. These reflect Pub. L. 119-21 (One Big Beautiful Bill Act, July 4, 2025).

| | Single | Married filing jointly |
|---|---|---|
| 10% up to | $12,400 | $24,800 |
| 12% up to | $50,400 | $100,800 |
| 22% up to | $105,700 | $211,400 |
| 24% up to | $201,775 | $403,550 |
| 32% up to | $256,225 | $512,450 |
| 35% up to | $640,600 | $768,700 |
| 37% above | $640,600 | $768,700 |
| Standard deduction | $16,100 | $32,200 |
| Additional, age 65+ | $2,050 | $1,650 per spouse |
| 0% capital gains up to | $49,450 | $98,900 |
| 15% capital gains up to | $545,500 | $613,700 |

- **Senior deduction** (IRC §151(d)(5), 2025–2028): $6,000 per person 65+, reduced by
  6% of MAGI over $75,000 single / $150,000 joint (per person). IRS newsroom page
  confirms the amount, years, and thresholds; the 6% rate is from secondary sources
  citing the statute.
- **Social Security taxation** (IRC §86): thresholds $25,000/$34,000 single and
  $32,000/$44,000 joint, not indexed (engineer knowledge of the statute).
- **NIIT** (IRC §1411): 3.8%, thresholds $200,000 single / $250,000 joint, not indexed.
- **2027 figures were not published** as of October 29, 2026. Projections cluster
  around a 3.2% adjustment (standard deduction about $16,600 / $33,200). The app
  projects from 2026 at the entered inflation rate, rounding brackets down to $25 and
  deductions down to $50 (IRC §1(f)(7), §63(c)(4)).

Validated with hand-calculated cases in tests/calculations/federalTax.test.ts, including
a Social Security "torpedo" case where the rate on the next dollar (18.5%) exceeds the
bracket rate (10%).

## 8. Tax comparison method

Since October 29, 2026 the comparison uses the bracket-based estimate above for each
year, IRMAA in its premium year, and the heirs' rate on the pre-tax balance left at the
end. Validated with a hand-calculated case (tests/calculations/analysis.test.ts) and the
identity net = avoided later − paid earlier.

## 9. Out of scope (stated in the app and README)

Inherited accounts, non-spouse beneficiaries, the 10-year rule, death of a spouse
during the projection, and spousal rollovers.
