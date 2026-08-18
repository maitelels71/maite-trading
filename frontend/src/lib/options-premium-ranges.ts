import { INDEX_ETF_SYMBOLS } from "@/lib/instrument-groups";

/** SPY/QQQ/IWM list weekday 0DTE. Single names (NFLX, AAPL, …) are Friday weeklies. */
function hasWeekdayExpirations(symbol: string): boolean {
  return INDEX_ETF_SYMBOLS.has(symbol.trim().toUpperCase());
}

/** Investep Academy option premium ranges (rango_precios_opciones_2026-06-16.xls). */

export type OptionPremiumRange = {
  ticker: string;
  name: string;
  block: string;
  sector: string;
  /** Optimal premium band ($). */
  optimalLow: number;
  optimalHigh: number;
  minPrem: number;
  maxPrem: number;
  optimalLabel: string;
  minmaxLabel: string;
};

export const OPTION_PREMIUM_RANGES: OptionPremiumRange[] = [
  {
    ticker: "AMZN",
    name: "Amazon.com, Inc.",
    block: "TECHNOLOGY",
    sector: "Consumer Cyclical | Internet Retrail",
    optimalLow: 140.0,
    optimalHigh: 230.0,
    minPrem: 130.0,
    maxPrem: 240.0,
    optimalLabel: "$140 - $230",
    minmaxLabel: "MIN $130 MAX $240",
  },
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    block: "TECHNOLOGY",
    sector: "Technology | Consumer Electronics",
    optimalLow: 35.0,
    optimalHigh: 90.0,
    minPrem: 30.0,
    maxPrem: 100.0,
    optimalLabel: "$35 - $90",
    minmaxLabel: "MIN $30 MAX $100",
  },
  {
    ticker: "GOOG",
    name: "Alphabet Inc.",
    block: "TECHNOLOGY",
    sector: "Communication Services | Internet Content & Information",
    optimalLow: 60.0,
    optimalHigh: 170.0,
    minPrem: 50.0,
    maxPrem: 170.0,
    optimalLabel: "$60 - $170",
    minmaxLabel: "MIN $50 MAX $170",
  },
  {
    ticker: "META",
    name: "Meta Platforms, Inc.",
    block: "TECHNOLOGY",
    sector: "Communication Services | Internet Content & Information",
    optimalLow: 150.0,
    optimalHigh: 210.0,
    minPrem: 145.0,
    maxPrem: 220.0,
    optimalLabel: "$150 - $210",
    minmaxLabel: "MIN $145 MAX $220",
  },
  {
    ticker: "MSFT",
    name: "Microsoft Corporation",
    block: "TECHNOLOGY",
    sector: "Technology | Software - Infrastructure",
    optimalLow: 60.0,
    optimalHigh: 120.0,
    minPrem: 50.0,
    maxPrem: 130.0,
    optimalLabel: "$60 - $120",
    minmaxLabel: "MIN $50 MAX $130",
  },
  {
    ticker: "NFLX",
    name: "Netflix, Inc.",
    block: "TECHNOLOGY",
    sector: "Communication Services | Entertainment",
    optimalLow: 40.0,
    optimalHigh: 80.0,
    minPrem: 35.0,
    maxPrem: 85.0,
    optimalLabel: "$40 - $80",
    minmaxLabel: "MIN $35 MAX $85",
  },
  {
    ticker: "TSLA",
    name: "Tesla, Inc.",
    block: "TECHNOLOGY",
    sector: "Consumer Cyclical | Auto Manufacturers",
    optimalLow: 100.0,
    optimalHigh: 250.0,
    minPrem: 90.0,
    maxPrem: 250.0,
    optimalLabel: "$100 - $250",
    minmaxLabel: "MIN $90 MAX $250",
  },
  {
    ticker: "PLTR",
    name: "PLTR",
    block: "TECHNOLOGY",
    sector: "Technology | Software - Infrastructure",
    optimalLow: 140.0,
    optimalHigh: 300.0,
    minPrem: 135.0,
    maxPrem: 310.0,
    optimalLabel: "$140 - $300",
    minmaxLabel: "MIN $135 MAX $ 310",
  },
  {
    ticker: "ORCL",
    name: "ORCL",
    block: "TECHNOLOGY",
    sector: "Technology | Software - Infrastructure",
    optimalLow: 80.0,
    optimalHigh: 130.0,
    minPrem: 70.0,
    maxPrem: 140.0,
    optimalLabel: "$80 - $130",
    minmaxLabel: "MIN $70 MAX $140",
  },
  {
    ticker: "AMD",
    name: "Advanced Micro Devices, Inc.",
    block: "SEMICONDUCTORS",
    sector: "Technology | Semiconductors",
    optimalLow: 150.0,
    optimalHigh: 235.0,
    minPrem: 140.0,
    maxPrem: 240.0,
    optimalLabel: "$150 - $235",
    minmaxLabel: "MIN $140 MAX $240",
  },
  {
    ticker: "MU",
    name: "Micron Technology, Inc.",
    block: "SEMICONDUCTORS",
    sector: "Technology | Semiconductors",
    optimalLow: 400.0,
    optimalHigh: 600.0,
    minPrem: 400.0,
    maxPrem: 650.0,
    optimalLabel: "$400 - $600",
    minmaxLabel: "MIN $400 MAX $650",
  },
  {
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    block: "SEMICONDUCTORS",
    sector: "Technology | Semiconductors",
    optimalLow: 80.0,
    optimalHigh: 170.0,
    minPrem: 75.0,
    maxPrem: 175.0,
    optimalLabel: "$80 - $170",
    minmaxLabel: "MIN $75 MAX $175",
  },
  {
    ticker: "QCOM",
    name: "QCOM",
    block: "SEMICONDUCTORS",
    sector: "Technology | Semiconductors",
    optimalLow: 80.0,
    optimalHigh: 160.0,
    minPrem: 70.0,
    maxPrem: 170.0,
    optimalLabel: "$80 - $160",
    minmaxLabel: "MIN $70 MAX $170",
  },
  {
    ticker: "AVGO",
    name: "AVGO",
    block: "SEMICONDUCTORS",
    sector: "Technology | Semiconductors",
    optimalLow: 70.0,
    optimalHigh: 140.0,
    minPrem: 65.0,
    maxPrem: 145.0,
    optimalLabel: "$70 - $140",
    minmaxLabel: "MIN $ 65 MAX $145",
  },
  {
    ticker: "SOXL",
    name: "SOXL",
    block: "SEMICONDUCTORS",
    sector: "Technology | Semiconductors",
    optimalLow: 150.0,
    optimalHigh: 240.0,
    minPrem: 120.0,
    maxPrem: 250.0,
    optimalLabel: "$150 - $240",
    minmaxLabel: "MIN $120 MAX $250",
  },
  {
    ticker: "DASH",
    name: "DoorDash, Inc.",
    block: "SOFTWARE - APP",
    sector: "Communication Services | Internet Content & Information",
    optimalLow: 160.0,
    optimalHigh: 240.0,
    minPrem: 155.0,
    maxPrem: 245.0,
    optimalLabel: "$160 - $240",
    minmaxLabel: "MIN $155 MAX $245",
  },
  {
    ticker: "LYFT",
    name: "Lyft, Inc.",
    block: "SOFTWARE - APP",
    sector: "Technology | Software - Application",
    optimalLow: 25.0,
    optimalHigh: 50.0,
    minPrem: 25.0,
    maxPrem: 55.0,
    optimalLabel: "$25 - $50",
    minmaxLabel: "MIN $25 MAX $55",
  },
  {
    ticker: "UBER",
    name: "Uber Technologies, Inc.",
    block: "SOFTWARE - APP",
    sector: "Technology | Software - Application",
    optimalLow: 35.0,
    optimalHigh: 60.0,
    minPrem: 30.0,
    maxPrem: 65.0,
    optimalLabel: "$35 - $60",
    minmaxLabel: "MIN $30 MAX $65",
  },
  {
    ticker: "HD",
    name: "The Home Depot, Inc.",
    block: "CONSUMER",
    sector: "Consumer Cyclical | Home Improvement Retail",
    optimalLow: 120.0,
    optimalHigh: 240.0,
    minPrem: 120.0,
    maxPrem: 240.0,
    optimalLabel: "$120 - $240",
    minmaxLabel: "MIN $120 MAX $240",
  },
  {
    ticker: "LOW",
    name: "Lowe's Companies, Inc.",
    block: "CONSUMER",
    sector: "Consumer Cyclical | Home Improvement Retail",
    optimalLow: 120.0,
    optimalHigh: 220.0,
    minPrem: 110.0,
    maxPrem: 225.0,
    optimalLabel: "$120 - $220",
    minmaxLabel: "MIN $110 MAX $225",
  },
  {
    ticker: "WMT",
    name: "Walmart Inc.",
    block: "CONSUMER",
    sector: "Consumer Defensive | Discount Stores",
    optimalLow: 60.0,
    optimalHigh: 110.0,
    minPrem: 55.0,
    maxPrem: 115.0,
    optimalLabel: "$60 - $110",
    minmaxLabel: "MIN $55 MAX $115",
  },
  {
    ticker: "DIA",
    name: "SPDR Dow Jones Industrial Average ETF Trust",
    block: "INDEX - USA",
    sector: "Financial | Exchange Traded Fund",
    optimalLow: 100.0,
    optimalHigh: 200.0,
    minPrem: 95.0,
    maxPrem: 210.0,
    optimalLabel: "$100 - $200",
    minmaxLabel: "MIN $95 MAX $210",
  },
  {
    ticker: "QQQ",
    name: "Invesco QQQ Trust",
    block: "INDEX - USA",
    sector: "Financial | Exchange Traded Fund",
    optimalLow: 35.0,
    optimalHigh: 55.0,
    minPrem: 30.0,
    maxPrem: 60.0,
    optimalLabel: "$35 - $55",
    minmaxLabel: "MIN $30 MAX $60",
  },
  {
    ticker: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    block: "INDEX - USA",
    sector: "Financial | Exchange Traded Fund",
    optimalLow: 30.0,
    optimalHigh: 45.0,
    minPrem: 25.0,
    maxPrem: 50.0,
    optimalLabel: "$30 - $45",
    minmaxLabel: "MIN $25 MAX $50",
  },
  {
    ticker: "SPX",
    name: "SPDR S&P 500 ETF Trust",
    block: "INDEX - USA",
    sector: "Financial | Exchange Traded Fund",
    optimalLow: 400.0,
    optimalHigh: 600.0,
    minPrem: 380.0,
    maxPrem: 620.0,
    optimalLabel: "$400 - $600",
    minmaxLabel: "MIN $380 MAX $620",
  },
  {
    ticker: "IWM",
    name: "iShares Russell 2000 ETF",
    block: "INDEX - USA",
    sector: "Financial | Exchange Traded Fund",
    optimalLow: 40.0,
    optimalHigh: 70.0,
    minPrem: 35.0,
    maxPrem: 70.0,
    optimalLabel: "$40 - $70",
    minmaxLabel: "MIN $35 MAX $70",
  },
  {
    ticker: "TNA",
    name: "Direxion Daily Small Cap Bull 3X Shares",
    block: "INDEX - USA",
    sector: "Financial | Exchange Traded Fund",
    optimalLow: 40.0,
    optimalHigh: 90.0,
    minPrem: 40.0,
    maxPrem: 100.0,
    optimalLabel: "$40 - $90",
    minmaxLabel: "MIN $40 MAX $100",
  },
  {
    ticker: "AXP",
    name: "American Express Company",
    block: "CARDS",
    sector: "Financial | Credit Services",
    optimalLow: 85.0,
    optimalHigh: 190.0,
    minPrem: 80.0,
    maxPrem: 195.0,
    optimalLabel: "$85 - $190",
    minmaxLabel: "MIN $80 MAX $195",
  },
  {
    ticker: "C",
    name: "",
    block: "CARDS",
    sector: "Financial | Credit Services",
    optimalLow: 50.0,
    optimalHigh: 140.0,
    minPrem: 45.0,
    maxPrem: 150.0,
    optimalLabel: "$50 - $140",
    minmaxLabel: "MIN $45 MAX $150",
  },
  {
    ticker: "MA",
    name: "Mastercard Incorporated",
    block: "CARDS",
    sector: "Financial | Credit Services",
    optimalLow: 90.0,
    optimalHigh: 175.0,
    minPrem: 85.0,
    maxPrem: 180.0,
    optimalLabel: "$90 - $175",
    minmaxLabel: "MIN $85 MAX $180",
  },
  {
    ticker: "PYPL",
    name: "PayPal Holdings, Inc.",
    block: "CARDS",
    sector: "Financial | Credit Services",
    optimalLow: 50.0,
    optimalHigh: 80.0,
    minPrem: 40.0,
    maxPrem: 90.0,
    optimalLabel: "$50 - $80",
    minmaxLabel: "MIN $40 MAX $90",
  },
  {
    ticker: "V",
    name: "Visa Inc.",
    block: "CARDS",
    sector: "Financial | Credit Services",
    optimalLow: 60.0,
    optimalHigh: 170.0,
    minPrem: 55.0,
    maxPrem: 175.0,
    optimalLabel: "$60 - $170",
    minmaxLabel: "MIN $55 MAX $175",
  },
  {
    ticker: "BABA",
    name: "Alibaba Group Holding Limited",
    block: "CHINA",
    sector: "Consumer Cyclical | Internet Retrail",
    optimalLow: 40.0,
    optimalHigh: 60.0,
    minPrem: 40.0,
    maxPrem: 70.0,
    optimalLabel: "$40 - $60",
    minmaxLabel: "MIN $40 MAX $70",
  },
  {
    ticker: "LI",
    name: "Li Auto Inc.",
    block: "CHINA",
    sector: "Consumer Cyclical | Auto Manufacturers",
    optimalLow: 25.0,
    optimalHigh: 60.0,
    minPrem: 25.0,
    maxPrem: 70.0,
    optimalLabel: "$25 - $60",
    minmaxLabel: "MIN $25MAX $70",
  },
  {
    ticker: "NIO",
    name: "NIO Inc.",
    block: "CHINA",
    sector: "Consumer Cyclical | Auto Manufacturers",
    optimalLow: 30.0,
    optimalHigh: 75.0,
    minPrem: 25.0,
    maxPrem: 75.0,
    optimalLabel: "$30 - $75",
    minmaxLabel: "MIN $25 MAX $75",
  },
  {
    ticker: "XPEV",
    name: "XPeng Inc.",
    block: "CHINA",
    sector: "Consumer Cyclical | Auto Manufacturers",
    optimalLow: 50.0,
    optimalHigh: 70.0,
    minPrem: 45.0,
    maxPrem: 75.0,
    optimalLabel: "$50 - 70",
    minmaxLabel: "MIN $45 MAX $75",
  },
  {
    ticker: "GLD",
    name: "The GDL Fund",
    block: "COMMODITY",
    sector: "Financial | Closed-End Fund - Equity",
    optimalLow: 40.0,
    optimalHigh: 80.0,
    minPrem: 40.0,
    maxPrem: 90.0,
    optimalLabel: "$40 - $80",
    minmaxLabel: "MIN $40 MAX $90",
  },
  {
    ticker: "SLV",
    name: "iShares Silver Trust",
    block: "COMMODITY",
    sector: "Financial | Exchange Traded Fund",
    optimalLow: 40.0,
    optimalHigh: 75.0,
    minPrem: 35.0,
    maxPrem: 80.0,
    optimalLabel: "$40 - $75",
    minmaxLabel: "MIN $35 MAX $80",
  },
  {
    ticker: "USO",
    name: "United States Oil Fund, LP",
    block: "COMMODITY",
    sector: "Financial | Exchange Traded Fund",
    optimalLow: 50.0,
    optimalHigh: 80.0,
    minPrem: 45.0,
    maxPrem: 90.0,
    optimalLabel: "$50 - $80",
    minmaxLabel: "MIN $45 MAX $90",
  },
  {
    ticker: "COIN",
    name: "Coinbase Global, Inc.",
    block: "FINANCIAL / DATA",
    sector: "Financial | Financial Data & Stock Exchanges",
    optimalLow: 200.0,
    optimalHigh: 300.0,
    minPrem: 195.0,
    maxPrem: 310.0,
    optimalLabel: "$200 - $300",
    minmaxLabel: "MIN $195 MAX $310",
  },
  {
    ticker: "HOOD",
    name: "HOOD",
    block: "FINANCIAL / DATA",
    sector: "Financial | Financial Data & Stock Exchanges",
    optimalLow: 100.0,
    optimalHigh: 150.0,
    minPrem: 90.0,
    maxPrem: 160.0,
    optimalLabel: "$100 - $150",
    minmaxLabel: "MIN $90 MAX $ 160",
  },
  {
    ticker: "CVS",
    name: "CVS Health Corporation",
    block: "HEALTCARE",
    sector: "Healthcare | Healthcare Plans",
    optimalLow: 60.0,
    optimalHigh: 120.0,
    minPrem: 55.0,
    maxPrem: 130.0,
    optimalLabel: "$60 - $120",
    minmaxLabel: "MIN $55 MAX $130",
  },
  {
    ticker: "MRNA",
    name: "Moderna, Inc.",
    block: "HEALTCARE",
    sector: "Healthcare | Biotechnology",
    optimalLow: 50.0,
    optimalHigh: 130.0,
    minPrem: 50.0,
    maxPrem: 130.0,
    optimalLabel: "$50 - $130",
    minmaxLabel: "MIN $50 MAX $130",
  },
  {
    ticker: "PFE",
    name: "Pfizer Inc.",
    block: "HEALTCARE",
    sector: "Healthcare | Drug Manufacturers - General",
    optimalLow: 30.0,
    optimalHigh: 70.0,
    minPrem: 25.0,
    maxPrem: 75.0,
    optimalLabel: "$30 - $70",
    minmaxLabel: "MIN $25 MAX $75",
  },
  {
    ticker: "BA",
    name: "The Boeing Company",
    block: "INDUSTRIALS",
    sector: "Industrials | Aerospace & Defense",
    optimalLow: 60.0,
    optimalHigh: 170.0,
    minPrem: 50.0,
    maxPrem: 180.0,
    optimalLabel: "$60 - $170",
    minmaxLabel: "MIN $50 MAX $180",
  },
  {
    ticker: "URA",
    name: "URA",
    block: "NUCLEAR ENERGY",
    sector: "Financial | Exchange Traded Fund",
    optimalLow: 55.0,
    optimalHigh: 80.0,
    minPrem: 55.0,
    maxPrem: 85.0,
    optimalLabel: "$55 - $80",
    minmaxLabel: "MIN $55 MAX $85",
  },
  {
    ticker: "CCL",
    name: "Carnival Corporation & plc",
    block: "CRUISES",
    sector: "Consumer Cyclical | Travel Services",
    optimalLow: 40.0,
    optimalHigh: 60.0,
    minPrem: 35.0,
    maxPrem: 65.0,
    optimalLabel: "$40 -$60",
    minmaxLabel: "MIN $35 MAX $65",
  },
  {
    ticker: "RCL",
    name: "Royal Caribbean Cruises Ltd.",
    block: "CRUISES",
    sector: "Consumer Cyclical | Travel Services",
    optimalLow: 80.0,
    optimalHigh: 150.0,
    minPrem: 75.0,
    maxPrem: 155.0,
    optimalLabel: "$80 - $150",
    minmaxLabel: "MIN $ 75 MAX 155",
  },
  {
    ticker: "AAL",
    name: "American Airlines Group Inc.",
    block: "AERONAUTICAL",
    sector: "Industrials | Airlines",
    optimalLow: 40.0,
    optimalHigh: 70.0,
    minPrem: 30.0,
    maxPrem: 70.0,
    optimalLabel: "$40 - $70",
    minmaxLabel: "MIN $30 MAX $70",
  },
  {
    ticker: "DAL",
    name: "Delta Air Lines, Inc.",
    block: "AERONAUTICAL",
    sector: "Consumer Cyclical | Travel Services",
    optimalLow: 40.0,
    optimalHigh: 65.0,
    minPrem: 35.0,
    maxPrem: 70.0,
    optimalLabel: "$40 - $65",
    minmaxLabel: "MIN $35 MAX $70",
  },
];

