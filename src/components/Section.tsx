import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Short status shown beside the title, e.g. "3 years". */
  badge?: string;
  /** Shown under the title while the section is closed, e.g. a one-line summary of its values. */
  summary?: ReactNode;
  /** Use an Edit / Done button instead of the chevron (for sections that are set once). */
  editToggle?: boolean;
  /** Opens the section, e.g. when one of its inputs has an error. */
  forceOpen?: boolean;
  testId?: string;
}

/** Collapsible sidebar section. Closed content stays in the page (hidden), so inputs keep their state. */
export function Section({ title, children, defaultOpen = true, badge, summary, editToggle, forceOpen, testId }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  return (
    <section className="border-b border-line-soft last:border-b-0" data-testid={testId}>
      <h2>
        <button
          type="button"
          className="xp-section-header flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="section-title">{title}</span>
          <span className="flex items-center gap-2">
            {badge && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">{badge}</span>}
            {editToggle ? (
              <span className="btn min-h-8 px-2.5 py-0.5 text-xs" aria-hidden>
                {open ? 'Done' : 'Edit'}
              </span>
            ) : (
              <ChevronDown aria-hidden className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
            )}
          </span>
        </button>
      </h2>
      {summary && !open && <div className="-mt-1 px-4 pb-3">{summary}</div>}
      <div id={id} hidden={!open} className="space-y-3 px-4 pb-4">
        {children}
      </div>
    </section>
  );
}
