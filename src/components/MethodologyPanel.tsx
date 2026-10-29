import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PUBLISHED_QCD_LIMITS } from '../data/qcdLimits';
import { formatUsd } from '../utils/format';

export const KNOWN_LIMITATIONS = [
  'One person’s IRAs only in this version. A spouse can be entered for joint filing (deductions and Medicare), but the spouse’s own IRAs, the first spouse’s death, and the switch to single filing are not modeled yet. The Joint and Last Survivor Table (spouse sole beneficiary more than 10 years younger) is not used.',
  'Traditional and Roth IRAs only. 401(k), 403(b), SEP and SIMPLE IRAs, Roth 401(k)s, and the still-working exception are not yet modeled.',
  'Heirs are represented only by one tax rate applied to the pre-tax balance left at the end. The 10-year rule and heirs’ own brackets are not modeled yet. Accounts the client has already inherited, and trusts as beneficiaries, are out of scope.',
  'Assumes none of the current year’s RMD has been taken yet. If the first RMD year was last year and that RMD was deferred to April 1 of this year, the deferred amount is not modeled.',
  'One constant annual return is applied to every account in every year. Real returns vary; sequence of returns is not modeled.',
  'All flows (RMDs, QCDs, withdrawals, conversions, contributions) are assumed to occur before the year’s growth, which slightly understates growth compared with mid-year or year-end withdrawals.',
  'RMDs, QCDs, extra withdrawals, and conversions are taken pro rata across Traditional IRAs. IRS rules allow the IRA RMD total to come from any IRA, so actual account-level balances may differ.',
  'QCDs are modeled annually. In the year age 70½ is reached, a QCD is only valid if made on or after the 70½ date. The one-time QCD to a split-interest entity is not modeled.',
  'QCD limits after the latest published year use an editable assumed value (default: held flat), which understates future inflation indexing.',
  'Federal tax is an estimate from the brackets, standard or itemized deduction, age-65 additions, the 2025–2028 senior deduction, Social Security taxation, capital-gains rates, and the 3.8% NIIT. Credits, AMT, the qualified business income deduction, and the 10% early-distribution penalty before 59½ are not modeled. State tax is one flat rate on income other than Social Security.',
  'Tax brackets and deductions after 2026 are projected at the inflation rate entered. Tax law can change.',
  'Entered income (Social Security, pensions, interest, dividends, itemized deductions) is held in today’s dollars and grows with inflation every year. Pensions without cost-of-living increases are overstated in later years.',
  'Conversion taxes are assumed to be paid from money outside these accounts unless withholding is set. The taxable account for unneeded RMDs, and the choice of how conversion taxes are paid, are not modeled yet.',
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
                birthday in each distribution year.
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
                Heirs’ tax: the pre-tax balance left at the end, times the heirs’ rate entered, counted one year after the
                last projection year.
              </li>
              <li>
                Present value discounts each year to the start of the first projection year, by default at the investment
                return.
              </li>
              <li>
                Breakeven heirs’ rate: the heirs’ rate at which the present-value totals are equal. Above it, the
                strategy’s estimated total is lower.
              </li>
              <li>
                QCD gifts count as income not taxed. The comparison covers taxes only and does not treat the gifts
                themselves as a cost.
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
