/**
 * Wall Street Charging Bull–inspired mark.
 * Side profile: lowered head, upward horns, raised curl tail, bronze metal.
 */
export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="mtBronze" x1="6" y1="4" x2="74" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f5d78e" />
          <stop offset="0.35" stopColor="#c9893a" />
          <stop offset="0.7" stopColor="#8a5420" />
          <stop offset="1" stopColor="#5c3512" />
        </linearGradient>
        <linearGradient id="mtBronzeHi" x1="20" y1="12" x2="50" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffe9b0" stopOpacity="0.85" />
          <stop offset="1" stopColor="#c9893a" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Shadow */}
      <ellipse cx="40" cy="58" rx="28" ry="3.5" fill="#3b2410" opacity="0.35" />

      {/* Body + neck + head (charging forward, left→right) */}
      <path
        fill="url(#mtBronze)"
        d="M14 42c1-8 6-13 13-14 2-7 8-12 16-12 3 0 5.5 1 7.5 3
           l4-6c1.2-1.8 4-.8 3.8 1.4L57 20c5 1.5 9 6 9.5 11.5.4 4.5-1.5 8-4.5 10.5
           l-1 6.5c-.4 2.2-2.6 3.4-4.6 2.4l-3.5-1.6c-1.5 3.5-5 5.8-9 5.8H32
           c-5 0-9-2.6-11.2-6.5l-5 1.4c-2.2.6-4.2-1.2-4-3.4L12.2 40
           c-2.8-1.2-4.6-4.5-3.6-8z"
      />

      {/* Raised S-curve tail */}
      <path
        fill="url(#mtBronze)"
        d="M18 34c-4-1-7 1-8 5-1 3 1 5 3.5 5.5 2 .4 3.5-1 4-2.5.4 2.5 2 4 4 4
           2.2 0 3.5-1.8 3.2-3.8-.4-2.8-3.2-5.5-6.7-8.2z"
      />

      {/* Front horns (curving up) */}
      <path
        stroke="url(#mtBronze)"
        strokeWidth="3.2"
        strokeLinecap="round"
        d="M58 18c4-7 10-10 16-10"
      />
      <path
        stroke="#8a5420"
        strokeWidth="3"
        strokeLinecap="round"
        d="M54 16c1.5-6-1-11-6-14"
      />

      {/* Muscular shoulder highlight */}
      <path
        fill="url(#mtBronzeHi)"
        d="M28 28c6-3 14-2.5 20 1.5-3 4-10 5.5-20-1.5z"
      />

      {/* Eye */}
      <circle cx="62" cy="28" r="1.7" fill="#2a1608" />

      {/* Front leg thrust */}
      <path
        fill="#8a5420"
        d="M52 46c1.5 3 2 6 1 9h-4c.5-3 0-6-1.5-9 1.5-.5 3-.5 4.5 0z"
      />
      <path
        fill="#5c3512"
        d="M36 48c1 3 1.2 6 .4 8.5h-3.5c.6-2.5.2-5.2-.8-8 .8-.4 2.2-.6 3.9-.5z"
      />
    </svg>
  );
}
