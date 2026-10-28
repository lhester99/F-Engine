/**
 * Standard disclosure text. Shown in the page footer, in presentation mode, and
 * on the printed client summary; there is no setting to hide it.
 */
export const DISCLOSURE_TEXT = [
  'This is a hypothetical illustration based on the assumptions shown. It is not a recommendation, forecast, or tax, legal, or investment advice. Actual results will differ.',
  'Investment returns, inflation, tax rates, and other income are assumptions. Tax figures are estimates at the marginal rates entered and are not a tax calculation. IRMAA figures are estimates; thresholds and surcharges after 2026 are projected.',
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