const ALIASES: Record<string, string> = {
  GOOGL: "GOOG",
  GOOG: "GOOG",
};

export function premiumRangeFor(symbol: string): OptionPremiumRange | null {
  const key = ALIASES[symbol.toUpperCase()] ?? symbol.toUpperCase();
  return OPTION_PREMIUM_RANGES.find((r) => r.ticker === key) ?? null;
}

/** ATM-style strike rounding for equities / ETFs (planning helper — confirm on chain). */
export function nearestStrike(spot: number): number {
  if (!Number.isFinite(spot) || spot <= 0) return 0;
  if (spot >= 200) return Math.round(spot / 5) * 5;
  if (spot >= 25) return Math.round(spot);
  return Math.round(spot * 2) / 2;
}

export function strikeIncrement(spot: number): number {
  if (spot >= 200) return 5;
  if (spot >= 50) return 1;
  return 0.5;
}

function roundToStep(value: number, step: number): number {
  if (!(step > 0)) return Math.round(value * 100) / 100;
  return Math.round(Math.round(value / step) * step * 100) / 100;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Desk heuristic (not a quote): weekly-ish extrinsic at ATM ~1.2% of spot,
 * decaying as the strike moves OTM. Intrinsic added when ITM.
 */
export function estimateOptionPremium(
  spot: number,
  strike: number,
  optionType: "CALL" | "PUT",
): number {
  if (!(spot > 0) || !(strike > 0)) return 0;
  const intrinsic =
    optionType === "CALL"
      ? Math.max(spot - strike, 0)
      : Math.max(strike - spot, 0);
  const otm =
    optionType === "CALL"
      ? Math.max(strike - spot, 0)
      : Math.max(spot - strike, 0);
  const atmTv = Math.min(6, Math.max(0.08, spot * 0.012));
  const width = Math.max(spot * 0.06, strikeIncrement(spot) * 3);
  const tv = atmTv * Math.exp(-otm / width);
  return roundMoney(intrinsic + tv);
}

/**
 * Pick a listed-style strike whose estimated premium is closest to target.
 * Walks OTM for cheap targets, slightly ITM if the target is richer than ATM.
 */
export function strikeForTargetPremium(
  spot: number,
  optionType: "CALL" | "PUT",
  targetPremium: number,
): { strike: number; estimatedPremium: number } {
  const step = strikeIncrement(spot);
  const atm = nearestStrike(spot);
  const target = Math.max(0.01, targetPremium);

  const strikeAt = (n: number): number => {
    const raw = optionType === "CALL" ? atm + n * step : atm - n * step;
    return roundToStep(Math.max(step, raw), step);
  };

  const score = (est: number): number => {
    const over = Math.max(0, est - target);
    const under = Math.max(0, target - est);
    return over * 3 + under;
  };

  let bestStrike = atm;
  let bestEst = estimateOptionPremium(spot, atm, optionType);
  let bestScore = score(bestEst);

  for (let n = -12; n <= 40; n += 1) {
    const k = strikeAt(n);
    if (!(k > 0)) continue;
    const est = estimateOptionPremium(spot, k, optionType);
    const s = score(est);
    if (s < bestScore - 1e-9) {
      bestScore = s;
      bestStrike = k;
      bestEst = est;
    }
  }
  return { strike: bestStrike, estimatedPremium: bestEst };
}

export type PlanCapital = {
  equity: number;
  cashAvailable: number;
};

export type PremiumFit =
  | "optimal"
  | "optimal_over_10"
  | "capital"
  | "unfitted";

/** Keep in sync with DESK_RISK_PCT / MAX_OPEN_RISK_PCT in option-sizing.ts */
const FIT_RISK_PCT = 0.1;
const FIT_MAX_PCT = 0.5;
const MIN_DEBIT = 0.05;
const DEFAULT_NO_RANGE_DEBIT = 0.5;

/**
 * Prefer academy mid (or $0.50 if no band). If that 1ct exceeds cash / 50%
 * equity, size to the max payable (≤50%/cash) so LIMIT can still fill.
 * The 10% pocket is only the green consider flag, not the order price.
 */
export function targetDebitForCapital(
  academyMid: number,
  capital: PlanCapital,
): { premium: number; fit: PremiumFit } {
  const equity = Number(capital.equity) || 0;
  const cash = Number(capital.cashAvailable) || 0;
  const preferred = academyMid > 0 ? academyMid : DEFAULT_NO_RANGE_DEBIT;
  const maxCost10 = equity > 0 ? equity * FIT_RISK_PCT : 0;
  const maxCost50 = equity > 0 ? equity * FIT_MAX_PCT : 0;
  const capCost = Math.max(
    0,
    Math.min(cash, maxCost50 > 0 ? maxCost50 : cash),
  );
  const capPrem = capCost / 100;
  const max10Prem = maxCost10 / 100;
  if (capPrem + 1e-9 < MIN_DEBIT) {
    return {
      premium: roundMoney(preferred),
      fit: academyMid > 0 ? "optimal" : "capital",
    };
  }
  if (preferred <= capPrem + 1e-9) {
    const within10 = preferred <= max10Prem + 1e-9;
    if (academyMid > 0) {
      return {
        premium: roundMoney(preferred),
        fit: within10 ? "optimal" : "optimal_over_10",
      };
    }
    return {
      premium: roundMoney(preferred),
      fit: within10 ? "capital" : "optimal_over_10",
    };
  }
  const fill = capPrem;
  return { premium: roundMoney(Math.max(MIN_DEBIT, fill)), fit: "capital" };
}

export function planWithDebit(
  plan: OptionsEntryPlan,
  debit: number,
): OptionsEntryPlan {
  const prem = Math.max(0, roundMoney(Number(debit) || 0));
  if (Math.abs(prem - plan.entryPremium) < 1e-9) {
    return { ...plan, entryPremium: prem };
  }
  const { strike, estimatedPremium } = strikeForTargetPremium(
    plan.spot,
    plan.optionType,
    prem > 0 ? prem : MIN_DEBIT,
  );
  const tp = (pct: number) => (prem > 0 ? roundMoney(prem * (1 + pct)) : 0);
  const inBand =
    plan.hasRange &&
    prem + 1e-9 >= plan.premiumLow &&
    prem <= plan.premiumHigh + 1e-9;
  return {
    ...plan,
    strike,
    entryPremium: prem,
    estimatedPremium,
    tp10: tp(0.1),
    tp20: tp(0.2),
    tp35: tp(0.35),
    tp50: tp(0.5),
    tp100: tp(1.0),
    premiumFit: inBand ? "optimal" : "capital",
  };
}

/** Keep strike; set LIMIT/TPs to a live debit (do not re-walk OTM). */
export function planAtLiveDebit(
  plan: OptionsEntryPlan,
  debit: number,
): OptionsEntryPlan {
  const prem = Math.max(0, roundMoney(Number(debit) || 0));
  const tp = (pct: number) => (prem > 0 ? roundMoney(prem * (1 + pct)) : 0);
  return {
    ...plan,
    entryPremium: prem,
    estimatedPremium: prem,
    tp10: tp(0.1),
    tp20: tp(0.2),
    tp35: tp(0.35),
    tp50: tp(0.5),
    tp100: tp(1.0),
  };
}

export type OptionsEntryPlan = {
  symbol: string;
  optionType: "CALL" | "PUT";
  spot: number;
  strike: number;
  /** ATM rounded strike before capital / debit fit. */
  atmStrike: number;
  premiumLow: number;
  premiumHigh: number;
  /** Planned LIMIT debit (academy mid, or sized to capital). */
  entryPremium: number;
  /** Heuristic mid for the chosen strike — confirm on live chain. */
  estimatedPremium: number;
  premiumFit: PremiumFit;
  tp10: number;
  tp20: number;
  tp35: number;
  tp50: number;
  tp100: number;
  rangeLabel: string;
  minmaxLabel: string;
  hasRange: boolean;
  /** Suggested expiry YYYY-MM-DD (desk rule vs 10:00 ET). */
  expIso: string;
  /** Short display e.g. Fri 8/14 */
  expLabel: string;
  /** True when suggested expiry is the NY session calendar day (0DTE / hoy). */
  expIsToday: boolean;
  /** before_10 → hoy allowed; from_10 → next available after today. */
  expRule: "before_10" | "from_10";
};

function nyClock(now = new Date()): {
  iso: string;
  hh: number;
  weekday: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return { iso, hh: Number(parts.hour), weekday };
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function weekdayUtc(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

function nextWeekdayOnOrAfter(isoDate: string): string {
  let d = isoDate;
  for (let i = 0; i < 8; i += 1) {
    const wd = weekdayUtc(d);
    if (wd !== 0 && wd !== 6) return d;
    d = addDaysIso(d, 1);
  }
  return isoDate;
}

function nextFridayOnOrAfter(isoDate: string): string {
  let d = isoDate;
  for (let i = 0; i < 8; i += 1) {
    if (weekdayUtc(d) === 5) return d;
    d = addDaysIso(d, 1);
  }
  return isoDate;
}

function formatExpShort(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "numeric",
    day: "numeric",
  }).format(dt);
}

const listedExpStore: Record<string, string[]> = {};

export function rememberListedExpirations(symbol: string, dates: string[]): void {
  const key = symbol.trim().toUpperCase();
  listedExpStore[key] = [
    ...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))),
  ].sort();
}

