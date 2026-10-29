# Research log — IRS rules used by the Retirement XP

Last updated: October 29, 2026 (primary-source verification).

## How these were verified, and what wasn't

**October 29, 2026: primary-source check.** IRS.gov and eCFR became reachable from
the build environment. Every rule and figure the app uses was checked against these
official documents, downloaded that day:

| Document | What it confirmed |
|---|---|
| IRS Pub. 590-B (2025), Appendix B | Uniform Lifetime Table: all 49 ages (72–120+) match `src/data/uniformLifetimeTable.ts` exactly. Example: $100,000 at 75 → 24.6 → $4,065. Applicable ages 70½/72/73; April 1 required beginning date; IRAs aggregated, a separate RMD figured for each; QCD at 70½, not from ongoing SEP/SIMPLE, counts toward the RMD, $108,000 limit for 2025, deductible-contribution offset; year-of-death RMD; spouse may treat as own (Table III); 10-year rule; Roth owners treated as dying before the required beginning date; Notice 2024-35 relief. |
| IRS Pub. 590-A (2025) | "You can't convert amounts that must be distributed from your traditional IRA for a particular year." |
| Treas. Reg. §1.401(a)(9)-2(b)(2) (eCFR, current to Oct 27, 2026) | Born before 7/1/1949 → 70½; 7/1/1949–1950 → 72; 1951–1958 → 73; **1959 → "[Reserved]"**; 1960 or later → 75. |
| Treas. Reg. §1.401(a)(9)-5(d), (e) | A non-eligible designated beneficiary must empty the account by the end of the year containing the 10th anniversary of death; when death is on or after the required beginning date, annual RMDs also apply (denominator: greater of beneficiary's and owner's remaining life expectancy). |
| Treas. Reg. §1.401(a)(9)-9(b) | Single Life Table (heir life expectancy; 81 → 10.5, 82 → 9.9). The Joint and Last Survivor Table is in §1.401(a)(9)-9(d). |
| IRS Announcement 2026-7 | Final regulations under the 2024 proposed rules will apply no earlier than 6 months after they are issued; until then a reasonable, good-faith interpretation of the statute applies. |
| IRS Notices 2023-75, 2025-67 | QCD limit $105,000 (2024), $111,000 (2026). |
| IRS Rev. Proc. 2025-32 | 2026 brackets (all 7, single and joint), standard deduction $16,100 / $32,200, additional $1,650 (married) / $2,050 (unmarried), capital-gains thresholds $49,450 / $98,900 and $545,500 / $613,700. All match `src/data/federalTax.ts`. |
| IRS Pub. 915 (2025) | Social Security base amounts $25,000 / $32,000 and $34,000 / $44,000; Worksheet 1 steps are the same as the app's formula; worksheet example ($5,980 benefits → $2,990 taxable) reproduced. |
| Schedule 1-A (Form 1040), 2025, Part V; IRS newsroom (OBBB) | Senior deduction $6,000 per person 65+, 2025–2028; each spouse's $6,000 is reduced by 6% of MAGI over $75,000 / $150,000. |
| IRS Pub. 501 (2025) | A person is 65 on the day before their 65th birthday (born before January 2, 1961 → 65 for 2025). If a spouse died during the year, the survivor may file jointly for that year. |
| IRS NIIT page | 3.8%; thresholds $200,000 single / $250,000 joint; net investment income includes interest, dividends, and capital gains. |
| IRS Pub. 551 (12/2025) | Basis of inherited property is generally fair market value at the date of death. |

**Discrepancies found and fixed on October 29, 2026:**

1. *January 1 birthdays.* The app treated a person as 65 only from the calendar year of
   their 65th birthday. Under Pub. 501, someone born on January 1 is 65 at the end of the
   year before. Fixed (`peopleAge65ForTax`); affects the additional standard deduction
   and the senior deduction for January 1 birthdays only.
2. *NIIT on interest.* The NIIT was applied to qualified dividends and gains only. Interest
   from the modeled cash account is now included. Interest entered in "other income"
   cannot be separated from pensions and wages and is still excluded (stated limitation).

**Still not verified from primary sources:** Medicare IRMAA thresholds and surcharges
(cms.gov is not reachable from the build environment); SSA.gov (refuses automated
requests) for Social Security figures; the text of the July 2024 proposed regulations
(federalregister.gov blocks automated requests) for the 1959 resolution, which is taken
from secondary sources and the reservation in the final regulation; the Victory Capital
calculator (investor.vcm.com).

**Earlier (October 27–29, 2026), before IRS.gov was reachable:** figures were taken from
the engineer's knowledge of the rules and cross-checked against several secondary
sources. Those notes are kept below for the record.

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

**Joint and Last Survivor Table (Table II)**, added October 29, 2026. Applies during the
owner's lifetime only when the spouse is the sole beneficiary at all times during the
year and is more than 10 years younger, using both ages as of their birthdays in the
year (Treas. Reg. §1.401(a)(9)-5(c)(2)(i)–(ii)). A death or divorce during the year does
not change that year's table; the change takes effect the next year (-5(c)(2)(iii)).

- Values: extracted from Treas. Reg. §1.401(a)(9)-9(d), Table 3 (eCFR, Title 26, current
  to October 27, 2026), 14,640 cells. The app stores the 4,214 cells it can use (owner
  72–120+, spouse 0 through owner − 11) in `src/data/jointLastSurvivorTable.ts`.
