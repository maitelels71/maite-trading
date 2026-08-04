import type {
  BacktestResponse,
  Candle,
  EvaluateResponse,
  Instrument,
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
