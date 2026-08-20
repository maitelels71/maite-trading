import type {
  AdminOverview,
  BacktestResponse,
  BrokerPositionsResponse,
  Candle,
  EvaluateResponse,
  Instrument,
  NewsBriefing,
  PremarketAlarmCheck,
  PremarketResult,
  ScanResponse,
  SchwabTokenStatus,
  Strategy,
  TpCheckResponse,
  TpLadderResponse,
} from "./types";
import { clearDeskToken, getDeskToken } from "./desk-session";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getDeskToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore parse errors
    }
    if (res.status === 401 && path !== "/auth/login") {
      clearDeskToken();
    }
    if (res.status === 503) {
      const scan = /\/strateg|\/scan/i.test(path);
      throw new Error(
        scan
          ? "Scan timed out (API ~29s). Sync & Scan now runs in smaller batches — retry."
          : "Request timed out (API ~29s). Retry.",
      );
    }
    if (res.status === 429) {
      const headerRetry = (res.headers.get("Retry-After") || "").trim();
      const retryMatch = /Retry-After (\d+)/i.exec(detail);
      const fromHeader = /^\d+$/.test(headerRetry) ? Number(headerRetry) : 0;
      const retryAfter = retryMatch
        ? Number(retryMatch[1])
        : fromHeader > 0
          ? fromHeader
          : 90;
      throw new Error(`Schwab 429. Retry-After ${retryAfter}s.`);
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export function getApiBase(): string {
  return API_BASE;
}

export async function fetchInstruments(): Promise<Instrument[]> {
  const data = await request<{ items: Instrument[] }>("/instruments");
  return data.items;
}

export async function fetchStrategies(): Promise<Strategy[]> {
  const data = await request<{ items: Strategy[] }>("/strategies");
  return data.items;
}

export async function syncMarketData(payload: {
  ticker: string;
  timeframe: string;
  start: string;
  end: string;
  market_type?: string;
  force_refresh?: boolean;
}): Promise<{ candles_count: number }> {
  return request("/market-data/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchCandles(params: {
  ticker: string;
  timeframe: string;
  start: string;
  end: string;
  market_type?: string;
}): Promise<Candle[]> {
  const qs = new URLSearchParams({
    ticker: params.ticker,
    timeframe: params.timeframe,
    start: params.start,
    end: params.end,
  });
  if (params.market_type) qs.set("market_type", params.market_type);
  const data = await request<{ items: Candle[] }>(`/market-data/candles?${qs}`);
  return data.items;
}

export async function evaluateStrategy(payload: {
  ticker: string;
  strategy: string;
  timeframe: string;
  date: string;
  market_type?: string;
  parameters?: Record<string, unknown>;
}): Promise<EvaluateResponse> {
  return request("/strategy/evaluate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function backtestStrategy(payload: {
  ticker: string;
  strategy: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  market_type?: string;
  parameters?: Record<string, unknown>;
  persist?: boolean;
}): Promise<BacktestResponse> {
  return request("/strategy/backtest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function scanStrategies(payload: {
  strategies?: string[];
  timeframe?: string;
  session_date?: string;
  data_provider?: string;
  symbols?: string[];
  matches_only?: boolean;
  top_n?: number;
}): Promise<ScanResponse> {
  return request("/strategy/scan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchNewsBriefing(
  sessionDate?: string,
): Promise<NewsBriefing> {
  const qs = sessionDate
    ? `?session_date=${encodeURIComponent(sessionDate)}`
    : "";
  return request(`/news/briefing${qs}`);
}

export async function startPremarketEvaluate(payload?: {
  session_date?: string;
  timeframe?: string;
  data_provider?: string;
  strategies?: string[];
  symbols?: string[];
}): Promise<PremarketResult> {
  return request("/premarket/evaluate/start", {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function getPremarketResult(
  runId?: string,
): Promise<PremarketResult> {
  const qs = runId ? `?run_id=${encodeURIComponent(runId)}` : "";
  return request(`/premarket/evaluate/result${qs}`);
}

export async function checkPremarketAlarm(payload: {
  symbol: string;
  strategy: string;
  timeframe?: string;
  session_date?: string;
  data_provider?: string;
}): Promise<PremarketAlarmCheck> {
  return request("/premarket/alarm/check", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return request("/admin/overview");
}

export async function fetchSchwabStatus(): Promise<SchwabTokenStatus> {
  return request("/admin/schwab/status");
}

export async function refreshSchwabToken(): Promise<SchwabTokenStatus> {
  return request("/admin/schwab/refresh", { method: "POST" });
}

export async function publishSchwabToken(): Promise<SchwabTokenStatus> {
  return request("/admin/schwab/publish", { method: "POST" });
}

export async function fetchSchwabLoginLink(): Promise<{
  authorize_url: string;
  redirect_uri: string;
  callback_path: string;
  portal_hint: string;
}> {
  return request("/admin/schwab/login-link");
}

export async function upsertSchwabToken(payload: {
  token_json: string;
  publish?: boolean;
}): Promise<SchwabTokenStatus> {
  return request("/admin/schwab/token", {
    method: "POST",
    body: JSON.stringify({
      token_json: payload.token_json,
      publish: payload.publish ?? true,
    }),
  });
}

export async function saveDailyToNotion(payload: {
  date: string;
  bias: string;
  notes: string;
  checked: Record<string, boolean>;
  sections: Array<{
    id: string;
    title: string;
    items: Array<{ id: string; label: string }>;
  }>;
}): Promise<{
  action: string;
  page_id: string;
  url: string;
  date: string;
  done: number;
  total: number;
}> {
  return request("/daily/notion", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type JournalScreenshot = {
  label: string;
  filename: string;
  content_type: string;
  data_base64: string;
};

export async function saveTradeToNotion(payload: {
  date: string;
  title?: string;
  activo: string;
  side: "Compra" | "Venta";
  session: string;
  playbook: string;
  tf_setup: string;
  status: string;
  stuck_to_plan: string;
  entry?: number | null;
  sl?: number | null;
  tp?: number | null;
  be?: number | null;
  r_planned?: number | null;
  r_real?: number | null;
  pnl_usd?: number | null;
  thesis?: string;
  what_happened?: string;
  lesson?: string;
  screenshots_before?: JournalScreenshot[];
  screenshots_after?: JournalScreenshot[];
}): Promise<{
  action: string;
  page_id: string;
  url: string;
  date: string;
  images_uploaded: number;
  images_failed: number;
}> {
  return request("/journal/notion", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchBrokerPositions(opts?: {
  includeOrders?: boolean;
}): Promise<BrokerPositionsResponse> {
  const includeOrders = opts?.includeOrders !== false;
  const qs = includeOrders ? "" : "?include_orders=false";
  return request(`/broker/positions${qs}`);
}

export async function brokerOptionQuote(params: {
  underlying: string;
  option_type: string;
  strike: number;
  exp_iso: string;
}): Promise<{
  occ: string;
  bid: number | null;
  ask: number | null;
  mark: number | null;
  last: number | null;
  fillable: number | null;
}> {
  const q = new URLSearchParams({
    underlying: params.underlying,
    option_type: params.option_type,
    strike: String(params.strike),
    exp_iso: params.exp_iso,
  });
  return request(`/broker/option-quote?${q.toString()}`);
}

export async function brokerOptionExpirations(symbol: string): Promise<{
  symbol: string;
  dates: string[];
}> {
  const q = new URLSearchParams({ symbol });
  return request(`/broker/option-expirations?${q.toString()}`);
}

export async function brokerOpenOption(payload: {
  account_hash: string;
  underlying: string;
  option_type: string;
  strike: number;
  exp_iso: string;
  entry_premium: number;
  quantity?: number;
  confirm_live: boolean;
  order_type?: string;
  duration?: string;
  equity?: number;
  cash_available?: number;
}): Promise<{
  ok: boolean;
  order_id: string | null;
  status: string;
  message: string;
  option_symbol?: string | null;
  limit_price?: number | null;
  quantity?: number | null;
  cost?: number | null;
  risk_budget?: number | null;
}> {
  return request("/broker/orders/open", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function brokerClosePosition(payload: {
  account_hash: string;
  symbol: string;
  quantity: number;
  asset_type: string;
  instruction: string;
  confirm_live: boolean;
  order_type?: string;
  limit_price?: number | null;
}): Promise<{
  ok: boolean;
  order_id: string | null;
  status: string;
  message: string;
}> {
  return request("/broker/orders/close", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function brokerTpCheck(payload: {
  account_hash: string;
  symbol: string;
  quantity: number;
  asset_type: string;
  instruction: string;
  average_price: number;
  target_pct: number;
  auto_close: boolean;
  confirm_live: boolean;
  order_type?: string;
}): Promise<TpCheckResponse> {
  return request("/broker/tp-check", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function brokerTpLadder(payload: {
  account_hash: string;
  symbol: string;
  quantity: number;
  asset_type: string;
  instruction: string;
  average_price: number;
  confirm_live: boolean;
  duration?: string;
  target_pct?: number;
}): Promise<TpLadderResponse> {
  return request("/broker/orders/tp-ladder", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type DeskLoginResponse = { token: string; user: string };

export type CoinbaseStatus = {
  configured: boolean;
  trading_enabled: boolean;
  dry_run_default: boolean;
  quote: string;
  assets: string;
  max_trade_usd: number;
  min_trade_usd: number;
  cash_pct: number;
  rebalance_threshold_pct: number;
  lookback_days: number;
  key_file_present: boolean;
};

export type CoinbasePlanSettings = {
  max_trade_usd: number;
  min_trade_usd: number;
  cash_pct: number;
  rebalance_threshold_pct: number;
  lookback_days: number;
};

export type CoinbaseOrder = {
  product_id: string;
  asset: string;
  side: string;
  quote_size: string | null;
  base_size: string | null;
  notional: string;
  reason: string;
};

export type CoinbaseRun = {
  id: string;
  ts: string;
  dry_run: boolean;
  quote: string;
  weights: Record<string, number>;
  holdings: Record<string, string>;
  prices: Record<string, string>;
  orders: CoinbaseOrder[];
  submissions: Record<string, unknown>[];
  error: string | null;
  portfolio_value: string;
};

export type CoinbaseStats = {
  total_runs: number;
  dry_runs: number;
  live_runs: number;
  last_run_at: string | null;
  last_dry_run: boolean | null;
  last_portfolio_value: string | null;
  live_orders_ok: number;
  live_orders_failed: number;
  planned_notional_total: string;
};

export async function deskLogin(
  username: string,
  password: string,
): Promise<DeskLoginResponse> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchCoinbaseStatus(): Promise<CoinbaseStatus> {
  return request("/coinbase/status");
}

export async function fetchCoinbaseRuns(): Promise<CoinbaseRun[]> {
  const data = await request<{ items: CoinbaseRun[] }>("/coinbase/runs");
  return data.items;
}

export async function fetchCoinbaseStats(): Promise<CoinbaseStats> {
  return request("/coinbase/stats");
}

export async function saveCoinbaseSettings(
  payload: CoinbasePlanSettings,
): Promise<CoinbasePlanSettings> {
  return request("/coinbase/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function runCoinbaseBot(payload: {
  live: boolean;
  confirm_live: boolean;
} & Partial<CoinbasePlanSettings>): Promise<CoinbaseRun> {
  return request("/coinbase/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
