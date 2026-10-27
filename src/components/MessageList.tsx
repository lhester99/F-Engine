import { AlertTriangle, Ban, Info } from 'lucide-react';
import type { EngineMessage } from '../types';

const STYLE: Record<EngineMessage['severity'], { cls: string; Icon: typeof Info; label: string }> = {
  error: { cls: 'border-error/30 bg-error-soft text-error', Icon: Ban, label: 'Blocked' },
  warning: { cls: 'border-warning/30 bg-warning-soft text-warning', Icon: AlertTriangle, label: 'Note' },
  info: { cls: 'border-line bg-canvas text-ink-2', Icon: Info, label: 'Info' },
};

/** Validation messages with an icon and a text label, so severity never relies on color alone. */
export function MessageList({ messages, max, testId }: { messages: EngineMessage[]; max?: number; testId?: string }) {
  if (messages.length === 0) return null;
  const shown = max ? messages.slice(0, max) : messages;
  return (
    <ul className="space-y-1.5" data-testid={testId} aria-live="polite">
      {shown.map((m, i) => {
        const { cls, Icon, label } = STYLE[m.severity];
        return (
          <li key={`${m.code}-${m.year ?? ''}-${i}`} className={`flex gap-2 rounded-md border px-2.5 py-2 text-xs ${cls}`}>
            <Icon aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-semibold">{label}: </span>
              {m.text}
            </span>
          </li>
        );
      })}
      {max && messages.length > max && <li className="text-xs text-muted">+{messages.length - max} more</li>}
    </ul>
  );
}