- Cross-check: IRS Pub. 590-B (2025), Appendix B, Table II prints 5,611 of the same cells.
  All agree except four, where the publication appears to repeat a neighboring row:
  (owner 112, spouse 102) Pub 3.2 / Reg 3.3; (112, 103) 3.1 / 3.2; (112, 107) 2.9 / 3.0;
  (90, 76) 14.8 / 14.7. The regulation's values are symmetric and change smoothly from cell
  to cell, so the app uses the regulation, which is the legal authority.
- The regulation's own table is missing one cell (ages 19 and 35) and has one asymmetric
  pair (ages 2 and 5); neither is in the range the app uses.
- IRS example reproduced: owner 75, spouse 64 → 25.3; $100,000 → $3,953 (Pub. 590-B).
- "More than 10 years younger" is applied to ages attained in the distribution year,
  the ages the table is read at.

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
end (since step 4, heirs' tax over the 10-year withdrawal schedule; see section 10).
Validated with a hand-calculated case (tests/calculations/analysis.test.ts) and the
identity net = avoided later − paid earlier.

## 9. Spouses and the first death (added October 29, 2026)

Verified October 29, 2026 against Pub. 590-B (2025) (year-of-death RMD, treating an
inherited IRA as one's own) and Pub. 501 (2025) (joint return for the year of death).

- Each IRA owner's RMD is computed on their own IRAs and age (Treas. Reg. §1.408-8).
- Year of death: if the owner died on or after the required beginning date, the
  owner's RMD for the year of death must be taken (by the beneficiary if not before
  death). The app assumes the full RMD is taken that year.
- A surviving spouse who is the sole beneficiary may treat the IRA as their own
  (spousal rollover/election); from then on, RMDs follow the survivor's own age and
  required beginning date. A younger survivor can therefore defer RMDs.
- A surviving spouse may file jointly for the year of death (IRC §6013(a)(2)) and
  files single afterward unless a qualifying surviving spouse (dependent child),
  which is not modeled.
- Social Security survivor benefits: simplified to the larger of the two entered
  benefits. Actual survivor benefits depend on claiming ages and can be reduced.
- Joint and Last Survivor Table (Table II): applies when the sole beneficiary is a
  spouse more than 10 years younger. Implemented October 29, 2026; see section 2.

## 10. Heirs and the 10-year rule (added October 29, 2026)

Written from the engineer's knowledge on October 29, 2026, then verified the same day
against Pub. 590-B (2025), Treas. Reg. §1.401(a)(9)-5 and -9, §1.408A-6, Notice
2024-35, and Pub. 551 (see the verification table at the top).

- SECURE Act §401 / IRC §401(a)(9)(H): for an owner dying after 2019, a designated
  beneficiary who is not an eligible designated beneficiary must empty the inherited
  account by December 31 of the 10th year after the year of death.
- Final regulations (Treas. Reg. §1.401(a)(9)-5, July 2024): if the owner died on or
  after their required beginning date, the beneficiary must also take annual RMDs in
  years 1–9, based on the beneficiary's single life expectancy. IRS Notice 2024-35
  waived the penalty for missed 10-year-rule RMDs for 2021–2024, and the annual RMDs
  apply from 2025.
- Roth IRA owners are treated as dying before their required beginning date, so an
  inherited Roth IRA has no annual RMDs in years 1–9; it must still be emptied by year
  10, and qualified distributions are tax-free.
- IRC §1014: inherited taxable assets receive a basis equal to fair market value at
  death (step-up), so gains before death are not taxed.

**Inherited Roth IRA (October 29, 2026):** Pub. 590-B: "If a Roth IRA owner dies, the
minimum distribution rules that apply to traditional IRAs apply to Roth IRAs as though
the Roth IRA owner died before their required beginning date"; and "If the IRA owner
dies before the required beginning date and the 10-year rule applies, no distribution is
required for any year before the 10th year." So heirs may leave an inherited Roth IRA
invested for the full window. The app grows it at the investment return and withdraws it
tax-free at the start of year 10 (the same point as the last pre-tax withdrawal; heirs
could wait until December 31 of that year). Qualified (tax-free) distributions assume
the owner's five-year period is met. Hand-checked: $1,000,000 Roth at 5% → $1,628,894.63
withdrawn (tests/calculations/legacy.test.ts).

**How the app models it:** inheritance at the end of the last projection year. The
inherited pre-tax IRA grows at the investment return and is withdrawn ratably: in
year k it withdraws balance ÷ (11 − k), so it is empty after year 10. The ratable
withdrawal is at least the annual RMD when the heir's single-life divisor is larger
than the years left in the window, which holds for heirs 81 or younger in the first
year after the death (Single Life Table: 10.5 at 81; 9.9 at 82; verified October 29, 2026). In
rate mode, heirs' tax is the withdrawal times the entered rate. In income mode, each
heir's federal tax (current brackets indexed at inflation, standard deduction, under
65) with and without their share, plus a flat state rate. Hand-checked cases
(tests/calculations/legacy.test.ts): $1,050,000 inherited at 5% gives withdrawals of
$105,000, then $110,250, …, totaling $1,320,678.72 and $316,962.89 of tax at 24%. One
heir filing jointly, with $150,000 of other income, has 2026 taxable income of $217,800
with a $100,000 share, and owes $22,128 more tax (the 22% to 24% bracket boundary).

## 11. Out of scope (stated in the app and README)

Accounts the client has already inherited; eligible designated beneficiaries other
than the spouse (minor children, disabled or chronically ill heirs, heirs not more
than 10 years younger); trusts as beneficiaries; estate tax.
