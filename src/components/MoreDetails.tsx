import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';

/** "More details" disclosure for rarely changed inputs inside a section. Closed content stays in the page, hidden. */
export function MoreDetails({ label, children, forceOpen }: { label: string; children: ReactNode; forceOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  return (
    <div className="border-t border-line-soft pt-3">
      <button
        type="button"
        className="flex min-h-9 items-center gap-1 text-left text-sm font-medium text-accent"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Fewer details' : label}
      </button>
      <div id={id} hidden={!open} className="mt-3 space-y-4">
        {children}
      </div>
    </div>
  );
}
