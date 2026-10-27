import { useRef, type MouseEvent, type TouchEvent } from 'react';

/**
 * Horizontal plot-area insets (px) of the chart inside its wrapper (left margin +
 * Y-axis width, right margin) and how categories sit on the X axis: 'band'
 * (bar charts: equal slots) or 'point' (line charts: first and last points on the edges).
 */
export interface PlotInsets {
  left: number;
  right: number;
  scale: 'band' | 'point';
}

/**
 * Click-or-tap selection of a year in a chart. The pointer's x position is
 * mapped to a category, so selection doesn't depend on the chart library's
 * hover state (which touch browsers don't reliably set before a click).
 * Taps are handled on touch end; drags (scrolling) are ignored.
 */
export function useChartSelection<T extends { year: number }>(
  rows: T[],
  onSelectYear: (year: number) => void,
  insets: PlotInsets,
) {
  const start = useRef<{ x: number; y: number } | null>(null);

  const selectAt = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const plotWidth = rect.width - insets.left - insets.right;
    const x = clientX - rect.left - insets.left;
    const n = rows.length;
    if (plotWidth <= 0 || x < 0 || x > plotWidth || n === 0) return;
    const idx = insets.scale === 'band' ? Math.floor((x / plotWidth) * n) : Math.round((x / plotWidth) * (n - 1));
    const row = rows[Math.min(n - 1, idx)];
    if (row) onSelectYear(row.year);
  };

  return {
    onClick: (e: MouseEvent<HTMLDivElement>) => selectAt(e.clientX, e.currentTarget),
    onTouchStart: (e: TouchEvent<HTMLDivElement>) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: TouchEvent<HTMLDivElement>) => {
      const t = e.changedTouches[0];
      const s = start.current;
      start.current = null;
      if (!t || !s || Math.hypot(t.clientX - s.x, t.clientY - s.y) > 10) return;
      selectAt(t.clientX, e.currentTarget);
    },
  };
}
