export type MarketType = "stock" | "etf" | "future";
export type DataProvider = "schwab" | "tradeadvocate";
/** Dashboard workspace venue (options vs futures). Options = Schwab; futures candles = Yahoo. */
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
    hint: "SPY · QQQ · AAPL · MSFT · AMZN · GOOGL · META · NVDA · TSLA · NFLX · IOVA · IWM · USAR · UUUU · ONDS",
  },
  tradeadvocate: {
    label: "Futures",
    shortLabel: "Tradovate",
    defaultSymbol: "MNQ",
    hint: "MNQ · MES · 6E · 6A · 6B · MGC",
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

export type TradeSetup = {
  kind?: string;
  bias?: string;
  ob?: {
    top: string | number;
    bottom: string | number;
    time: string;
    bos_time?: string;
  };
  liquidity?: {
    kind?: string;
    price: string | number;
    time: string;
  };
  scm?: {
    time: string;
    high?: string | number;
    low?: string | number;
    close?: string | number;
  };
  sl?: string | number;
  tp?: string | number;
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
  setup?: TradeSetup | null;
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
  currency?: string;
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
  week_start?: string | null;
  week_end?: string | null;
  provider: string;
  configured: boolean;
  message?: string;
  calendar_events?: EconomicEvent[];
  red_events: EconomicEvent[];
  aware_items: NewsItem[];
  watchlist_items: NewsItem[];
  market_items: NewsItem[];
};

export type PremarketStrategyGroup = {
  strategy: string;
  match_count: number;
  total: number;
  tickers: ScanHit[];
};

export type PremarketResult = {
  run_id: string;
  status: string;
  started_at: string;
  finished_at: string;
  session_date: string;
  timeframe: string;
  strategies_requested: string[];
  data_provider?: string | null;
  summary: {
    total_checked: number;
    match_count: number;
    strategy_count: number;
    best_count: number;
  };
  strategy_groups: PremarketStrategyGroup[];
  best_results: ScanHit[];
  hits: ScanHit[];
};

export type PremarketAlarmCheck = {
  symbol: string;
  strategy: string;
  timeframe: string;
  session_date: string;
  checked_at: string;
  met: boolean;
  status: string;
  detail: string;
  hit?: ScanHit | null;
};

export type AlarmWatchStatus =
  | "idle"
  | "running"
  | "checking"
  | "met"
  | "stopped"
  | "error";

export type PremarketAlarmWatch = {
  id: string;
  symbol: string;
  strategy: string;
  timeframe: string;
  intervalSec: number;
  status: AlarmWatchStatus;
  lastStatus: string | null;
  lastDetail: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  metAt: string | null;
};

export type SchwabTokenStatus = {
  configured: boolean;
  has_access_token: boolean;
  has_refresh_token: boolean;
  expires_at?: number | null;
  expires_at_iso?: string | null;
  expires_in_seconds?: number | null;
  expired: boolean;
  source: string;
  publish_available: boolean;
  token_path?: string | null;
  published?: boolean | null;
  secret_arn_set?: boolean | null;
};

export type SchwabLoginLink = {
  authorize_url: string;
  redirect_uri: string;
  callback_path: string;
  portal_hint: string;
};

export type AdminOverview = {
  environment: string;
  storage_backend: string;
  using_dynamo: boolean;
  api_secrets_arn_set: boolean;
  schwab: SchwabTokenStatus;
  schwab_login?: SchwabLoginLink | null;
  notes: string[];
};

export const FUTURES_TICKERS = [
  "MNQ",
  "MES",
  "6E",
  "6A",
  "6B",
  "MGC",
] as const;

export function providerLabel(provider: string | null | undefined): string {
  if (provider === "schwab") return "Schwab";
  if (provider === "tradeadvocate") return "Yahoo";
  return provider?.trim() || "—";
}

export function sortFuturesInstruments<T extends { symbol: string }>(items: T[]): T[] {
  const order = new Map<string, number>(
    FUTURES_TICKERS.map((symbol, index) => [symbol, index]),
  );
  return [...items].sort((a, b) => {
    const ia = order.get(a.symbol) ?? 99;
    const ib = order.get(b.symbol) ?? 99;
    return ia - ib;
  });
}

export const FALLBACK_INSTRUMENTS: Instrument[] = [
  { symbol: "MNQ", name: "Micro E-mini Nasdaq-100", market_type: "future", data_provider: "tradeadvocate", active: true },
  { symbol: "MES", name: "Micro E-mini S&P 500", market_type: "future", data_provider: "tradeadvocate", active: true },
  { symbol: "6E", name: "Euro FX Futures", market_type: "future", data_provider: "tradeadvocate", active: true },
  { symbol: "6A", name: "Australian Dollar Futures", market_type: "future", data_provider: "tradeadvocate", active: true },
  { symbol: "6B", name: "British Pound Futures", market_type: "future", data_provider: "tradeadvocate", active: true },
  { symbol: "MGC", name: "Micro Gold Futures", market_type: "future", data_provider: "tradeadvocate", active: true },
  // Indices / ETFs
  { symbol: "IWM", name: "iShares Russell 2000 ETF", market_type: "etf", data_provider: "schwab", active: true },
  { symbol: "QQQ", name: "Invesco QQQ Trust", market_type: "etf", data_provider: "schwab", active: true },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", market_type: "etf", data_provider: "schwab", active: true },
  // Stocks
  { symbol: "AAPL", name: "Apple Inc", market_type: "stock", data_provider: "schwab", active: true },
  { symbol: "AMZN", name: "Amazon.com Inc", market_type: "stock", data_provider: "schwab", active: true },
  { symbol: "GOOGL", name: "Alphabet Inc Class A", market_type: "stock", data_provider: "schwab", active: true },
  { symbol: "IOVA", name: "Iovance Biotherapeutics Inc", market_type: "stock", data_provider: "schwab", active: true },
  { symbol: "META", name: "Meta Platforms Inc", market_type: "stock", data_provider: "schwab", active: true },
  { symbol: "MSFT", name: "Microsoft Corp", market_type: "stock", data_provider: "schwab", active: true },
  { symbol: "NFLX", name: "Netflix Inc", market_type: "stock", data_provider: "schwab", active: true },
  { symbol: "NVDA", name: "NVIDIA Corp", market_type: "stock", data_provider: "schwab", active: true },
  { symbol: "TSLA", name: "Tesla Inc", market_type: "stock", data_provider: "schwab", active: true },
  // Watch
  { symbol: "USAR", name: "USA Rare Earth Inc", market_type: "stock", data_provider: "schwab", active: true },
  { symbol: "UUUU", name: "Energy Fuels Inc", market_type: "stock", data_provider: "schwab", active: true },
  { symbol: "ONDS", name: "Ondas Holdings Inc", market_type: "stock", data_provider: "schwab", active: true },
];

export const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;

export type BrokerAccount = {
  accountNumber?: string;
  hashValue?: string;
  equity?: number;
  cash_balance?: number;
  available_funds?: number;
  buying_power?: number;
  risk_pct?: number;
  risk_budget?: number;
};

export type BrokerPosition = {
  account_hash: string;
  account_number: string;
  symbol: string;
  underlying: string;
  description: string;
  asset_type: string;
  quantity: number;
  average_price: number;
  market_value: number;
  mark: number | null;
  pnl_pct: number | null;
  day_pnl: number | null;
  day_pnl_pct: number | null;
  close_instruction: string;
  multiplier: number;
};

export type BrokerPositionsResponse = {
  trading_enabled: boolean;
  accounts: BrokerAccount[];
  positions: BrokerPosition[];
    orders?: BrokerOrder[];
    risk_pct?: number;
    error?: string | null;
    orders_error?: string | null;
};

export type BrokerOrder = {
  account_hash: string;
  account_number?: string;
  order_id: string;
  status: string;
  order_type: string;
  duration: string;
  price: number | null;
  quantity: number | null;
  filled_quantity: number | null;
  instruction: string | null;
  symbol: string;
  asset_type: string | null;
  entered_time: string | null;
};

export type TpLadderLeg = {
  pct: number;
  quantity: number;
  limit_price: number;
  order_id: string | null;
  ok: boolean;
  message: string;
};

export type TpLadderResponse = {
  ok: boolean;
  symbol: string;
  legs: TpLadderLeg[];
  message: string;
};

export type TpWatch = {
  id: string;
  accountHash: string;
  symbol: string;
  quantity: number;
  assetType: string;
  instruction: string;
  averagePrice: number;
  targetPct: number;
  alertOn: boolean;
  autoClose: boolean;
  lastPnlPct: number | null;
  lastMark: number | null;
  lastStatus: string | null;
  firedAt: string | null;
};

export type TpCheckResponse = {
  symbol: string;
  mark: number | null;
  pnl_pct: number | null;
  target_pct: number;
  hit: boolean;
  closed: boolean;
  order_id: string | null;
  message: string;
};
