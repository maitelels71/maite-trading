/** Strategy playbooks — process rules by timeframe (not broker logic). */

export type PlaybookStep = {
  id: string;
  label: string;
  detail?: string;
};

export type PlaybookTimeframe = {
  timeframe: string;
  focus: string;
  steps: PlaybookStep[];
};

export type StrategyPlaybook = {
  id: string;
  /** Matches backend strategy registry name when scannable */
  strategyKey: string | null;
  name: string;
  shortName: string;
  markets: string;
  summary: string;
  sessionWindow: string;
  riskNotes: string[];
  invalidation: string[];
  entrySteps: PlaybookStep[];
  exitSteps: PlaybookStep[];
  byTimeframe: PlaybookTimeframe[];
};

export const STRATEGY_PLAYBOOKS: StrategyPlaybook[] = [
  {
    id: "orb",
    strategyKey: "opening_range_breakout",
    name: "Opening Range Breakout",
    shortName: "ORB",
    markets: "Equities / ETFs (Schwab) · Futures (TradeAdvocate)",
    summary:
      "Trade the break of the opening range after the first N minutes. Best when the open is directional and red-folder risk is managed.",
    sessionWindow: "RTH open + opening range (default 5–15m), then first continuation",
    riskNotes: [
      "Skip or cut size on high-impact red events near the open",
      "1R stop beyond range extreme; do not widen after entry",
      "Max 1–2 attempts; no third chase",
      "Daily stop still overrides strategy stop",
    ],
    invalidation: [
      "Opening range too wide vs ATR (chop / news open)",
      "Break and immediate reclaim back inside range",
      "Bias conflict (strong overnight inventory against the break)",
    ],
    entrySteps: [
      {
        id: "orb-e1",
        label: "Mark opening range high / low",
        detail: "From session open for configured minutes (e.g. 5 or 15).",
      },
      {
        id: "orb-e2",
        label: "Confirm session bias",
        detail: "Gap + overnight inventory + higher-timeframe context agree with the break side.",
      },
      {
        id: "orb-e3",
        label: "Wait for clean break + hold",
        detail: "Close outside range (or candle acceptance), not a wick-only spike.",
      },
      {
        id: "orb-e4",
        label: "Enter with stop beyond opposite extreme",
        detail: "Long break → stop under range low; short break → stop over range high.",
      },
      {
        id: "orb-e5",
        label: "Scale or trail only after +1R",
        detail: "First target OR mid / measured move; trail only with structure.",
      },
    ],
    exitSteps: [
      { id: "orb-x1", label: "Hard stop at plan level — no moving away" },
      { id: "orb-x2", label: "Take partial at +1R or first structure" },
      { id: "orb-x3", label: "Flatten before major event if still open" },
      { id: "orb-x4", label: "Time stop: if no follow-through in N bars, exit" },
    ],
    byTimeframe: [
      {
        timeframe: "15m / 1h",
        focus: "Context — bias only, not entries",
        steps: [
          { id: "orb-htf1", label: "Prior day high / low and weekly level" },
          { id: "orb-htf2", label: "Is today trend day vs range day candidate?" },
          { id: "orb-htf3", label: "Where is VWAP / overnight mid relative to open?" },
        ],
      },
      {
        timeframe: "5m",
        focus: "Primary execution chart",
        steps: [
          { id: "orb-5m1", label: "Draw opening range" },
          { id: "orb-5m2", label: "Watch first break / fail / rebreak" },
          { id: "orb-5m3", label: "Manage with structure, not noise ticks" },
        ],
      },
      {
        timeframe: "1m",
        focus: "Trigger refinement only",
        steps: [
          { id: "orb-1m1", label: "Use for entry timing after 5m acceptance" },
          { id: "orb-1m2", label: "Do not invent a new thesis on 1m" },
        ],
      },
    ],
  },
  {
    id: "orb-futures",
    strategyKey: "opening_range_breakout",
    name: "ORB — Futures session",
    shortName: "ORB FUT",
    markets: "NQ · ES · GC · 6E (TradeAdvocate)",
    summary:
      "Same ORB logic on liquid futures. Prefer NQ/ES for open liquidity; respect Globex overnight range vs RTH open.",
    sessionWindow: "RTH cash open (9:30 ET) OR your defined futures OR window",
    riskNotes: [
      "Futures size in contracts from $ risk, not habit",
      "Wider stops on GC / thin hours",
      "Avoid first minutes if overnight already ran your OR",
    ],
    invalidation: [
      "Illiquid open / holiday session",
      "Event risk (FOMC, CPI) inside your OR window",
    ],
    entrySteps: [
      { id: "orf-e1", label: "Confirm contract + tick value before size" },
      { id: "orf-e2", label: "Define OR on your session clock (ET)" },
      { id: "orf-e3", label: "Break + acceptance in direction of HTF bias" },
      { id: "orf-e4", label: "Stop beyond OR extreme; 1 idea only" },
    ],
    exitSteps: [
      { id: "orf-x1", label: "Respect daily max loss in $ and contracts" },
      { id: "orf-x2", label: "Flatten into lunch chop if thesis is done" },
    ],
    byTimeframe: [
      {
        timeframe: "15m",
        focus: "Bias + overnight inventory",
        steps: [
          { id: "orf-15-1", label: "Overnight high/low vs RTH open" },
          { id: "orf-15-2", label: "Aligned with equity index tone?" },
        ],
      },
      {
        timeframe: "5m / 1m",
        focus: "Execution",
        steps: [
          { id: "orf-5-1", label: "OR box clear on chart" },
          { id: "orf-5-2", label: "Break hold — no FOMO mid-bar" },
        ],
      },
    ],
  },
  {
    id: "pullback",
    strategyKey: null,
    name: "Trend pullback (playbook draft)",
    shortName: "PULL",
    markets: "Any liquid symbol with clear HTF trend",
    summary:
      "Draft playbook — not wired to the scan engine yet. Trade with-trend pullbacks to VWAP / prior structure after a confirmed trend day.",
    sessionWindow: "After first hour once trend is established",
    riskNotes: [
      "Only with HTF trend + higher lows / lower highs",
      "No countertrend 'hero' fades in this playbook",
    ],
    invalidation: [
      "Break of trend structure",
      "News flip of bias",
    ],
    entrySteps: [
      { id: "pb-e1", label: "HTF trend confirmed" },
      { id: "pb-e2", label: "Pullback to VWAP or last breakout level" },
      { id: "pb-e3", label: "Trigger candle in trend direction" },
    ],
    exitSteps: [
      { id: "pb-x1", label: "Stop beyond pullback extreme" },
      { id: "pb-x2", label: "Trail under/over higher lows / lower highs" },
    ],
    byTimeframe: [
      {
        timeframe: "1h / 15m",
        focus: "Trend definition",
        steps: [
          { id: "pb-htf1", label: "Series of HH/HL or LH/LL" },
          { id: "pb-htf2", label: "Location vs value (VWAP)" },
        ],
      },
      {
        timeframe: "5m",
        focus: "Pullback entry",
        steps: [
          { id: "pb-5m1", label: "Wait for pullback to complete" },
          { id: "pb-5m2", label: "Enter on reclaim / continuation print" },
        ],
      },
    ],
  },
];

export function getPlaybook(id: string): StrategyPlaybook | undefined {
  return STRATEGY_PLAYBOOKS.find((p) => p.id === id);
}