export function listedExpirationsFor(symbol: string): string[] | null {
  const hit = listedExpStore[symbol.trim().toUpperCase()];
  return hit && hit.length ? hit : null;
}

export function listedExpirationSnapshot(): Record<string, string[]> {
  return { ...listedExpStore };
}

/** First listed OCC date on/after the desk start (today before 10:00 ET, else tomorrow).
 *  Single names: prefer Friday weekly even if Schwab also lists a Wed/Mon. */
export function pickListedExpiration(
  listed: string[],
  now = new Date(),
  preferFriday = false,
): string | null {
  const clock = nyClock(now);
  const before10 = clock.hh < 10;
  const start =
    before10 && clock.weekday !== 0 && clock.weekday !== 6
      ? clock.iso
      : addDaysIso(clock.iso, 1);
  const dates = [
    ...new Set(listed.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))),
  ]
    .filter((d) => d >= start)
    .sort();
  if (preferFriday) {
    const fri = dates.find((d) => weekdayUtc(d) === 5);
    if (fri) return fri;
  }
  return dates[0] ?? null;
}

export function listedExpPrefersFriday(symbol: string): boolean {
  return !hasWeekdayExpirations(symbol);
}

/** Schwab OCC: `AMZN  250815C00190000` (root padded to 6). */
export function buildOccOptionSymbol(
  underlying: string,
  expIso: string,
  optionType: string,
  strike: number,
): string {
  const root = String(underlying || "")
    .trim()
    .toUpperCase()
    .slice(0, 6)
    .padEnd(6, " ");
  const parts = String(expIso || "").trim().split("-");
  if (parts.length !== 3 || parts[0].length !== 4) return "";
  const [y, m, d] = parts;
  const cp = optionType.toUpperCase().startsWith("C") ? "C" : "P";
  if (!(strike > 0)) return "";
  const strikeInt = Math.round(strike * 1000);
  return `${root}${y.slice(2)}${m}${d}${cp}${String(strikeInt).padStart(8, "0")}`;
}

