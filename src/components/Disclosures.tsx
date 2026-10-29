/**
 * Standard disclosure text. Shown in the page footer, in presentation mode, and
 * on the printed client summary; there is no setting to hide it.
 */
export const DISCLOSURE_TEXT = [
  'This is a hypothetical illustration based on the assumptions shown. It is not a recommendation, forecast, or tax, legal, or investment advice. Actual results will differ.',
  'Investment returns, inflation, income, and the heirs’ tax rate are assumptions. Tax and IRMAA figures are estimates based on current law and simplified rules, not a tax return; brackets, deductions, and IRMAA thresholds after 2026 are projected, and tax law can change.',
  'Lower required minimum distributions are not automatically better. Strategies such as Roth conversions move taxable income between years and involve trade-offs. Consult a tax professional before acting.',
];

export function Disclosures({ compact }: { compact?: boolean }) {
  return (
    <section aria-label="Disclosures" className={`text-muted ${compact ? 'text-xs' : 'text-xs sm:text-sm'} space-y-1 leading-relaxed`} data-testid="disclosures">
      {DISCLOSURE_TEXT.map((t) => (
        <p key={t}>{t}</p>
      ))}
    </section>
  );
}
