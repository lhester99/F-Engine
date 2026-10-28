import type { Finding } from '../calculations/findings';

/** Plain-English summary shown above the chart. */
export function Findings({ findings, large }: { findings: Finding[]; large?: boolean }) {
  if (findings.length === 0) return null;
  return (
    <section className="panel px-4 py-3 sm:px-5 sm:py-4" aria-labelledby="findings-title" data-testid="findings">
      <h2 id="findings-title" className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">
        Key findings
      </h2>
      <dl className={`grid gap-x-6 gap-y-2.5 ${large ? 'text-base sm:text-lg' : 'text-sm'} md:grid-cols-[minmax(9rem,auto)_1fr]`}>
        {findings.map((f) => (
          <div key={f.id} className="contents" data-testid={`finding-${f.id}`}>
            <dt className="font-semibold text-ink">{f.title}</dt>
            <dd className="text-ink-2">{f.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
