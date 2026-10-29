import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PUBLISHED_QCD_LIMITS } from '../data/qcdLimits';
import { formatUsd } from '../utils/format';

export const KNOWN_LIMITATIONS = [
  'The Joint and Last Survivor Table is used when the spouse is more than 10 years younger (ages as of birthdays in the year) and the “sole beneficiary” box is checked; whether the spouse really is the sole beneficiary of every IRA for the whole year is not checked. Its values come from Treas. Reg. §1.401(a)(9)-9(d); Pub. 590-B prints four cells differently (apparent typos).',
  'First death: the death is assumed at the end of the death year (joint return, full RMD taken). The survivor always does a spousal rollover; remaining a beneficiary of an inherited IRA instead, and qualifying-surviving-spouse filing with a dependent child, are not modeled. The survivor keeps the larger of the two Social Security benefits as entered, a simplification of the survivor benefit rules.',
  'Only one first death is modeled; the survivor lives to the end of the projection. The projection ends when the client would reach the ending age.',
  'Traditional and Roth IRAs only. 401(k), 403(b), SEP and SIMPLE IRAs, Roth 401(k)s, and the still-working exception are not yet modeled.',
  'Heirs inherit everything at the end of the projection (the last death is assumed then). Each heir is a non-spouse designated beneficiary under the 10-year rule and withdraws the inherited IRA evenly over 10 years. Eligible designated beneficiaries (minor children, disabled or chronically ill heirs, heirs not more than 10 years younger), trusts as beneficiaries, accounts the client has already inherited, and estate tax are out of scope.',
  'During the 10-year window the inherited IRAs grow at the investment return, while the taxable account and cash are counted at their value at inheritance. With the default discount rate (the investment return) this makes no difference to present values; with a lower discount rate it slightly favors the IRAs, and with a higher one the taxable account.',
  'Even 10-year withdrawals meet the annual RMDs required in years 1–9 for heirs who are 81 or younger in the first year after the death (single life expectancy at 81 is 10.5 years, Treas. Reg. §1.401(a)(9)-9(b)). Heirs could instead bunch or time withdrawals; that is not modeled.',
  'Heirs’ tax from income uses current federal brackets indexed at inflation, the standard deduction, no other deductions or credits, and a flat state rate. Heirs’ income is entered in today’s dollars and grows with inflation. Heirs are assumed to share equally, file the same way, and have the same income.',
  'Assumes none of the current year’s RMD has been taken yet. If the first RMD year was last year and that RMD was deferred to April 1 of this year, the deferred amount is not modeled.',
  'One constant annual return is applied to every account in every year. Real returns vary; sequence of returns is not modeled.',
  'All flows (RMDs, QCDs, withdrawals, conversions, contributions) are assumed to occur before the year’s growth, which slightly understates growth compared with mid-year or year-end withdrawals.',
  'RMDs, QCDs, extra withdrawals, and conversions are taken pro rata across Traditional IRAs. IRS rules allow the IRA RMD total to come from any IRA, so actual account-level balances may differ.',
  'QCDs are modeled annually. In the year age 70½ is reached, a QCD is only valid if made on or after the 70½ date. The one-time QCD to a split-interest entity is not modeled.',
  'QCD limits after the latest published year use an editable assumed value (default: held flat), which understates future inflation indexing.',
  'Federal tax is an estimate from the brackets, standard or itemized deduction, age-65 additions, the 2025–2028 senior deduction, Social Security taxation, capital-gains rates, and the 3.8% NIIT. Credits, AMT, the qualified business income deduction, and the 10% early-distribution penalty before 59½ are not modeled. State tax is one flat rate on income other than Social Security. The NIIT applies to qualified dividends and gains and to cash-account interest; entered other income (pensions, wages, interest) is not split out, so any interest entered there is not counted for the NIIT.',
  'Tax brackets and deductions after 2026 are projected at the inflation rate entered. Tax law can change.',
  'Entered income (Social Security, pensions, interest, dividends, itemized deductions) is held in today’s dollars and grows with inflation every year. Pensions without cost-of-living increases are overstated in later years.',
  'Other entered income is assumed to pay its own tax and is not spent from the modeled accounts. Only the tax caused by IRA income, conversions, the taxable account, and cash is paid from the modeled accounts.',
  'The taxable account is invested at the same return as the IRAs. Its dividends are all treated as qualified and are reinvested; gains are realized only when money is withdrawn, in proportion to the unrealized gain. Short-term gains and tax-loss harvesting are not modeled.',
  'Withdrawing from the Roth IRA for spending assumes the five-year and age 59½ conditions for tax-free withdrawals are met.',
  'After-tax value treats the pre-tax balance as worth (1 − the heirs’ rate) and taxes no gains in the taxable account (heirs’ step-up). It is a legacy view, not what the client would net by cashing out everything in one year.',
  'The tax comparison treats QCD dollars as income avoided. It assumes the client would not otherwise make the same gifts; if they would give cash anyway, the real benefit of a QCD depends on whether they itemize.',
  'IRMAA uses estimated MAGI (AGI plus tax-exempt interest). Married filing separately and IRMAA appeals for life-changing events are not modeled; people on the return are assumed to be on Medicare from 65. Income in the last two projection years affects premiums after the projection and is not counted.',
  'IRMAA thresholds and surcharges after 2026 are projections at the inflation rate entered, not published figures.',
  'Traditional IRA contribution limits, deductibility rules, and earned-income requirements are not checked; contributions go to the first Traditional IRA.',
  'Balance comparisons are pre-tax account values only. Withdrawn RMDs and QCDs leave the model, and income tax on conversions is assumed to be paid from outside the accounts unless withholding is entered, so a higher strategy total does not mean higher after-tax wealth.',
  'Roth IRA contribution limits, earned-income requirements, and the Roth five-year rules are not enforced.',
];