export function planAtExpiration(
  plan: OptionsEntryPlan,
  expIso: string,
  now = new Date(),
): OptionsEntryPlan {
  const clock = nyClock(now);
  return {
    ...plan,
    expIso,
    expLabel: formatExpShort(expIso),
    expIsToday: expIso === clock.iso,
  };
}

/**
 * Desk expiry: prefer Schwab listed dates. Fallback if the chain is not loaded yet:
 * - Before 10:00 ET → next listed-style exp, including today
 * - From 10:00 ET → next after today
 * SPY/QQQ/IWM: weekday 0DTE. Everyone else: Friday weekly.
 */
export function suggestOptionExpDate(
  symbol: string,
  now = new Date(),
  listedExps?: string[] | null,
): Pick<OptionsEntryPlan, "expIso" | "expLabel" | "expIsToday" | "expRule"> {
  const clock = nyClock(now);
  const before10 = clock.hh < 10;
  const expRule: "before_10" | "from_10" = before10 ? "before_10" : "from_10";
  const start =
    before10 && clock.weekday !== 0 && clock.weekday !== 6
      ? clock.iso
      : addDaysIso(clock.iso, 1);

  const listed = listedExps ?? listedExpirationsFor(symbol);
  const preferFriday = listedExpPrefersFriday(symbol);
  const fromChain = listed?.length
    ? pickListedExpiration(listed, now, preferFriday)
    : null;
  const expIso =
    fromChain ??
    (hasWeekdayExpirations(symbol)
      ? nextWeekdayOnOrAfter(start)
      : nextFridayOnOrAfter(start));

  return {
    expIso,
    expLabel: formatExpShort(expIso),
    expIsToday: expIso === clock.iso,
    expRule,
  };
}

