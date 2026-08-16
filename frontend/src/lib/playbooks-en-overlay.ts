/** English overlays for strategy playbooks (Spanish source stays in playbooks-*.ts). */

import type { StrategyPlaybook } from "@/lib/playbook-types";

export type PlaybookEnOverlay = Partial<
  Pick<
    StrategyPlaybook,
    "name" | "summary" | "markets" | "sessionWindow" | "riskNotes" | "invalidation"
  >
> & {
  entrySteps?: Array<{ id: string; label: string; detail?: string }>;
  exitSteps?: Array<{ id: string; label: string; detail?: string }>;
  byTimeframe?: Array<{
    timeframe: string;
    focus: string;
    steps: Array<{ id: string; label: string; detail?: string }>;
  }>;
};

const CR_EXIT_EN = [
  {
    id: "cr-x1",
    label: "Take profit (your rule or 100%+)",
    detail: "The market can take it back — don't wait for expiration.",
  },
  {
    id: "cr-x2",
    label: "Set ~2× limit on entry (good habit when starting)",
    detail: "E.g. bought at 0.80 → limit sell 1.60.",
  },
  {
    id: "cr-x3",
    label: "After channel break: hold 2–4 days if it opens green",
    detail: "If next day opens RED with profit → sell (exhaustion).",
  },
  {
    id: "cr-x4",
    label: "Draw gap/day floor and sell if red candle breaks it",
  },
  {
    id: "cr-x5",
    label: "Never let expire — sell to close (market if past the open)",
  },
] as const;

const OPT_RULES_EN = [
  "Expiration ~1 week (fast). Thu/Fri → following Friday",
  "SPY: Mon/Wed/Fri — don't buy same-day by mistake",
  "OTM strike in profitable premium range (SPY 0.25–0.30 · AAPL/META 0.45–0.80)",
  "Never buy a forming candle — wait for Hora candle close",
  "Volume + solid green/red candles",
];

