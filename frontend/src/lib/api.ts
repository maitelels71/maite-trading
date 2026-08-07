import type {
  AdminOverview,
  BacktestResponse,
  Candle,
  EvaluateResponse,
  Instrument,
  NewsBriefing,
  PremarketAlarmCheck,
  PremarketResult,
  ScanResponse,
  SchwabTokenStatus,
  Strategy,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore parse errors
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
