/** Small trading-world marks for hub desk cards. */

type IconProps = { className?: string };

/** Classic OHLC candlesticks — Options / equity desk. */
export function CandlesMark({ className = "h-10 w-10" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="40" height="40" rx="10" fill="#ecfdf5" />
      <g strokeLinecap="round">
        <line x1="11" y1="10" x2="11" y2="28" stroke="#5eead4" strokeWidth="1.5" />
        <rect x="8" y="14" width="6" height="10" rx="1" fill="#0f766e" />
        <line x1="20" y1="8" x2="20" y2="26" stroke="#5eead4" strokeWidth="1.5" />
        <rect x="17" y="12" width="6" height="8" rx="1" fill="#b91c1c" />
        <line x1="29" y1="12" x2="29" y2="30" stroke="#5eead4" strokeWidth="1.5" />
        <rect x="26" y="16" width="6" height="10" rx="1" fill="#0f766e" />
      </g>
    </svg>
  );
}

/** Upward price path — Futures / continuous contract vibe. */
export function FuturesMark({ className = "h-10 w-10" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="40" height="40" rx="10" fill="#f5e6d0" />
      <path
        d="M8 28 L14 22 L19 25 L27 14"
        stroke="#8a5420"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M24 14 H32 V22"
        stroke="#c9893a"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="27" cy="14" r="2.2" fill="#8a5420" />
    </svg>
  );
}

/** Bitcoin orange coin — Crypto / Coinbase desk. */
export function BitcoinMark({ className = "h-10 w-10" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="20" cy="20" r="18" fill="#f7931a" />
      <path
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        d="M16.8 10.2v2M22.2 10.2v2M16.8 28v2M22.2 28v2"
      />
      <text
        x="20"
        y="26"
        textAnchor="middle"
        fontFamily="Arial Black, Arial, Helvetica, sans-serif"
        fontSize="16"
        fontWeight="800"
        fill="#fff"
      >
        B
      </text>
    </svg>
  );
}


