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
    id: "sbc",
    strategyKey: null,
    name: "Structure Bias Continuation",
    shortName: "SBC",
    markets: "NQ / MNQ · ES (futures) — discretionary; chart + BoS/ChoCh indicator",
    summary:
      "Trade only with the 1H structural bias (last ChoCh/BOS). Wait for a 15m Order Block, Breaker, or FVG in that direction, then take a 1m/3m confirmation inside the zone — never chase mid-range.",
    sessionWindow: "NY kill zone preferred · stand down if any checklist item is missing",
    riskNotes: [
      "Golden rule: 1H bearish → ignore blue/bullish OBs for entries; 1H bullish → ignore red/bearish OBs",
      "15m ChoCh against 1H is usually pullback noise — it does not flip HTF bias",
      "Operate the first valid zone (Zone A); Zone B only if A fails",
      "Do not predict ‘liquidity higher’ — wait for price in a real red/blue box",
      "R:R ≥ 1:2; SL beyond zone/sweep extreme",
      "If one checklist item is missing → NO TRADE",
    ],
    invalidation: [
      "1H prints opposite ChoCh/BOS → bias flips; cancel open thesis",
      "Price breaks through Zone A against your side without trigger → zone dead",
      "Entered mid-impulse away from zone (chase) → not a valid SBC trade",
      "Strong close back through the 15m zone after entry → flatten / cancel",
    ],
    entrySteps: [
      {
        id: "sbc-e1",
        label: "Confirm 1H bias from the latest ChoCh or BOS only",
        detail:
          "Last label to the right: red → short only; green → long only; none/range → no trade. Older opposite labels do not count.",
      },
      {
        id: "sbc-e2",
        label: "On 15m, mark valid zones with the bias (not against it)",
        detail:
          "Short bias: red OB / Breaker / bearish FVG. Long bias: blue OB / Breaker / bullish FVG. Nearest to price = Zone A.",
      },
      {
        id: "sbc-e3",
        label: "Wait for price to reach Zone A — no mid-range entries",
        detail:
          "If price is between zones with no box → stand by. Prefer a liquidity sweep of a recent high (shorts) or low (longs) into the zone.",
      },
      {
        id: "sbc-e4",
        label: "Price must be inside the zone (real box / FVG)",
        detail:
          "A wick-touch of the wrong level (e.g. ChoCh line without OB) is not an entry. Partial touch of a weak edge is low quality.",
      },
      {
        id: "sbc-e5",
        label: "1m/3m confirmation in bias direction",
        detail:
          "Short: ChoCh/BOS red in zone (ideal after local sweep). Long: ChoCh/BOS green. Enter on break candle close or first micro-retrace to 1–3m OB/FVG — not after the move already ran.",
      },
      {
        id: "sbc-e6",
        label: "Place stop and targets from the plan",
        detail:
          "SL beyond zone/sweep extreme. First target toward opposite structure / prior swing. Kill zone NY preferred.",
      },
    ],
    exitSteps: [
      {
        id: "sbc-x1",
        label: "Hard stop beyond zone or sweep — never widen",
      },
      {
        id: "sbc-x2",
        label: "Scale or trail only after +1R / clear structure",
      },
      {
        id: "sbc-x3",
        label: "If 1H bias flips against you, flatten discretionary risk",
      },
      {
        id: "sbc-x4",
        label: "No revenge second entry if Zone A invalidated without fill",
      },
    ],
    byTimeframe: [
      {
        timeframe: "1H",
        focus: "Bias filter only — ChoCh / BOS, not OB for bias",
        steps: [
          {
            id: "sbc-1h1",
            label: "Find the latest ChoCh or BOS on 1H",
          },
          {
            id: "sbc-1h2",
            label: "Red = bearish (shorts only) · Green = bullish (longs only)",
          },
          {
            id: "sbc-1h3",
            label: "Bias stays until an opposite 1H ChoCh/BOS prints",
            detail: "A 15m opposite ChoCh does not flip this.",
          },
        ],
      },
      {
        timeframe: "15m",
        focus: "Zones + continuation — never redefine HTF bias",
        steps: [
          {
            id: "sbc-15-1",
            label: "Filter chart: ignore opposite-color OBs for entries",
          },
          {
            id: "sbc-15-2",
            label: "Mark Zone A (nearest valid box/FVG) and optional Zone B",
          },
          {
            id: "sbc-15-3",
            label: "Wait for pullback into Zone A; stand by if mid-range",
          },
          {
            id: "sbc-15-4",
            label: "Quality bonus: liquidity sweep into the zone",
          },
        ],
      },
      {
        timeframe: "1m / 3m",
        focus: "Trigger only — after price is in the 15m zone",
        steps: [
          {
            id: "sbc-1m1",
            label: "Confirm ChoCh/BOS in bias direction inside the zone",
          },
          {
            id: "sbc-1m2",
            label: "Enter on confirm close or micro-retrace — never chase the impulse",
          },
          {
            id: "sbc-1m3",
            label: "If confirm already ran far from zone → wait next cycle, do not FOMO",
          },
        ],
      },
    ],
  },
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
];

export function getPlaybook(id: string): StrategyPlaybook | undefined {
  return STRATEGY_PLAYBOOKS.find((p) => p.id === id);
}
