export type MarketType = "stock" | "etf" | "future";
export type DataProvider = "schwab" | "tradeadvocate";
/** Dashboard workspace: one UI, two broker venues. */
export type Venue = DataProvider;
export type Side = "long" | "short" | "flat";

export const VENUE_META: Record<
  Venue,
  { label: string; shortLabel: string; defaultSymbol: string; hint: string }
> = {
  schwab: {
    label: "Equities / Options",
    shortLabel: "Schwab",
    defaultSymbol: "SPY",
    hint: "SPY · AMZN · TSLA (underlying; options later)",
  },
  tradeadvocate: {
    label: "Futures",
    shortLabel: "TradeAdvocate",
    defaultSymbol: "NQ",
    hint: "NQ · ES · GC · 6E",
  },
};

export type Instrument = {
  symbol: string;
  name: string;
  market_type: MarketType;
  data_provider: DataProvider;
  active: boolean;
};

export type Strategy = {
  name: string;
  description: string;
  default_parameters: Record<string, unknown>;
};

export type Metrics = {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_loss: string | number;
  max_drawdown: string | number;
};

export type Trade = {
  side: Side;
  entry_time: string;
  entry_price: string | number;
  signal: string;
  exit_time?: string | null;
  exit_price?: string | number | null;
  profit_loss?: string | number | null;
  notes?: string | null;
};

export type Signal = {
  timestamp: string;
  side: Side;
  price: string | number;
  reason: string;
  ticker?: string;
};

export type Candle = {
  timestamp: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
  ticker: string;
  timeframe: string;
};

export type EvaluateResponse = {
  ticker: string;
  strategy: string;
  timeframe: string;
  date: string;
  metrics: Metrics;
  signals: Signal[];
  trades: Trade[];
};

export type BacktestResponse = {
  run_id?: string | null;
  ticker: string;
  strategy: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_loss: string | number;
  max_drawdown: string | number;
  trades: Trade[];
  signals: Signal[];
};

export type ScanHit = {
  symbol: string;
  name: string;
  market_type: MarketType | string;
  data_provider: DataProvider | string;
  strategy: string;
  status: string;
  matched: boolean;
  detail: string;
  last_signal?: Signal | null;
  open_trade?: Trade | null;
  metrics?: Metrics | null;
};

export type ScanResponse = {
  scanned_at: string;
  session_date: string;
  timeframe: string;
  strategies: string[];
  hits: ScanHit[];
  match_count: number;
  total_checked: number;
};

export type NewsImpact = "red" | "orange" | "yellow" | "info";

export type NewsItem = {
  id: string;
  source: string;
  headline: string;
  summary?: string;
  url?: string;
  published_at?: string | null;
  symbols?: string[];
  impact: NewsImpact | string;
  reason?: string;
  category?: string;
};

export type EconomicEvent = {
  id: string;
  country: string;
  event: string;
  impact: NewsImpact | string;
  scheduled_at?: string | null;
  estimate?: string | null;
  previous?: string | null;
  actual?: string | null;
  reason?: string;
};

export type NewsBriefing = {
  as_of: string;
  session_date: string;
  provider: string;
  configured: boolean;
  message?: string;
  red_events: EconomicEvent[];
  aware_items: NewsItem[];
  watchlist_items: NewsItem[];
  market_items: NewsItem[];
};

export const FALLBACK_INSTRUMENTS: Instrument[] = [
  { symbol: "NQ", name: "E-mini Nasdaq-100", market_type: "future", data_provider: "tradeadvocate", active: true },
  { symbol: "ES", name: "E-mini S&P 500", market_type: "future", data_provider: "tradeadvocate", active: true },
  { symbol: "GC", name: "Gold Futures", market_type: "future", data_provider: "tradeadvocate", active: true },
  { symbol: "6E", name: "Euro FX Futures", market_type: "future", data_provider: "tradeadvocate", active: true },
  { symbol: "AMZN", name: "Amazon.com Inc", market_type: "stock", data_provider: "schwab", active: true },
  { symbol: "TSLA", name: "Tesla Inc", market_type: "stock", data_provider: "schwab", active: true },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", market_type: "etf", data_provider: "schwab", active: true },
  { symbol: "QQQ", name: "Invesco QQQ Trust", market_type: "etf", data_provider: "schwab", active: true },
];

export const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