/** English overlays keyed by playbook id (cr01…cr11, e01–e04, ml01). */
export const PLAYBOOK_EN: Record<string, PlaybookEnOverlay> = {
  e01: {
    name: "Bollinger H trend flip",
    markets: "CALL/PUT options · BB Hora + 15m · trendline",
    summary:
      "After ≥2-day trend, on HORA break trendline AND BB mid (full candle or gap). Then 15m mid in favor → CALL/PUT. 35% plan (not 100%). Scan: Hora mid flip + aligned 15m (trendline = checklist).",
    sessionWindow: "Intraday / 1–3 days · confirm on Hora, enter on 15m",
    riskNotes: [
      "10 / 20 / 35% plan — NOT for 100% plan",
      "Both breaks (line + mid) required — one alone = no entry",
      "Full Hora candle (10:00–16:00 = 4×15m); 1st hour = 2×15m exception",
      "At MA40 without the 35% → exit. Prior H-Line may be the real ceiling",
      "Scan doesn't draw the A→B line — confirm on chart before click",
    ],
    invalidation: [
      "Prior trend < 2 days",
      "Breaks line OR mid only (missing the second)",
      "Incomplete / neutral / half-formed Hora candle",
      "15m still against (CALL: bearish mid / PUT: bullish mid)",
      "Continuation (bear→bear) with no real change",
      "FED / earnings today",
    ],
    entrySteps: [
      {
        id: "e01-e1",
        label: "Draw trendline (≥2 touches, ≥2 days)",
        detail: "CALL: descending highs above. PUT: ascending lows below.",
      },
      {
        id: "e01-e2",
        label: "HORA: trendline break (full candle or gap)",
        detail: "Don't confirm on half-formed 15/30 min.",
      },
      {
        id: "e01-e3",
        label: "HORA: BB mid break (both required)",
        detail: "Gap breaking both = OK immediately. Otherwise wait for the second.",
      },
      {
        id: "e01-e4",
        label: "15m: mid in favor → enter at that candle close",
        detail: "CALL: bullish mid · PUT: bearish mid. Mnemonic L-T-2H-15-C/P.",
      },
      {
        id: "e01-e5",
        label: "Execute ATM · spread OK · expiry aligned · plan ≤35%",
      },
    ],
    exitSteps: [
      { id: "e01-x1", label: "Minimum target: Hora mid already broken (req. 3)" },
      { id: "e01-x2", label: "Ceiling: Hora MA40 or prior H-Line" },
      { id: "e01-x3", label: "1–3 day window — organic pullbacks OK" },
      { id: "e01-x4", label: "No confidence for 1–3 day hold → paper only" },
    ],
    byTimeframe: [
      {
        timeframe: "Día",
        focus: "Big picture",
        steps: [
          { id: "e01-d1", label: "Prior trend ≥2 days visible" },
          { id: "e01-d2", label: "Edge lines / MA40 / FED-earnings check" },
        ],
      },
      {
        timeframe: "Hora",
        focus: "Confirmation (50% of BB analysis)",
        steps: [
          { id: "e01-h1", label: "Line A→B + BB mid" },
          { id: "e01-h2", label: "Wait for full Hora candle" },
          { id: "e01-h3", label: "Both breaks before looking at 15m" },
        ],
      },
      {
        timeframe: "15m",
        focus: "Entry timing",
        steps: [
          { id: "e01-15-1", label: "BB mid favoring new bias" },
          { id: "e01-15-2", label: "Enter at close — not mid-candle" },
        ],
      },
    ],
  },

  e02: {
    name: "Daily mid bounce",
    markets: "CALL/PUT options · BB Día (MA20 marked) + Hora + 15m",
    summary:
      "Price approaches DÍA MA20 over days, respects it (doesn't break), bounces on 15m, and enters only with full HORA candle in favor. D↑ H↓ → CALL · D↓ H↑ → PUT.",
    sessionWindow: "Intraday / multi-day · patience (15m–2 days)",
    riskNotes: [
      "Plan up to 100% · patience required",
      "15m is signal — NEVER the entry; Hora confirms",
      "Mark DÍA MA20 on chart or you're trading blind",
      "Expiry Thu PM / Fri AM → following week",
      "Scan: D mid + H pullback + Hora confirm — 15m bounce still follows checklist",
    ],
    invalidation: [
      "No DÍA MA20 marked on chart",
      "DÍA not clearly bullish (CALL) / bearish (PUT)",
      "Breaks daily level instead of respecting it",
      "Enter on 15m bounce alone without Hora candle",
      "Continuation (e.g. D bearish + price falling toward mid for CALL)",
      "FED / earnings today",
    ],
    entrySteps: [
      {
        id: "e02-e1",
        label: "Mark DÍA Bollinger MA20 on chart",
        detail: "Horizontal line visible while trading Hora/15m.",
      },
      {
        id: "e02-e2",
        label: "Big picture: D and H in opposite directions",
        detail: "CALL: D bullish + H bearish. PUT: D bearish + H bullish.",
      },
      {
        id: "e02-e3",
        label: "Price approaches DÍA mid (ideal 2–3+ days)",
        detail: "Progressive approach, not a random spike.",
      },
      {
        id: "e02-e4",
        label: "Touches and respects — doesn't break the level",
        detail: "CALL stays above · PUT stays below after touch.",
      },
      {
        id: "e02-e5",
        label: "Bounce visible on 15m (YELLOW — don't enter yet)",
      },
      {
        id: "e02-e6",
        label: "Full HORA candle in favor → CALL/PUT",
        detail: "Clear bullish for CALL · clear bearish for PUT. No indecision.",
      },
    ],
    exitSteps: [
      { id: "e02-x1", label: "Let it run if big picture stays clear (no theta panic)" },
      { id: "e02-x2", label: "Target: bounce in favor from DÍA MA20 (up to 100%)" },
      { id: "e02-x3", label: "Exit if DÍA mid breaks against thesis" },
      { id: "e02-x4", label: "Clean path: exit at H-Line / MA obstacle if it blocks" },
    ],
    byTimeframe: [
      {
        timeframe: "Día",
        focus: "Bounce level",
        steps: [
          { id: "e02-d1", label: "BB mid clearly bullish or bearish" },
          { id: "e02-d2", label: "Mark MA20 as horizontal support/resistance" },
        ],
      },
      {
        timeframe: "Hora",
        focus: "Entry confirmation",
        steps: [
          { id: "e02-h1", label: "H trend opposite to D (approach)" },
          { id: "e02-h2", label: "Wait for full HORA candle — not 15/30 min" },
        ],
      },
      {
        timeframe: "15m",
        focus: "Signal only",
        steps: [
          { id: "e02-15-1", label: "See bounce — no click yet" },
          { id: "e02-15-2", label: "If 15m bounces but Hora doesn't confirm → wait" },
        ],
      },
    ],
  },

  e03: {
    name: "Magnet effect (gap → Hora MA20)",
    markets: "CALL/PUT options · TC2000 Hora MA20/40 + BB 15m + Worden Stoch vol",
    summary:
      "Strong ≥2-day HORA trend + extreme gap far from Hora MA20. Price acts as magnet toward MA20. Bullish+gap↑ → PUT; bearish+gap↓ → CALL.",
    sessionWindow: "Open / first 15m candles · same day or 1–2 day development",
    riskNotes: [
      "Plan up to 100% (or 10–50% per day's plan)",
      "Scan v1: Worden Stoch still manual — confirm volume on checklist",
      "Expiry Thu PM / Fri AM → following week",
      "Don't confuse with E04: here there's HORA trend, not BB15 sideways",
    ],
    invalidation: [
      "Hora MA20/40 sideways, glued, or intertwined",
      "Another MA (e.g. 100) between price and Hora MA20 (path blocked)",
      "1st 15m candle touches the band (must be 100% outside, wick included)",
      "Gap \"big\" but normal for that stock",
      "FED / earnings today",
    ],
    entrySteps: [
      {
        id: "e03-e1",
        label: "HORA: MA20/40 separating ≥2 days (clear trend)",
        detail: "MA20>MA40 bullish · MA20<MA40 bearish. No intertwining.",
      },
      {
        id: "e03-e2",
        label: "Gap/jump abnormally far from Hora MA20",
        detail: "Compare to that stock's usual jumps.",
      },
      {
        id: "e03-e3",
        label: "1st 15m candle fully 100% outside Bollinger",
        detail: "Wait for that candle close — don't anticipate.",
      },
      {
        id: "e03-e4",
        label: "On 2nd 15m: Hora volume crosses red Worden Stoch",
        detail: "Trend↑+gap↑ → PUT · Trend↓+gap↓ → CALL.",
      },
      {
        id: "e03-e5",
        label: "Clean path toward Hora MA20",
        detail: "No MA / H-Line / yesterday's close blocking the magnet.",
      },
    ],
    exitSteps: [
      { id: "e03-x1", label: "Minimum target: approach to Hora MA20" },
      { id: "e03-x2", label: "Extended: Hora MA40 if path stays clean" },
      { id: "e03-x3", label: "No panic-exit on consolidation if reqs still OK" },
      { id: "e03-x4", label: "Exit if MA obstacle appears or trend thesis breaks" },
    ],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "Trend + magnet + volume",
        steps: [
          { id: "e03-h1", label: "Panel: MA20 (yellow) + MA40 (red)" },
          { id: "e03-h2", label: "Volume + Worden Stoch (red line)" },
          { id: "e03-h3", label: "Measure gap distance vs MA20" },
        ],
      },
      {
        timeframe: "15m",
        focus: "BB exposure + timing",
        steps: [
          { id: "e03-15-1", label: "1st post-gap candle 100% outside BB" },
          { id: "e03-15-2", label: "2nd candle: confirm Hora vol → execute" },
        ],
      },
    ],
  },

  e04: {
    name: "BB15 sideways + gap (5 min)",
    markets: "CALL/PUT options · liquid underlyings (Schwab) · TC2000 BB 15m",
    summary:
      "Prior close sideways with tight Bollinger 15m. Extreme gap outside band + price already reversing → CALL/PUT in first 5 min. Different from E03 (HORA magnet).",
    sessionWindow: "First 5 minutes RTH (9:30–9:35 ET) — disables after",
    riskNotes: [
      "Plan up to 100% · move in minutes",
      "Always set limit — sometimes only reaches mid, sometimes opposite dissipator",
      "If bid/ask wild from gap, wait seconds for spread to normalize",
      "Expiry: Mon–Wed → Friday; Thu PM / Fri AM → following week",
    ],
    invalidation: [
      "15m mid not sideways (rising or falling) at prior close",
      "Wide bands / high volatility yesterday (no squeeze)",
      "Gap not extreme vs that stock's usual gaps",
      "BB vol opens on gap but does NOT start closing on reversal",
      "Entry after 9:35 ET",
      "FED / earnings today",
    ],
    entrySteps: [
      {
        id: "e04-e1",
        label: "BB 15m yesterday: sideways + tight bands",
        detail: "Flat mid; little distance between dissipators at close.",
      },
      {
        id: "e04-e2",
        label: "Extreme gap outside band + already reversing",
        detail:
          "Gap↓ far below + rising → CALL. Gap↑ far above + falling → PUT. Relative to that stock.",
      },
      {
        id: "e04-e3",
        label: "Enter within ≤5 min with normalized spread",
        detail: "ATM · limit set · don't force if spread still wild.",
      },
      {
        id: "e04-e4",
        label: "Confirm BB vol starts closing toward mid",
        detail: "If bands stay open without closing → no longer E04.",
      },
    ],
    exitSteps: [
      { id: "e04-x1", label: "Minimum target: return toward BB 15m mid" },
      {
        id: "e04-x2",
        label: "Extended target: opposite dissipator (if path allows)",
      },
      { id: "e04-x3", label: "Exit if vol stays open — thesis broken" },
      { id: "e04-x4", label: "Don't chase after the 5 min window" },
    ],
    byTimeframe: [
      {
        timeframe: "Pre-market",
        focus: "Anticipate gap",
        steps: [
          { id: "e04-pm1", label: "FED / earnings today? → STOP" },
          { id: "e04-pm2", label: "Review pre-market gap size vs ticker norm" },
          { id: "e04-pm3", label: "Yesterday BB15 sideways + squeeze? If not → skip E04" },
        ],
      },
      {
        timeframe: "15m",
        focus: "Only execution timeframe",
        steps: [
          { id: "e04-15-1", label: "Bollinger (20,2) only — no Hora MAs" },
          { id: "e04-15-2", label: "See full exposure outside band at open" },
          { id: "e04-15-3", label: "Confirm reversal direction before click" },
        ],
      },
    ],
  },

  cr01: {
    name: "Moving average 40 (CALL)",
    markets: "CALL options · Hora · MA20/MA40 + trendline",
    summary:
      "Creando Riquezas: drop toward MA40 with MA20 above MA40. Draw downtrend line; CALL when it breaks the top of that line.",
    sessionWindow: "Hora · entry after break (typically ≥11:00)",
    riskNotes: [
      ...OPT_RULES_EN,
      "If price crosses MA40 and keeps falling → not CR01 (becomes CR02)",
    ],
    invalidation: [
      "MA20 is not above MA40",
      "No drop toward / touch of MA40",
      "Buy inside channel without ceiling break",
      "Incomplete candle / hanger without confirmation",
      "FED / earnings today",
    ],
    entrySteps: [
      {
        id: "cr01-e1",
        label: "Context: MA20 above MA40 (relatively cheap zone after drop)",
      },
      {
        id: "cr01-e2",
        label: "Wait for drop that approaches or touches MA40",
      },
      {
        id: "cr01-e3",
        label: "Draw downtrend line on the drop",
      },
      {
        id: "cr01-e4",
        label: "CALL on break of line ceiling (full Hora candle)",
      },
    ],
    exitSteps: [...CR_EXIT_EN],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "Setup + entry",
        steps: [
          { id: "cr01-h1", label: "MA20 / MA40 panel" },
          { id: "cr01-h2", label: "MA40 touch + trendline break" },
        ],
      },
    ],
  },

  cr02: {
    name: "Normal / strong drop (CALL)",
    markets: "CALL options · Hora · trendline after deep drop",
    summary:
      "Creando Riquezas: strong drop that crosses MA40. Keep drawing the downtrend line until the first solid green candle → CALL.",
    sessionWindow: "Hora · after first confirmation green candle",
    riskNotes: [
      ...OPT_RULES_EN,
      "Different from CR01: price already passed MA40 to the downside",
    ],
    invalidation: [
      "Drop without clear trendline",
      "Enter on red / forming candle",
      "First \"green\" is hanger → wait for next",
      "FED / earnings today",
    ],
    entrySteps: [
      { id: "cr02-e1", label: "Hora frame: normal or strong drop (opportunity)" },
      {
        id: "cr02-e2",
        label: "If touches MA40 and keeps falling → don't use CR01; follow the line",
      },
      {
        id: "cr02-e3",
        label: "Keep trendline until solid green candle",
      },
      {
        id: "cr02-e4",
        label: "CALL at close of that green candle (full Hora)",
      },
    ],
    exitSteps: [...CR_EXIT_EN],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "Drop → first green",
        steps: [
          { id: "cr02-h1", label: "Trendline on the drop" },
          { id: "cr02-h2", label: "Enter only with clear green" },
        ],
      },
    ],
  },

  cr03: {
    name: "Bearish / sideways channel break (CALL)",
    markets: "CALL options · Hora · channel (≥2 touches)",
    summary:
      "Creando Riquezas: bearish/sideways channel with crossed MAs. Do NOT buy CALL inside. CALL only on break of channel ceiling (often runs 2–4 days).",
    sessionWindow: "Hora · ceiling break (best ≥11:00)",
    riskNotes: [
      ...OPT_RULES_EN,
      "GOLDEN RULE: no CALL inside bearish channel even with greens",
      "Best CALL trade in the academy per daily checklist",
    ],
    invalidation: [
      "CALL buy inside channel",
      "Channel without ≥2 points / no clear ceiling",
      "Break with weak / incomplete candle",
      "FED / earnings today",
    ],
    entrySteps: [
      {
        id: "cr03-e1",
        label: "Identify bearish or sideways channel (≥2 ceiling/floor touches)",
      },
      {
        id: "cr03-e2",
        label: "MA20/MA40 crossed — greens inside = no strength",
      },
      {
        id: "cr03-e3",
        label: "Wait for CEILING break (Hora candle)",
      },
      {
        id: "cr03-e4",
        label: "CALL on break — possible 2–4 day hold",
      },
    ],
    exitSteps: [...CR_EXIT_EN],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "Channel → break",
        steps: [
          { id: "cr03-h1", label: "Draw ceiling and floor" },
          { id: "cr03-h2", label: "Enter only above ceiling" },
        ],
      },
    ],
  },

  cr04: {
    name: "Normal gap up (CALL)",
    markets: "CALL options · Pre-market gap + 2 green Hora candles",
    summary:
      "Creando Riquezas: bullish gap (pre-market 7–9:30). CALL with GAP + GREEN + GREEN (typically 10:00 and 11:00). False gap = second red candle → no entry.",
    sessionWindow: "Hora · typical buy ~11:00 after 2 greens",
    riskNotes: [
      ...OPT_RULES_EN,
      "If gap coincides with channel break (CR03) = strong setup",
      "NO CALL inside bearish channel on small gap alone without 2 greens",
    ],
    invalidation: [
      "False gap: green then red",
      "Only one green candle",
      "First candle hanger and second doesn't confirm green",
      "FED / earnings today",
    ],
    entrySteps: [
      {
        id: "cr04-e1",
        label: "Detect GAP up in pre-market / open",
      },
      {
        id: "cr04-e2",
        label: "1st Hora candle bullish (green or bullish hammer — not hanger)",
        detail: "Window 9:30–10:00.",
      },
      {
        id: "cr04-e3",
        label: "2nd Hora green candle required (~11:00)",
      },
      {
        id: "cr04-e4",
        label: "CALL on 2nd green — GAP + GREEN + GREEN",
      },
    ],
    exitSteps: [...CR_EXIT_EN],
    byTimeframe: [
      {
        timeframe: "Pre-market",
        focus: "Detect gap",
        steps: [{ id: "cr04-pm1", label: "Yesterday close vs today open (jump)" }],
      },
      {
        timeframe: "Hora",
        focus: "2 green confirmation",
        steps: [
          { id: "cr04-h1", label: "10:00 bullish" },
          { id: "cr04-h2", label: "11:00 green → CALL" },
        ],
      },
    ],
  },

  cr05: {
    name: "Gap down reversal (CALL)",
    markets: "CALL options · Gap down + 2 green Hora candles (channel exception)",
    summary:
      "Creando Riquezas: opens lower (gap down) and two solid green candles follow → CALL. Exception: can buy even inside bearish channel (early signal of channel end).",
    sessionWindow: "Hora · after 2 greens; if hanger wait ~12:00",
    riskNotes: [
      ...OPT_RULES_EN,
      "Only explicit exception for CALL inside channel",
      "Often next day gives CR03 (ceiling break) — stay alert",
    ],
    invalidation: [
      "No two clear greens after gap down",
      "Second candle hanger without third confirming green",
      "FED / earnings today",
    ],
    entrySteps: [
      {
        id: "cr05-e1",
        label: "Gap down: closed positive yesterday / opens lower today (or down jump)",
      },
      {
        id: "cr05-e2",
        label: "First two Hora candles clearly green",
      },
      {
        id: "cr05-e3",
        label: "If hanger → wait for next green (~12:00)",
      },
      {
        id: "cr05-e4",
        label: "CALL — valid even inside bearish channel",
      },
    ],
    exitSteps: [...CR_EXIT_EN],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "Gap down → 2 greens",
        steps: [
          { id: "cr05-h1", label: "Confirm gap / weak open" },
          { id: "cr05-h2", label: "Green + green → CALL" },
        ],
      },
    ],
  },

  cr06: {
    name: "Strong floor MA100/200 (CALL)",
    markets: "CALL options · Daily MA100/200 + Hora channel break",
    summary:
      "Creando Riquezas: on Daily, price near/touches MA100 or MA200 (strong floor, ~every 8–12 weeks). On Hora, CALL when green candle breaks channel ceiling ≥11:00.",
    sessionWindow: "Multi-TF · Hora entry ≥11:00 after break",
    riskNotes: [
      ...OPT_RULES_EN,
      "Requires both frames: Daily (floor) + Hora (break)",
      "Possible ~2 day hold after break",
    ],
    invalidation: [
      "No clear visit to MA100/MA200 on Daily",
      "Hora break before 11:00 without full candle",
      "No drawable channel ceiling on Hora",
      "FED / earnings today",
    ],
    entrySteps: [
      {
        id: "cr06-e1",
        label: "DAILY: drop that visits / touches MA100 or MA200",
      },
      {
        id: "cr06-e2",
        label: "HORA: draw bearish channel ceiling",
      },
      {
        id: "cr06-e3",
        label: "Green bullish candle breaks ceiling ≥11:00",
      },
      {
        id: "cr06-e4",
        label: "CALL — drop + strong floor + ceiling break",
      },
    ],
    exitSteps: [...CR_EXIT_EN],
    byTimeframe: [
      {
        timeframe: "Día",
        focus: "Strong floor",
        steps: [
          { id: "cr06-d1", label: "MA100 / MA200 as support" },
          { id: "cr06-d2", label: "Price near or touching after drop" },
        ],
      },
      {
        timeframe: "Hora",
        focus: "Trigger",
        steps: [
          { id: "cr06-h1", label: "Trendline / channel ceiling" },
          { id: "cr06-h2", label: "Green break ≥11:00 → CALL" },
        ],
      },
    ],
  },

  cr07: {
    name: "PUT in bearish channel",
    markets: "PUT options · Hora · bearish channel expensive zone",
    summary:
      "Creando Riquezas: bearish channel + near ceiling (expensive zone / MA40) + green→red attempt + floor line under the bounce. PUT with RED candle breaking that floor (≥11:00).",
    sessionWindow: "Hora · PUT always ≥11:00",
    riskNotes: [
      ...OPT_RULES_EN,
      "Inside bearish channel: PUT yes / CALL no",
      "PUT is bought on red candle",
    ],
    invalidation: [
      "Outside bearish / bearish sideways channel",
      "Far from ceiling (not expensive zone)",
      "No break of bounce floor",
      "Entry before 11:00",
      "FED / earnings today",
    ],
    entrySteps: [
      { id: "cr07-e1", label: "In bearish channel (Hora)" },
      {
        id: "cr07-e2",
        label: "Near ceiling / expensive zone (and near MA40)",
      },
      {
        id: "cr07-e3",
        label: "Green→red pattern / hanger in high zone",
      },
      {
        id: "cr07-e4",
        label: "Draw floor under the rise; PUT on red break ≥11:00",
      },
    ],
    exitSteps: [
      {
        id: "cr07-x1",
        label: "Sell PUT when it gets expensive on the drop (same day / next day)",
      },
      ...CR_EXIT_EN.filter((x) => x.id !== "cr-x3"),
    ],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "4 PUT conditions",
        steps: [
          { id: "cr07-h1", label: "Channel + expensive ceiling" },
          { id: "cr07-h2", label: "Red breaks bounce floor" },
        ],
      },
    ],
  },

  cr08: {
    name: "First opening red candle (PUT)",
    markets: "PUT options · Only strategy at 10:00",
    summary:
      "Creando Riquezas: first half-hour 9:30–10:00 RED (30m) → PUT at 10:00 (best in bearish channel). Do NOT apply near strong MA200 floor on Daily.",
    sessionWindow: "10:00 sharp · then review other strategies at 11:00",
    riskNotes: [
      ...OPT_RULES_EN,
      "Only PUT bought at 10:00",
      "Check Daily: near MA200 → skip (may bounce)",
      "Fast trades — intraday PUT festival",
    ],
    invalidation: [
      "First candle not solid red",
      "Price at strong Daily floor (MA100/200)",
      "Buy after 10:00 \"just because\" without this rule",
      "FED / earnings today",
    ],
    entrySteps: [
      {
        id: "cr08-e1",
        label: "DAILY: confirm NOT at strong MA200 floor",
      },
      {
        id: "cr08-e2",
        label: "HORA: preferably inside bearish channel",
      },
      {
        id: "cr08-e3",
        label: "1st candle 9:30–10:00 RED complete",
      },
      {
        id: "cr08-e4",
        label: "PUT at 10:00 — exit on drop / 2× limit",
      },
    ],
    exitSteps: [
      {
        id: "cr08-x1",
        label: "Fast trade: sell on same-day drop",
      },
      {
        id: "cr08-x2",
        label: "~2× limit on entry",
      },
    ],
    byTimeframe: [
      {
        timeframe: "Día",
        focus: "Strong floor filter",
        steps: [{ id: "cr08-d1", label: "Near MA200? → not CR08" }],
      },
      {
        timeframe: "Hora",
        focus: "10:00",
        steps: [
          { id: "cr08-h1", label: "1st red candle close" },
          { id: "cr08-h2", label: "PUT immediately" },
        ],
      },
    ],
  },

  cr09: {
    name: "Gap floor break (PUT)",
    markets: "PUT options · Gap up or down + floor break",
    summary:
      "Creando Riquezas: there's a gap (up or down). Draw gap floor; PUT when RED candle breaks it (≥11:00). If already red at 10:00 → use CR08.",
    sessionWindow: "Mark floor at 10:00 · typical PUT ≥11:00",
    riskNotes: [
      ...OPT_RULES_EN,
      "Gap direction doesn't matter — floor break does",
      "At 10:00 only mark; wait for break red candle",
    ],
    invalidation: [
      "No gap / no drawable floor",
      "Break with incomplete candle",
      "Entry <11:00 unless CR08",
      "FED / earnings today",
    ],
    entrySteps: [
      { id: "cr09-e1", label: "Identify GAP (up or down)" },
      {
        id: "cr09-e2",
        label: "Draw gap floor line (~10:00 OK to mark)",
      },
      {
        id: "cr09-e3",
        label: "Wait for RED candle breaking floor (≥11:00)",
      },
      {
        id: "cr09-e4",
        label: "PUT on that red candle",
      },
    ],
    exitSteps: [
      {
        id: "cr09-x1",
        label: "Sell on continued drop / 2× limit",
      },
      ...CR_EXIT_EN.filter((x) => !["cr-x3"].includes(x.id)),
    ],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "Gap floor",
        steps: [
          { id: "cr09-h1", label: "Mark floor" },
          { id: "cr09-h2", label: "Red breaks → PUT" },
        ],
      },
    ],
  },

  cr10: {
    name: "Daily hanger (PUT)",
    markets: "PUT options · Daily · late day ~15:55",
    summary:
      "Creando Riquezas: hanger on Daily frame (long upper tail, small body; green or red). Best in expensive zone. PUT near close (~15:55; SPY ~16:13) when candle is formed.",
    sessionWindow: "Late · ~15:55–16:13 · Daily only",
    riskNotes: [
      ...OPT_RULES_EN,
      "Alejandro: less frequent / less recent strength — be selective",
      "Temporary hangers: wait for near-complete formation",
    ],
    invalidation: [
      "Not a clear hanger (no dominant upper tail)",
      "Cheap zone / strong floor (prefer expensive zone)",
      "Buy mid-afternoon with still unstable candle",
      "FED / earnings today",
    ],
    entrySteps: [
      {
        id: "cr10-e1",
        label: "DAILY: look for hanger (long upper wick + small body)",
      },
      { id: "cr10-e2", label: "Prefer expensive zone / ceilings" },
      {
        id: "cr10-e3",
        label: "Wait for near close (~15:55 / SPY ~16:13)",
      },
      { id: "cr10-e4", label: "PUT when hanger confirms" },
    ],
    exitSteps: [
      {
        id: "cr10-x1",
        label: "Sell on next-day drop / 2× limit",
      },
      {
        id: "cr10-x2",
        label: "If opens strong up → exit fast",
      },
    ],
    byTimeframe: [
      {
        timeframe: "Día",
        focus: "Only timeframe",
        steps: [
          { id: "cr10-d1", label: "Hanger forms in expensive zone" },
          { id: "cr10-d2", label: "Late day entry" },
        ],
      },
    ],
  },

  cr11: {
    name: "Earnings model (high risk)",
    markets: "CALL/PUT options · pre-earnings ~15:55 · OptionSlam stats",
    summary:
      "Creando Riquezas: extremely high-risk model. Prefer NOT trading earnings week and wait post-earnings (gap + CR04/CR05/…). If used: drop + strong Daily floor + OptionSlam stats + strike ~5–6% / profitable premium range.",
    sessionWindow: "Pre-close ~15:55 on report day · or skip and trade post",
    riskNotes: [
      "EXTREMELY HIGH RISK — Alejandro recommends waiting until next day",
      "Post-earnings (gap + normal strategies) is usually better",
      "Options get expensive in earnings week",
      ...OPT_RULES_EN,
    ],
    invalidation: [
      "OptionSlam stats don't favor projected move",
      "Strike needs >~10% to be in profitable premium",
      "No strong floor / no prior drop",
      "Trade on FOMO without the 4 steps",
    ],
    entrySteps: [
      {
        id: "cr11-e1",
        label: "Stock coming in on a drop",
      },
      {
        id: "cr11-e2",
        label: "DAILY: visiting strong floor MA100/MA200",
      },
      {
        id: "cr11-e3",
        label: "OptionSlam: % up/down on last reports",
        detail: "If historical moves <~6% typical → low expectation.",
      },
      {
        id: "cr11-e4",
        label: "~15:55: project +5/+7/+10% and pick strike near ~5–6%",
      },
      {
        id: "cr11-e5",
        label: "Prefer: don't buy — wait post-earnings open and apply CR04–CR09",
      },
    ],
    exitSteps: [
      {
        id: "cr11-x1",
        label: "If entered pre-report: manage at open (market if already moved)",
      },
      {
        id: "cr11-x2",
        label: "If skip: trade only classic CR setups next day",
      },
    ],
    byTimeframe: [
      {
        timeframe: "Día",
        focus: "Pre-earnings filters",
        steps: [
          { id: "cr11-d1", label: "Drop + MA100/200" },
          { id: "cr11-d2", label: "OptionSlam stats" },
        ],
      },
      {
        timeframe: "Post",
        focus: "Preferred",
        steps: [{ id: "cr11-p1", label: "See gap / CR04–CR09 at open" }],
      },
    ],
  },

  ml01: {
    name: "ChoCh + BOS Structure",
    markets: "Futures LONG/SHORT · MNQ · MES · 6E · 6A · 6B · GC · HTF zones + 3m entry",
    summary:
      "Real pullback in HTF zone (15m/1H). ChoCh = alert; BOS = entry confirmation. BUY at HTF demand · SELL at supply after break. No BOS, no entry.",
    sessionWindow: "Intraday · 15m/1H zones · 3m confirmation/entry",
    riskNotes: [
      "HTF zones = where to look for the pullback",
      "ChoCh = alert · BOS = confirmation — no BOS, no entry",
      "BUY: pullback to HTF demand → bullish ChoCh → BOS to upside",
      "SELL: pullback to HTF supply → bearish ChoCh → BOS to downside",
      "SL behind zone / setup swing; TP at liquidity / opposite zone",
    ],
    invalidation: [
      "Enter on ChoCh alone (missing BOS)",
      "Chase outside valid HTF zone",
      "Trade pullback without HTF demand/supply zone",
      "Ignore invalidation if zone breaks against you",
    ],
    entrySteps: [
      {
        id: "ml01-e1",
        label: "Mark HTF zone (15m / 1H)",
        detail: "BUY: demand. SELL: supply (e.g. broken 15m zone → supply).",
      },
      {
        id: "ml01-e2",
        label: "Wait for real pullback to zone",
        detail: "Price inside zone — no chase.",
      },
      {
        id: "ml01-e3",
        label: "3m — ChoCh (alert)",
        detail: "Change of character in favor. Do NOT enter yet.",
      },
      {
        id: "ml01-e4",
        label: "3m — BOS (confirmation)",
        detail: "Structure break. Entry after BOS.",
      },
      {
        id: "ml01-e5",
        label: "Define Entry / SL / TP",
        detail: "SL behind zone/swing. TP at prior liquidity or opposite HTF zone.",
      },
    ],
    exitSteps: [
      { id: "ml01-x1", label: "TP1: liquidity / prior swing on 3m–15m" },
      { id: "ml01-x2", label: "TP2: opposite HTF zone if path stays clean" },
      { id: "ml01-x3", label: "Exit if setup zone breaks against you" },
      { id: "ml01-x4", label: "No clean BOS → no trade / paper" },
    ],
    byTimeframe: [
      {
        timeframe: "15m / 1H",
        focus: "Zones — where to look",
        steps: [
          { id: "ml01-htf-1", label: "Mark HTF demand / supply" },
          { id: "ml01-htf-2", label: "Pullback must reach that zone" },
          { id: "ml01-htf-3", label: "No valid zone → no setup" },
        ],
      },
      {
        timeframe: "3m",
        focus: "ChoCh + BOS",
        steps: [
          { id: "ml01-3-1", label: "ChoCh in zone = alert" },
          { id: "ml01-3-2", label: "Wait for BOS (breaks key high/low)" },
          { id: "ml01-3-3", label: "Entry after BOS — no BOS, no entry" },
        ],
      },
    ],
  },

  ml02: {
    name: "Single Candle Mitigation",
    markets:
      "Futures LONG/SHORT · MNQ · MES · 6E · 6A · 6B · GC · HTF OB/FVG 15m + SCM 1m/3m",
    summary:
      "Mitigate an HTF zone: Order Block or impulse imbalance (FVG), while taking prior highs/lows. Mark bias + HTF OB/FVG · sweep inducement · price returns into the zone · long-wick SCM that grabs recent liquidity and rejects = entry. SCM alone mid-range / without HTF zone = no trade.",
    sessionWindow: "Intraday · OB/FVG / bias 15m · SCM entry 1m–3m",
    riskNotes: [
      "Thesis = HTF OB or FVG mitigation + prior liquidity take — not a lone mid-range pullback",
      "HTF bias (BOS / momentum) aligned with the zone side",
      "Mark HTF OB and/or FVG from the BOS impulse",
      "Inducement or engineering liquidity swept BEFORE accepting the return to the zone",
      "Valid SCM in OB or FVG: long wick + sweep of recent highs/lows + close back",
      "SL beyond zone / SCM wick; TP at opposite HTF structure",
      "Stacking: new SCM in the same zone after a new inducement",
    ],
    invalidation: [
      "SCM mid-range with no marked HTF OB/FVG",
      "Enter HTF zone with no prior inducement (classic trap)",
      "Trade against HTF BOS / bias",
      "Candle that does not take prior highs/lows (no liquidity grab)",
      "Body closes through the zone / SCM against you",
      "Chase outside the HTF OB/FVG",
    ],
    entrySteps: [
      {
        id: "ml02-e1",
        label: "HTF bias + mark HTF OB / FVG",
        detail:
          "SELL: bearish BOS → supply OB and/or bearish FVG. BUY: bullish BOS → demand OB and/or bullish FVG.",
      },
      {
        id: "ml02-e2",
        label: "Wait for inducement / eng. liquidity",
        detail:
          "Do not take the first mid pullback OB — sweep inducement first, then return to HTF OB or FVG.",
      },
      {
        id: "ml02-e3",
        label: "Price returns to HTF OB or imbalance",
        detail:
          "Mitigating the HTF zone (OB body or FVG) is the trade. No touch → no setup.",
      },
      {
        id: "ml02-e4",
        label: "SCM takes prior highs/lows",
        detail:
          "Long wick sweeps recent highs/lows and closes with rejection inside/at the HTF zone edge.",
      },
      {
        id: "ml02-e5",
        label: "Entry · SL · TP",
        detail:
          "Enter on SCM rejection. SL beyond zone/SCM. TP1 internal liquidity · TP2 HTF high/low.",
      },
    ],
    exitSteps: [
      { id: "ml02-x1", label: "TP1: liquidity / internal LTF swing" },
      { id: "ml02-x2", label: "TP2: HTF structure (bias high/low)" },
      {
        id: "ml02-x3",
        label: "BE / exit if body closes through zone / SCM against you",
      },
      { id: "ml02-x4", label: "No clean return to HTF OB/FVG → paper / no trade" },
    ],
    byTimeframe: [
      {
        timeframe: "15m / 1H",
        focus: "Bias + HTF OB/FVG (thesis)",
        steps: [
          { id: "ml02-htf-1", label: "HTF BOS / momentum = direction" },
          {
            id: "ml02-htf-2",
            label: "Mark OB and/or FVG of the BOS impulse",
          },
          {
            id: "ml02-htf-3",
            label: "Inducement first; mid zones without HTF thesis = traps",
          },
        ],
      },
      {
        timeframe: "1m / 3m",
        focus: "SCM in OB/FVG (trigger)",
        steps: [
          {
            id: "ml02-ltf-1",
            label: "Confirm price inside / at edge of HTF OB or FVG",
          },
          {
            id: "ml02-ltf-2",
            label: "SCM: long wick + prior highs/lows + close back",
          },
          {
            id: "ml02-ltf-3",
            label: "Entry + SL; stack only if new SCM stays in the zone",
          },
        ],
      },
    ],
  },

  ml02o: {
    name: "Single Candle Mitigation",
    markets: "Options CALL/PUT · HTF OB/FVG 15m/1H + LTF SCM · plan ≤35%",
    summary:
      "Mitigate an HTF zone: Order Block or impulse imbalance (FVG), while taking prior highs/lows. Mark bias + HTF OB/FVG · sweep inducement · price returns into the zone · long-wick SCM that grabs recent liquidity and rejects = entry. SCM alone mid-range / without HTF zone = no trade.",
    sessionWindow: "Intraday · OB/FVG / bias 15m/1H · SCM 5m–15m · options plan ≤35%",
    riskNotes: [
      "Thesis = HTF OB or FVG mitigation + prior liquidity take — not a lone mid-range pullback",
      "HTF bias (BOS / momentum) aligned with the zone side",
      "Mark HTF OB and/or FVG from the BOS impulse",
      "Inducement or engineering liquidity swept BEFORE accepting the return to the zone",
      "Valid SCM in OB or FVG: long wick + sweep of recent highs/lows + close back",
      "SL beyond zone / SCM wick; TP at opposite HTF structure",
      "Stacking: new SCM in the same zone after a new inducement",
      "Options: ATM/OTM in range · plan 10/20/35% — not 100% plan",
    ],
    invalidation: [
      "SCM mid-range with no marked HTF OB/FVG",
      "Enter HTF zone with no prior inducement (classic trap)",
      "Trade against HTF BOS / bias",
      "Candle that does not take prior highs/lows (no liquidity grab)",
      "Body closes through the zone / SCM against you",
      "Chase outside the HTF OB/FVG",
    ],
    entrySteps: [
      {
        id: "ml02o-e1",
        label: "HTF bias + mark HTF OB / FVG",
        detail:
          "PUT: bearish BOS → supply OB and/or bearish FVG. CALL: bullish BOS → demand OB and/or bullish FVG (15m/1H).",
      },
      {
        id: "ml02o-e2",
        label: "Wait for inducement / eng. liquidity",
        detail:
          "Do not take the first mid pullback OB — sweep inducement first, then return to HTF OB or FVG.",
      },
      {
        id: "ml02o-e3",
        label: "Price returns to HTF OB or imbalance",
        detail:
          "Mitigating the HTF zone (OB body or FVG) is the trade. No touch → no setup.",
      },
      {
        id: "ml02o-e4",
        label: "SCM takes prior highs/lows",
        detail:
          "Long wick sweeps recent highs/lows and closes with rejection inside/at the HTF zone edge.",
      },
      {
        id: "ml02o-e5",
        label: "Entry · SL · TP",
        detail:
          "Enter on SCM rejection. SL beyond zone/SCM. Options plan ≤35% · TP HTF swing.",
      },
    ],
    exitSteps: [
      { id: "ml02o-x1", label: "TP1: liquidity / internal LTF swing" },
      { id: "ml02o-x2", label: "TP2: HTF structure (bias high/low)" },
      {
        id: "ml02o-x3",
        label: "BE / exit if body closes through zone / SCM against you",
      },
      { id: "ml02o-x4", label: "No clean return to HTF OB/FVG → paper / no trade" },
    ],
    byTimeframe: [
      {
        timeframe: "15m / 1H",
        focus: "Bias + HTF OB/FVG (thesis)",
        steps: [
          { id: "ml02o-htf-1", label: "HTF BOS / momentum = direction" },
          {
            id: "ml02o-htf-2",
            label: "Mark OB and/or FVG of the BOS impulse",
          },
          {
            id: "ml02o-htf-3",
            label: "Inducement first; mid zones without HTF thesis = traps",
          },
        ],
      },
      {
        timeframe: "5m / 15m",
        focus: "SCM in OB/FVG (trigger)",
        steps: [
          {
            id: "ml02o-ltf-1",
            label: "Confirm price inside / at edge of HTF OB or FVG",
          },
          {
            id: "ml02o-ltf-2",
            label: "SCM: long wick + prior highs/lows + close back",
          },
          {
            id: "ml02o-ltf-3",
            label: "Entry + SL; stack only if new SCM stays in the zone",
          },
        ],
      },
    ],
  },

  ml03: {
    name: "First NY 5m candle",
    markets: "Futures LONG/SHORT · MNQ · MES · GC · first NY 5m + 1m entry",
    summary:
      "First-candle rule: at 9:30 ET on 5m wait for the 9:30–9:35 close, mark that high/low for the day. On 1m do not buy the first touch — require a break with an FVG (gap between wicks), FVG retest, and an engulfing candle. RR ≈ 1:3 to 1:5.",
    sessionWindow: "RTH · 5m levels 9:30–9:35 · 1m trigger after 9:35",
    riskNotes: [
      "Only levels from the first NY 5m candle (9:30–9:35 ET)",
      "Do not enter on first touch of high/low — wait for break FVG",
      "FVG = gap between wicks (a wick poke or lone close is not enough)",
      "Enter on FVG retest + engulfing candle",
      "SL beyond engulfing / FVG; TP 1:3–1:5 R",
    ],
    invalidation: [
      "Enter first touch of high/low without FVG",
      "Trade before the first 5m candle closes",
      "No FVG (only a wick through the level)",
      "Retest without engulfing",
      "Chase far from the FVG",
    ],
    entrySteps: [
      {
        id: "ml03-e1",
        label: "9:30 ET · 5m chart",
        detail:
          "Wait for the 9:30–9:35 candle to close. Mark high and low — the only key levels for the day.",
      },
      {
        id: "ml03-e2",
        label: "Drop to 1m",
        detail: "Watch approaches to that first-candle high (longs) or low (shorts).",
      },
      {
        id: "ml03-e3",
        label: "Break + FVG (gap between wicks)",
        detail:
          "Price must break the level and leave an imbalance / gap between wicks — not just a wick or close.",
      },
      {
        id: "ml03-e4",
        label: "FVG retest + engulfing",
        detail: "On FVG retest, wait for an engulfing candle and enter. RR ≈ 1:3 to 1:5.",
      },
    ],
    exitSteps: [
      { id: "ml03-x1", label: "TP at 1:3–1:5 R (or day structure)" },
      { id: "ml03-x2", label: "SL beyond engulfing / FVG extreme" },
      { id: "ml03-x3", label: "Flat at RTH close if still open" },
    ],
    byTimeframe: [
      {
        timeframe: "5m",
        focus: "First NY candle (thesis)",
        steps: [
          { id: "ml03-5-1", label: "Mark high/low 9:30–9:35 ET" },
          { id: "ml03-5-2", label: "Do not trade inside that candle — wait for close" },
        ],
      },
      {
        timeframe: "1m",
        focus: "FVG + engulfing (trigger)",
        steps: [
          { id: "ml03-1-1", label: "Level break with gap between wicks" },
          { id: "ml03-1-2", label: "FVG retest + engulfing → entry" },
        ],
      },
    ],
  },
};