/** Explains the calculation order, rules, sources, and limitations. */
export function MethodologyPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      lastFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="methodology-title"
        className="h-full w-full max-w-2xl overflow-y-auto bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-5 py-3">
          <h2 id="methodology-title" className="text-base font-semibold text-ink">
            Methodology
          </h2>
          <button ref={closeRef} type="button" className="btn-icon" aria-label="Close methodology" onClick={onClose}>
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-6 px-5 py-5 text-sm leading-relaxed text-ink-2 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-ink">
          <p className="rounded-md border border-line bg-canvas px-3 py-2 text-ink">
            Projections are hypothetical illustrations based on the assumptions entered. They are not recommendations,
            forecasts, or tax advice. Return assumptions are hypothetical and actual results will differ.
          </p>

          <section>
            <h3>Annual calculation order</h3>
            <p className="mb-2">Every year of every scenario (baseline and strategy) follows the same sequence:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Start with each account’s prior December 31 balance.</li>
              <li>Compute the required RMD for each Traditional IRA: prior December 31 balance ÷ distribution period.</li>
              <li>Apply QCDs, counting toward the RMD first.</li>
              <li>Take the remaining RMD as a taxable distribution.</li>
              <li>Apply any extra pre-tax withdrawals.</li>
              <li>Apply Roth conversions (only from what remains after the RMD is satisfied).</li>
              <li>Add contributions.</li>
              <li>Apply the year’s investment return to the remaining balance.</li>
              <li>Record the December 31 balance, which becomes next year’s RMD basis.</li>
            </ol>
            <p className="mt-2">
              Intermediate balances are never rounded; figures are rounded to whole dollars for display only. The IRS
              does not prescribe a rounding convention for the RMD computation itself.
            </p>
          </section>

          <section>
            <h3>What the chart shows</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-ink">Required RMDs</strong>: the amount the IRS requires to be distributed in that
                calendar year. QCDs satisfy part of it but do not reduce it. With the April 1 deferral, the first year shows
                nothing required and the next year shows two RMDs.
              </li>
              <li>
                <strong className="text-ink">Taxable IRA distributions</strong>: RMD dollars not satisfied by QCDs, plus
                extra withdrawals.
              </li>
              <li>Roth conversions are never included in either series. They can be shown as a separate line.</li>
              <li>
                <strong className="text-ink">No strategy</strong> uses identical inputs with all Roth conversions and QCDs
                removed. Extra withdrawals and contributions are kept in both.
              </li>
            </ul>
          </section>

          <section>
            <h3>Rules applied</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                RMD start (applicable) age by date of birth: before July 1, 1949 → 70½; July 1, 1949 – December 31, 1950 →
                72; 1951–1959 → 73; 1960 or later → 75. People born in 1959 use 73, following the IRS proposed
                regulations published July 19, 2024, which resolve the SECURE 2.0 drafting overlap.
              </li>
              <li>The first RMD is for the year the applicable age is reached.</li>
              <li>
                Distribution period: Uniform Lifetime Table (effective for 2022 and later), using the age reached on the
                birthday in each distribution year. When the spouse is the sole beneficiary for the whole year and more
                than 10 years younger, the Joint and Last Survivor Table is used instead, at both spouses’ ages that year.
                If either spouse dies during the year, that year still uses it; the next year switches to the Uniform
                Lifetime Table (Treas. Reg. §1.401(a)(9)-5(c)(2)).
              </li>
              <li>
                The first RMD may be delayed to April 1 of the following year. The second year’s RMD is still computed from
                the December 31 balance of the first year, which has not been reduced by the deferred RMD, so two RMDs fall
                in the second year.
              </li>
              <li>
                In the first RMD year, any distribution counts toward that year’s RMD first. A conversion in a deferral year
                is therefore blocked, and QCDs or extra withdrawals that year reduce the amount deferred.
              </li>
              <li>
                RMDs are computed for each IRA separately and totaled; the total may be taken from any IRA (modeled pro
                rata). Roth IRAs have no lifetime RMDs.
              </li>
              <li>
                A Roth conversion cannot satisfy an RMD. Conversions that would use RMD dollars are blocked or limited, with
                a message.
              </li>
              <li>
                QCDs: age 70½ or older, from IRAs only, up to the annual per-person limit, excluded from taxable income.
                Limits used:{' '}
                {PUBLISHED_QCD_LIMITS.map((e) => `${e.year} ${formatUsd(e.limit)}`).join('; ')}.
              </li>
              <li>Each person’s RMDs are computed independently before being combined (engine supports spouses).</li>
              <li>
                Pre-tax contributions are added after the year’s RMD (step 7), so they raise the next year’s RMD. Deductible
                IRA contributions for years on or after the year age 70½ is reached reduce the tax-free amount of later QCDs,
                dollar for dollar, carried forward until used (IRC §408(d)(8)(A)). The QCD still counts toward the RMD; the
                matched amount is treated as a taxable distribution.
              </li>
            </ul>
          </section>

          <section>
            <h3>Estimated income tax</h3>
            <p className="mb-2">
              Each year’s federal and state tax is estimated for the household, with and without the strategy, from the
              income you enter plus the projected IRA amounts:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Ordinary income = pensions, wages, and interest + taxable IRA distributions + Roth conversions − deductible
                IRA contributions. Qualified dividends and long-term gains are added separately.
              </li>
              <li>
                Taxable Social Security uses the IRS provisional-income formula (up to 85% of benefits). Thresholds of
                $25,000/$34,000 single and $32,000/$44,000 joint are fixed in law and not indexed.
              </li>
              <li>
                Deduction: the larger of itemized deductions or the standard deduction plus the age-65 addition for each
                person 65 or older. For 2025–2028 the senior deduction adds $6,000 per person 65 or older, reduced by 6% of
                income above $75,000 (single) or $150,000 (joint).
              </li>
              <li>
                Ordinary income is taxed through the brackets. Qualified income is taxed at 0/15/20% starting where
                ordinary income ends. The 3.8% net investment income tax applies to qualified income above $200,000 /
                $250,000 of income.
              </li>
              <li>
                2026 figures are from IRS Rev. Proc. 2025-32. Later years are indexed at the inflation rate entered,
                rounded down to $25 for brackets and $50 for deductions, as the law requires.
              </li>
              <li>
                “Rate on next dollar” is the extra federal and state tax on the next $1,000 of income. It can exceed the
                bracket rate when extra income makes more Social Security taxable or reduces the senior deduction.
              </li>
            </ul>
          </section>

          <section>
            <h3>Fill-to-bracket conversions</h3>
            <p>
              For each year in the rule’s age range, the app converts the largest whole-dollar amount that keeps ordinary
              taxable income at or below the top of the chosen bracket, after that year’s RMD, other income, and
              deductions. If an IRMAA limit is chosen and someone on the return will be 65 or older two years later, MAGI is
              also kept at or below that tier’s threshold. Amounts recalculate whenever any input changes. A fixed amount
              entered for a year takes precedence over a rule.
            </p>
          </section>

          <section>
            <h3>Tax trade-off</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Paid earlier: the sum of the years in which the strategy’s federal, state, and IRMAA costs are higher.
                Avoided later: the years in which they are lower, plus lower heirs’ tax.
              </li>
              <li>
                Heirs’ tax: heirs withdraw the pre-tax balance left at the end evenly over 10 years (the 10-year rule),
                and each year’s tax is counted in that year. Tax is either the heirs’ rate entered, or estimated from each
                heir’s own income and brackets.
              </li>
              <li>
                Present value discounts each year to the start of the first projection year, by default at the investment
                return.
              </li>
              <li>
                Breakeven heirs’ rate: the flat heirs’ rate at which the present-value totals are equal. Above it, the
                strategy’s estimated total is lower. With heirs’ tax from their income, compare it with the heirs’ average
                rate shown.
              </li>
              <li>
                QCD gifts count as income not taxed. The comparison covers taxes only and does not treat the gifts
                themselves as a cost.
              </li>
            </ul>
          </section>

          <section>
            <h3>Spouses and the first death</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Each spouse’s RMDs are computed on their own IRAs and their own age, then combined. A couple files jointly.</li>
              <li>
                Conversions are sized after both spouses’ RMDs for the year are known, so a fill-to-bracket rule sees the
                household’s full income.
              </li>
              <li>
                In the year of the first death the couple still files jointly and the deceased’s full RMD for that year is
                taken. From January 1 of the next year the survivor treats the deceased’s IRAs as their own (spousal
                rollover): RMDs use the survivor’s own age and Uniform Lifetime Table factor on the combined prior December 31
                balance, and a younger survivor has no RMDs until their own RMD age.
              </li>
              <li>
                The survivor files single: single brackets, standard deduction, senior deduction, Social Security thresholds,
                and IRMAA thresholds. Household Social Security drops to the larger of the two benefits. Other income and
                spending continue at the shares entered.
              </li>
            </ul>
          </section>

          <section>
            <h3>Taxable account, cash, and spending</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Each year, the tax caused by IRA income, conversions, and these accounts is the household’s total estimated tax
                minus the tax on the entered income alone. The client’s other income pays its own tax.
              </li>
              <li>
                Cash from RMDs and extra withdrawals first pays that tax (except the conversion’s share), any IRMAA increase
                due that year, and the spending amount entered. Whatever is left is invested in the taxable account.
              </li>
              <li>
                The conversion’s share of tax is paid from the source chosen: withheld from the conversion (so less reaches
                the Roth IRA), the taxable account, or cash. If that runs short, the other account is used, then withholding,
                with a message.
              </li>
              <li>
                Spending that RMDs do not cover comes from the taxable account, then cash, then the Roth IRA. Spending is the
                same with and without the strategy, so the comparison is like for like.
              </li>
              <li>
                Selling from the taxable account realizes gains in proportion to its unrealized gain; those gains are taxed in
                the same year, so the year is recalculated until the amounts settle. Dividends (the yield entered) are taxed
                each year as qualified dividends and reinvested, adding to cost basis. Cash interest is ordinary income.
              </li>
              <li>The IRMAA increase caused by modeled income is paid in the premium year, two years after the income.</li>
            </ul>
          </section>

          <section>
            <h3>Heirs and the 10-year rule</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Inherited pre-tax IRA: grows at the investment return; in year k of 10 heirs withdraw the balance ÷ (11 − k),
                so it is empty after year 10. Each withdrawal is taxable to the heirs.
              </li>
              <li>
                Inherited Roth IRA: no yearly withdrawals are required (the owner is treated as dying before the required
                beginning date), but it must also be emptied within 10 years. Heirs leave it invested: it grows tax-free at
                the investment return and is withdrawn tax-free in year 10, at the same point as the last pre-tax
                withdrawal. Assumes the five-year rule for tax-free Roth withdrawals is met.
              </li>
              <li>Taxable account and cash: basis steps up at death (IRC §1014), so earlier gains are not taxed.</li>
              <li>
                What heirs keep = the Roth IRA after its growth + taxable + cash + inherited IRA withdrawals − heirs’ tax.
                The present value discounts each amount from the year it is received to the start of the projection. The heirs’ average rate is heirs’ tax ÷ withdrawals, both in present
                value.
              </li>
            </ul>
          </section>

          <section>
            <h3>After-tax value and breakeven age</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                After-tax value each December 31 = Roth IRA + taxable account + cash + pre-tax IRAs × (1 − heirs’ tax rate).
                With heirs’ tax from their income, the rate is the heirs’ estimated average rate for that scenario.
                Taxable-account gains are not taxed because heirs receive a step-up in basis.
              </li>
              <li>
                Breakeven age: the first age from which the strategy’s after-tax value is at least the no-strategy value in
                every remaining year. If the strategy is ahead from the first year, that is shown instead.
              </li>
            </ul>
          </section>

          <section>
            <h3>Medicare IRMAA</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                MAGI = adjusted gross income (including the taxable part of Social Security, IRA distributions, and
                conversions) + tax-exempt interest. QCDs are excluded.
              </li>
              <li>
                Each year’s MAGI sets the premium surcharge two years later. IRMAA applies to each person on the return who
                is 65 or older in the premium year.
              </li>
              <li>
                Tiers apply when MAGI is more than a threshold; the top tier applies at or above it. 2026 thresholds: single
                $109,000 / $137,000 / $171,000 / $205,000 / $500,000; joint $218,000 / $274,000 / $342,000 / $410,000 /
                $750,000. Monthly surcharges per person (Part B + Part D): $95.70, $240.40, $385.00, $529.60, $578.00.
              </li>
              <li>
                Later years: thresholds grow at the inflation rate and are rounded to the nearest $1,000, as the statute
                requires; the top tier stays at $500,000 / $750,000 through 2027. Surcharges grow at the same rate.
              </li>
              <li>Annual surcharge = monthly surcharge × 12 × the number of people on Medicare.</li>
            </ul>
          </section>

          <section>
            <h3>Sources</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>IRS Publication 590-B, Distributions from Individual Retirement Arrangements (IRAs), Appendix B, Table III.</li>
              <li>Treas. Reg. §1.401(a)(9)-9 (life expectancy and distribution period tables), as amended by T.D. 9930 (November 2020), effective 2022.</li>
              <li>Treas. Reg. §1.401(a)(9) final regulations (T.D. 10001) and proposed regulations, published July 19, 2024.</li>
              <li>SECURE Act (2019) §114; SECURE 2.0 Act (2022) §107 (applicable age), §307 (QCD indexing), §325 (Roth 401(k)).</li>
              <li>IRC §408(d)(8) (qualified charitable distributions), including the reduction for deductible contributions after age 70½ added by the SECURE Act (2019) §107; IRS notices announcing the indexed QCD limit.</li>
              <li>IRS Rev. Proc. 2025-32 (2026 inflation adjustments); IRC §1, §63, §86 (Social Security), §151(d)(5) (senior deduction, Pub. L. 119-21), §1411 (NIIT).</li>
              <li>IRS Publications 590-A and 590-B (2025), 915 (2025, Social Security), 501 (2025, age 65 and filing status), and 551 (basis of inherited property); Schedule 1-A (Form 1040), Part V (senior deduction); IRS Notices 2023-75 and 2025-67 (QCD limits) and 2024-35; Announcement 2026-7.</li>
              <li>Treas. Reg. §1.401(a)(9)-2 (applicable age), -5 (10-year rule and annual beneficiary RMDs), -9 (Single Life, Joint and Last Survivor, and Uniform Lifetime tables), §1.408A-6 (Roth IRAs), as published in the eCFR on October 27, 2026.</li>
              <li>Social Security Act §1839(i) (Part B income-related premium) and §1860D-13(a)(7) (Part D); CMS announcement of 2026 Medicare Part B premiums and IRMAA amounts.</li>
            </ul>
            <p className="mt-2 text-xs text-muted">
              Verification notes, dates, and any figures confirmed only through secondary sources are recorded in the
              project’s research log (docs/research.md).
            </p>
          </section>

          <section>
            <h3>Known limitations</h3>
            <ul className="list-disc space-y-1 pl-5" data-testid="limitations">
              {KNOWN_LIMITATIONS.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Privacy</h3>
            <p>
              All calculations run in your browser. Nothing you enter is stored or sent anywhere; refreshing the page resets
              to the default hypothetical scenario.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
