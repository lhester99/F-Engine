import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PUBLISHED_QCD_LIMITS } from '../data/qcdLimits';
import { formatUsd } from '../utils/format';

export const KNOWN_LIMITATIONS = [
  'One person only in this version. Spousal projections and the Joint and Last Survivor Table (spouse sole beneficiary more than 10 years younger) are not yet modeled; the Uniform Lifetime Table is always used.',
  'Traditional and Roth IRAs only. 401(k), 403(b), SEP and SIMPLE IRAs, Roth 401(k)s, and the still-working exception are not yet modeled.',
  'Inherited accounts, non-spouse beneficiaries, the 10-year rule, death of a spouse during the projection, and spousal rollovers are out of scope.',
  'Assumes none of the current year’s RMD has been taken yet. If the first RMD year was last year and that RMD was deferred to April 1 of this year, the deferred amount is not modeled.',
  'One constant annual return is applied to every account in every year. Real returns vary; sequence of returns is not modeled.',
  'All flows (RMDs, QCDs, withdrawals, conversions, contributions) are assumed to occur before the year’s growth, which slightly understates growth compared with mid-year or year-end withdrawals.',
  'RMDs, QCDs, extra withdrawals, and conversions are taken pro rata across Traditional IRAs. IRS rules allow the IRA RMD total to come from any IRA, so actual account-level balances may differ.',
  'QCDs are modeled annually. In the year age 70½ is reached, a QCD is only valid if made on or after the 70½ date. The one-time QCD to a split-interest entity is not modeled.',
  'QCD limits after the latest published year use an editable assumed value (default: held flat), which understates future inflation indexing.',
  'No income tax, IRMAA, Social Security, or penalty calculations. Tax withheld on conversions is shown but not reconciled to a tax liability. The 10% early-distribution penalty before age 59½ is not modeled.',
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
            </ul>
          </section>

          <section>
            <h3>Sources</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>IRS Publication 590-B, Distributions from Individual Retirement Arrangements (IRAs), Appendix B, Table III.</li>
              <li>Treas. Reg. §1.401(a)(9)-9 (life expectancy and distribution period tables), as amended by T.D. 9930 (November 2020), effective 2022.</li>
              <li>Treas. Reg. §1.401(a)(9) final regulations (T.D. 10001) and proposed regulations, published July 19, 2024.</li>
              <li>SECURE Act (2019) §114; SECURE 2.0 Act (2022) §107 (applicable age), §307 (QCD indexing), §325 (Roth 401(k)).</li>
              <li>IRC §408(d)(8) (qualified charitable distributions); IRS notices announcing the indexed QCD limit.</li>
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
