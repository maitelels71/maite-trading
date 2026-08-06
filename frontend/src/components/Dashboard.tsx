"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { TradeChart } from "@/components/TradeChart";
import {
  backtestStrategy,
  evaluateStrategy,
  fetchCandles,
  fetchInstruments,
  fetchStrategies,
  getApiBase,
  syncMarketData,
} from "@/lib/api";
import {
  FALLBACK_INSTRUMENTS,
  TIMEFRAMES,
  VENUE_META,
  type BacktestResponse,
  type Candle,
  type EvaluateResponse,
  type Instrument,
  type Strategy,
  type Trade,
  type Venue,
} from "@/lib/types";

type Mode = "evaluate" | "backtest";

const VENUE_STORAGE_KEY = "maite.venue";

function readStoredVenue(): Venue {
  if (typeof window === "undefined") return "schwab";
  const v = window.localStorage.getItem(VENUE_STORAGE_KEY);
  return v === "tradeadvocate" ? "tradeadvocate" : "schwab";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtNum(v: string | number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function Dashboard() {
  const [instruments, setInstruments] = useState<Instrument[]>(FALLBACK_INSTRUMENTS);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [venue, setVenue] = useState<Venue>("schwab");
  const [symbol, setSymbol] = useState("SPY");
  const [strategy, setStrategy] = useState("opening_range_breakout");
  const [timeframe, setTimeframe] = useState("5m");
  const [mode, setMode] = useState<Mode>("evaluate");
  const [date, setDate] = useState(todayIso());
  const [startDate, setStartDate] = useState(daysAgoIso(5));
  const [endDate, setEndDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;
    profit_loss: string | number;
    max_drawdown: string | number;
  } | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [pending, startTransition] = useTransition();

  const venueInstruments = useMemo(
    () => instruments.filter((i) => i.data_provider === venue && i.active),
    [instruments, venue],
  );

  const selected = useMemo(
    () => venueInstruments.find((i) => i.symbol === symbol) ?? null,
    [venueInstruments, symbol],
  );

  useEffect(() => {
    setVenue(readStoredVenue());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(VENUE_STORAGE_KEY, venue);
    const stillValid = venueInstruments.some((i) => i.symbol === symbol);
    if (!stillValid) {
      setSymbol(VENUE_META[venue].defaultSymbol);
      setMetrics(null);
      setTrades([]);
      setCandles([]);
      setStatus(null);
      setError(null);
    }
  }, [venue, venueInstruments, symbol]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ins, strats] = await Promise.all([
          fetchInstruments(),
          fetchStrategies(),
        ]);
        if (cancelled) return;
        if (ins.length) setInstruments(ins);
        if (strats.length) {
          setStrategies(strats);
          setStrategy(strats[0].name);
        }
      } catch {
        if (!cancelled) {
          setStatus(
            `API offline (${getApiBase()}). Using fallback instruments. Start backend to run live.`,
          );
          setStrategies([
            {
              name: "opening_range_breakout",
              description: "Opening Range Breakout (long/short)",
              default_parameters: { opening_range_minutes: 5 },
            },
          ]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function rangeForCandles(): { start: string; end: string } {
    if (mode === "evaluate") {
      return {
        start: `${date}T00:00:00`,
        end: `${date}T23:59:59`,
      };
    }
    return {
      start: `${startDate}T00:00:00`,
      end: `${endDate}T23:59:59`,
    };
  }

  async function loadCandles() {
    const { start, end } = rangeForCandles();
    try {
      const rows = await fetchCandles({
        ticker: symbol,
        timeframe,
        start,
        end,
        market_type: selected?.market_type,
      });
      setCandles(rows);
    } catch {
      setCandles([]);
    }
  }

  function applyEvaluate(res: EvaluateResponse) {
    setMetrics(res.metrics);
    setTrades(res.trades);
  }

  function applyBacktest(res: BacktestResponse) {
    setMetrics({
      total_trades: res.total_trades,
      winning_trades: res.winning_trades,
      losing_trades: res.losing_trades,
      win_rate: res.win_rate,
      profit_loss: res.profit_loss,
      max_drawdown: res.max_drawdown,
    });
    setTrades(res.trades);
  }

  function onSync() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        const { start, end } = rangeForCandles();
        const res = await syncMarketData({
          ticker: symbol,
          timeframe,
          start,
          end,
          market_type: selected?.market_type,
          force_refresh: true,
        });
        setStatus(`Synced ${res.candles_count} candles for ${symbol}`);
        await loadCandles();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sync failed");
      }
    });
  }

  function onRun() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        if (mode === "evaluate") {
          const res = await evaluateStrategy({
            ticker: symbol,
            strategy,
            timeframe,
            date,
            market_type: selected?.market_type,
          });
          applyEvaluate(res);
          setStatus(`Evaluate complete for ${symbol} on ${date}`);
        } else {
          const res = await backtestStrategy({
            ticker: symbol,
            strategy,
            timeframe,
            start_date: startDate,
            end_date: endDate,
            market_type: selected?.market_type,
            persist: true,
          });
          applyBacktest(res);
          setStatus(
            `Backtest complete${res.run_id ? ` · run ${res.run_id}` : ""}`,
          );
        }
        await loadCandles();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Run failed");
      }
    });
  }

  function switchVenue(next: Venue) {
    if (next === venue) return;
    setVenue(next);
  }

  return (
    <div>
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Strategy Analyzer
            </h1>
            <p className="text-sm text-[var(--muted)]">
              Evaluate and backtest setups per symbol
            </p>
          </div>
          <p className="text-right text-xs text-[var(--muted)]">
            API
            <br />
            <code className="text-[var(--muted)]">{getApiBase()}</code>
          </p>
        </div>
        <div className="mx-auto flex max-w-6xl gap-2 px-6 pb-4">
          {(["schwab", "tradeadvocate"] as Venue[]).map((v) => {
            const active = venue === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => switchVenue(v)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border-strong)] text-stone-700 hover:border-stone-400"
                }`}
              >
                {VENUE_META[v].label}
                <span className="ml-2 text-xs opacity-70">
                  {VENUE_META[v].shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[320px_1fr]">
        <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-medium text-stone-700">Controls</h2>
          <p className="text-xs text-[var(--muted)]">{VENUE_META[venue].hint}</p>

          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">Instrument</span>
            <select
              className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              {venueInstruments.map((i) => (
                <option key={`${i.symbol}-${i.market_type}`} value={i.symbol}>
                  {i.symbol} · {i.market_type}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">Strategy</span>
            <select
              className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            >
              {(strategies.length
                ? strategies
                : [{ name: "opening_range_breakout", description: "", default_parameters: {} }]
              ).map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">Timeframe</span>
            <select
              className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf === "1d" ? "Daily" : tf}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2 text-sm">
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-2 ${
                mode === "evaluate"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border-strong)] text-stone-700"
              }`}
              onClick={() => setMode("evaluate")}
            >
              Evaluate
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-2 ${
                mode === "backtest"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border-strong)] text-stone-700"
              }`}
              onClick={() => setMode("backtest")}
            >
              Backtest
            </button>
          </div>

          {mode === "evaluate" ? (
            <label className="block space-y-1 text-sm">
              <span className="text-[var(--muted)]">Date</span>
              <input
                type="date"
                className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="space-y-1">
                <span className="text-[var(--muted)]">Start</span>
                <input
                  type="date"
                  className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[var(--muted)]">End</span>
                <input
                  type="date"
                  className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              disabled={pending}
              onClick={onRun}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {pending ? "Running…" : mode === "evaluate" ? "Run evaluate" : "Run backtest"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onSync}
              className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm text-stone-800 hover:border-stone-400 disabled:opacity-60"
            >
              Sync market data
            </button>
          </div>

          {selected ? (
            <p className="text-xs text-[var(--muted)]">
              Provider: <span className="text-stone-700">{selected.data_provider}</span>
              {" · "}
              {selected.name}
            </p>
          ) : null}
        </section>

        <section className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}
          {status ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-stone-700">
              {status}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Trades", metrics ? String(metrics.total_trades) : "—"],
              ["Win rate", metrics ? fmtPct(metrics.win_rate) : "—"],
              ["PnL", metrics ? fmtNum(metrics.profit_loss) : "—"],
              ["Max DD", metrics ? fmtNum(metrics.max_drawdown) : "—"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {label}
                </p>
                <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">{value}</p>
              </div>
            ))}
          </div>

          <TradeChart candles={candles} trades={trades} />

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <div className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
              Trades
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--surface-muted)] text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Side</th>
                    <th className="px-3 py-2 font-medium">Entry</th>
                    <th className="px-3 py-2 font-medium">Exit</th>
                    <th className="px-3 py-2 font-medium">PnL</th>
                    <th className="px-3 py-2 font-medium">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-[var(--muted)]" colSpan={5}>
                        No trades yet. Run evaluate or backtest.
                      </td>
                    </tr>
                  ) : (
                    trades.map((t, idx) => (
                      <tr key={`${t.entry_time}-${idx}`} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 capitalize text-stone-800">{t.side}</td>
                        <td className="px-3 py-2 text-stone-700">
                          {fmtNum(t.entry_price)}
                          <div className="text-xs text-[var(--muted)]">
                            {new Date(t.entry_time).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-stone-700">
                          {fmtNum(t.exit_price ?? null)}
                          <div className="text-xs text-[var(--muted)]">
                            {t.exit_time
                              ? new Date(t.exit_time).toLocaleString()
                              : "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-stone-800">
                          {fmtNum(t.profit_loss ?? null)}
                        </td>
                        <td className="px-3 py-2 text-[var(--muted)]">{t.signal}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
