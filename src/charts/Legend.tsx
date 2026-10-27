import type { ReactNode } from 'react';

export interface LegendItem {
  label: string;
  swatch: ReactNode;
}

/** HTML legend: each entry pairs a swatch (texture, line style, or marker shape) with a text label. */
export function ChartLegend({ items, label }: { items: LegendItem[]; label: string }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label={label}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-flex">
            {it.swatch}
          </span>
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export const SolidSwatch = ({ color }: { color: string }) => (
  <svg width="14" height="14">
    <rect width="14" height="14" rx="2" fill={color} />
  </svg>
);

export const HatchSwatch = () => (
  <svg width="14" height="14">
    <defs>
      <pattern id="legend-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
        <rect width="5" height="5" fill="#e3e7ec" />
        <line x1="0" y1="0" x2="0" y2="5" stroke="var(--color-baseline)" strokeWidth="2" />
      </pattern>
    </defs>
    <rect width="14" height="14" rx="2" fill="url(#legend-hatch)" />
  </svg>
);

export const LineSwatch = ({ color, dashed, marker }: { color: string; dashed?: boolean; marker?: 'square' }) => (
  <svg width="24" height="14">
    <line x1="1" y1="7" x2="23" y2="7" stroke={color} strokeWidth="2" strokeDasharray={dashed ? '5 3' : undefined} />
    {marker === 'square' && <rect x="8" y="3" width="8" height="8" fill={color} />}
  </svg>
);