export function buildOptionsEntryPlan(
  symbol: string,
  side: "long" | "short" | string | null | undefined,
  spotRaw: number | string | null | undefined,
  now = new Date(),
  capital: PlanCapital | null = null,
  listedExpirations: string[] | null = null,
): OptionsEntryPlan | null {
  const spot =
    typeof spotRaw === "number"
      ? spotRaw
      : spotRaw != null && String(spotRaw).trim() !== ""
        ? Number(spotRaw)
        : NaN;
  if (!Number.isFinite(spot) || spot <= 0) return null;

  const optionType: "CALL" | "PUT" =
    side === "short" || String(side).toLowerCase() === "put" ? "PUT" : "CALL";
  const atmStrike = nearestStrike(spot);
  const band = premiumRangeFor(symbol);
  const premiumLow = band?.optimalLow ?? 0;
  const premiumHigh = band?.optimalHigh ?? 0;
  const academyMid = band
    ? roundMoney((band.optimalLow + band.optimalHigh) / 2)
    : 0;

  let entryPremium = academyMid;
  let premiumFit: PremiumFit = band ? "optimal" : "unfitted";
  if (capital) {
    const sized = targetDebitForCapital(academyMid, capital);
    entryPremium = sized.premium;
    premiumFit = sized.fit;
  }

  const { strike, estimatedPremium } = strikeForTargetPremium(
    spot,
    optionType,
    entryPremium > 0 ? entryPremium : DEFAULT_NO_RANGE_DEBIT,
  );
  // LIMIT at this strike's model premium, not the 10% budget number.
  if (estimatedPremium > 0) {
    entryPremium = estimatedPremium;
  }

  const tp = (pct: number) =>
    entryPremium > 0 ? roundMoney(entryPremium * (1 + pct)) : 0;

  const exp = suggestOptionExpDate(symbol, now, listedExpirations);

  return {
    symbol: symbol.toUpperCase(),
    optionType,
    spot: roundMoney(spot),
    strike,
    atmStrike,
    premiumLow,
    premiumHigh,
    entryPremium,
    estimatedPremium,
    premiumFit,
    tp10: tp(0.1),
    tp20: tp(0.2),
    tp35: tp(0.35),
    tp50: tp(0.5),
    tp100: tp(1.0),
    rangeLabel: band?.optimalLabel ?? "—",
    minmaxLabel: band?.minmaxLabel ?? "—",
    hasRange: Boolean(band),
    ...exp,
  };
}

export function rangesByBlock(): Map<string, OptionPremiumRange[]> {
  const map = new Map<string, OptionPremiumRange[]>();
  for (const row of OPTION_PREMIUM_RANGES) {
    const list = map.get(row.block) ?? [];
    list.push(row);
    map.set(row.block, list);
  }
  return map;
}

export function stickyCardsFromRanges() {
  return [...rangesByBlock().entries()].map(([block, rows]) => ({
    id: `rango-${block.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: block,
    summary: "Rango óptimo de prima · jun 2026",
    bullets: rows.map(
      (r) => `${r.ticker} · óptimo ${r.optimalLabel} · ${r.minmaxLabel}`,
    ),
  }));
}
