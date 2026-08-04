export type MarketType = "stock" | "etf" | "future" | string;
export type DataProvider = "schwab" | "tradeadvocate" | string;
export type Side = "long" | "short" | "flat" | string;

export type Instrument = {
  symbol: string;
  name: string;
  market_type: MarketType;
  data_provider: DataProvider;
  active: boolean;
};

export type StrategyInfo = {
  name: string;
  description: string;
  default_parameters: Record<string, unknown>;
};

export type Trade = {
  side: Side;
  entry_time: string;
  entry_price: number | string;
  signal: string;
  exit_time?: string | null;
  exit_price?: number | string | null;
  profit_loss?: number | string | null;
  notes?: string | null;
};

export type Signal = {
  timestamp: string;
  side: Side;
  price: number | string;
  reason: string;
  ticker?: string;
};

export type Metrics = {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_loss: number | string;
  max_drawdown: number | string;
};

export type RunResult = {
  ticker: string;
  strategy: string;
  metrics: Metrics;
  trades: Trade[];
  signals: Signal[];
  runMeta: string;
};

export type Candle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? body;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

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

export const FALLBACK_STRATEGIES: StrategyInfo[] = [
  {
    name: "opening_range_breakout",
    description: "Opening Range Breakout (long and short) using US RTH session in America/New_York.",
    default_parameters: { opening_range_minutes: 5 },
  },
];

export const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;

export function getApiBase() {
  return API_BASE;
}

export function num(value: number | string | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number(value);
}

type BackendInstrument = {
  symbol: string;
  name: string;
  asset_class?: string;
  provider?: string;
  market_type?: string;
  data_provider?: string;
  is_active?: boolean;
  active?: boolean;
};

type BackendStrategy = {
  id?: string;
  name: string;
  description: string;
  default_parameters?: Record<string, unknown>;
};

function mapInstrument(row: BackendInstrument): Instrument {
  return {
    symbol: row.symbol,
    name: row.name,
    market_type: row.market_type || row.asset_class || "stock",
    data_provider: row.data_provider || row.provider || "schwab",
    active: row.active ?? row.is_active ?? true,
  };
}

export async function fetchInstruments(): Promise<Instrument[]> {
  try {
    const data = await api<BackendInstrument[] | { items: BackendInstrument[] }>("/instruments");
    const rows = Array.isArray(data) ? data : data.items;
    return rows?.length ? rows.map(mapInstrument) : FALLBACK_INSTRUMENTS;
  } catch {
    return FALLBACK_INSTRUMENTS;
  }
}

export async function fetchStrategies(): Promise<StrategyInfo[]> {
  try {
    const data = await api<BackendStrategy[] | { items: BackendStrategy[] }>("/strategies");
    const rows = Array.isArray(data) ? data : data.items;
    if (!rows?.length) return FALLBACK_STRATEGIES;
    return rows.map((s) => ({
      name: s.id || s.name,
      description: s.description,
      default_parameters: s.default_parameters || { opening_range_minutes: 5 },
    }));
  } catch {
    return FALLBACK_STRATEGIES;
  }
}

type BackendTrade = {
  side: string;
  entry_time: string;
  entry_price: string | number;
  exit_time?: string | null;
  exit_price?: string | number | null;
  pnl?: string | number | null;
  profit_loss?: string | number | null;
  signal?: string;
  status?: string;
  quantity?: string | number;
};

type BackendSignal = {
  timestamp: string;
  side: string;
  price: string | number;
  reason?: string;
  signal_type?: string;
};

type BackendBacktestResponse = {
  backtest_run_id?: number | string;
  run_id?: string;
  status?: string;
  symbol: string;
  strategy_id?: string;
  total_trades: number;
  total_pnl: string | number;
  signals: BackendSignal[];
  trades: BackendTrade[];
  summary?: {
    win_rate?: number;
    winning_trades?: number;
    losing_trades?: number;
    max_drawdown?: number | string;
    metadata?: Record<string, unknown>;
  };
};

