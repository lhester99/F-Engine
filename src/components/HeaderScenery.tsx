/**
 * Decorative backdrop for the header: sky, sweeping light streaks, and rolling
 * green hills across the full width, matching the Retirement XP logo. It
 * stretches to the header's size (strokes keep their width).
 */
export function HeaderScenery() {
  return (
    <svg
      aria-hidden
      className="xp-scenery pointer-events-none absolute inset-0 h-full w-full print:hidden"
      viewBox="0 0 1440 112"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="xp-sky" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#014ab1" />
          <stop offset="0.35" stopColor="#0657c6" />
          <stop offset="0.75" stopColor="#1268d8" />
          <stop offset="1" stopColor="#1f78e6" />
        </linearGradient>
        <radialGradient id="xp-glow" cx="0.72" cy="1" r="0.55" gradientTransform="matrix(1 0 0 2.2 0 -1.2)">
          <stop offset="0" stopColor="#bfe6ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#bfe6ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="xp-hill-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9bd84a" />
          <stop offset="0.5" stopColor="#5fb83a" />
          <stop offset="1" stopColor="#2f8f2f" />
        </linearGradient>
        <linearGradient id="xp-hill-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5cb840" />
          <stop offset="0.6" stopColor="#2a8a2f" />
          <stop offset="1" stopColor="#1d6f2a" />
        </linearGradient>
        <filter id="xp-soft" x="-5%" y="-50%" width="110%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      <rect width="1440" height="112" fill="url(#xp-sky)" />
      <rect width="1440" height="112" fill="url(#xp-glow)" />
      {/* Light streaks: a soft glow under a thin bright line. */}
      {[
        'M -20 30 C 260 60, 520 104, 900 86 S 1300 40, 1470 52',
        'M -20 58 C 300 70, 640 112, 1000 94 S 1330 66, 1470 74',
        'M 420 112 C 700 70, 1050 30, 1470 18',
      ].map((d, i) => (
        <g key={d} fill="none" vectorEffect="non-scaling-stroke">
          <path d={d} stroke="#7fd3ff" strokeOpacity={0.35 - i * 0.05} strokeWidth={5} filter="url(#xp-soft)" vectorEffect="non-scaling-stroke" />
          <path d={d} stroke="#e8f7ff" strokeOpacity={0.75 - i * 0.12} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      {/* Rolling hills along the bottom. */}
      <path d="M 0 104 C 220 92, 420 96, 640 98 S 1000 80, 1200 84 S 1380 92, 1440 90 L 1440 112 L 0 112 Z" fill="url(#xp-hill-back)" />
      <path d="M 0 108 C 260 104, 520 100, 760 104 S 1120 94, 1300 98 S 1420 104, 1440 103 L 1440 112 L 0 112 Z" fill="url(#xp-hill-front)" />
      <path
        d="M 0 104 C 220 92, 420 96, 640 98 S 1000 80, 1200 84 S 1380 92, 1440 90"
        fill="none"
        stroke="#d9f5a0"
        strokeOpacity="0.7"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