function mapTrades(trades: BackendTrade[]): Trade[] {
  return trades.map((t) => ({
    side: t.side,
    entry_time: t.entry_time,
    entry_price: t.entry_price,
    exit_time: t.exit_time,
    exit_price: t.exit_price,
    profit_loss: t.profit_loss ?? t.pnl ?? null,
    signal: t.signal || t.status || "",
    notes: t.quantity != null ? `qty ${t.quantity}` : null,
  }));
}

function mapSignals(signals: BackendSignal[]): Signal[] {
  return signals.map((s) => ({
    timestamp: s.timestamp,
    side: s.side,
    price: s.price,
    reason: s.reason || s.signal_type || "",
  }));
}

function computeMetrics(
  trades: Trade[],
  totalPnl: number | string,
  summary?: BackendBacktestResponse["summary"],
): Metrics {
  const closed = trades.filter((t) => t.profit_loss != null);
  const wins = closed.filter((t) => num(t.profit_loss) > 0);
  const losses = closed.filter((t) => num(t.profit_loss) <= 0);
  return {
    total_trades: summary?.winning_trades != null
      ? wins.length + losses.length || closed.length
      : closed.length,
    winning_trades: summary?.winning_trades ?? wins.length,
    losing_trades: summary?.losing_trades ?? losses.length,
    win_rate:
      summary?.win_rate ??
      (closed.length ? wins.length / closed.length : 0),
    profit_loss: totalPnl,
    max_drawdown: summary?.max_drawdown ?? 0,
  };
}

/** Day evaluate = synchronous backtest for a single session date (API syncs candles). */
export async function runEvaluateDay(payload: {
  ticker: string;
  strategy: string;
  timeframe: string;
  date: string;
  parameters?: Record<string, unknown>;
}): Promise<RunResult> {
  const start = `${payload.date}T09:30:00-04:00`;
  const end = `${payload.date}T16:00:00-04:00`;
  const res = await api<BackendBacktestResponse>("/strategy/backtest", {
    method: "POST",
    body: JSON.stringify({
      strategy_id: payload.strategy,
      symbol: payload.ticker,
      timeframe: payload.timeframe === "1d" ? "1m" : payload.timeframe,
      start,
      end,
      sync_first: true,
      params: {
        opening_range_minutes: Number(payload.parameters?.opening_range_minutes ?? 5),
        allow_long: true,
        allow_short: true,
        flatten_at_session_end: true,
      },
    }),
  });
  const trades = mapTrades(res.trades || []);
  const signals = mapSignals(res.signals || []);
  return {
    ticker: res.symbol,
    strategy: res.strategy_id || payload.strategy,
    metrics: computeMetrics(trades, res.total_pnl, res.summary),
    trades,
    signals,
    runMeta: `Evaluate ${res.symbol} · ${payload.date}${
      res.backtest_run_id != null ? ` · run #${res.backtest_run_id}` : ""
    }`,
  };
}

export async function runBacktestRange(payload: {
  ticker: string;
  strategy: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  parameters?: Record<string, unknown>;
}): Promise<RunResult> {
  const res = await api<BackendBacktestResponse>("/strategy/backtest", {
    method: "POST",
    body: JSON.stringify({
      strategy_id: payload.strategy,
      symbol: payload.ticker,
      timeframe: payload.timeframe === "1d" ? "1m" : payload.timeframe,
      start: `${payload.start_date}T09:30:00-04:00`,
      end: `${payload.end_date}T16:00:00-04:00`,
      sync_first: true,
      params: {
        opening_range_minutes: Number(payload.parameters?.opening_range_minutes ?? 5),
        allow_long: true,
        allow_short: true,
        flatten_at_session_end: true,
      },
    }),
  });
  const trades = mapTrades(res.trades || []);
  const signals = mapSignals(res.signals || []);
  return {
    ticker: res.symbol,
    strategy: res.strategy_id || payload.strategy,
    metrics: computeMetrics(trades, res.total_pnl, res.summary),
    trades,
    signals,
    runMeta: `Backtest ${res.symbol} · ${payload.start_date} → ${payload.end_date}${
      res.backtest_run_id != null ? ` · run #${res.backtest_run_id}` : ""
    }`,
  };
}
