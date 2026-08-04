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
  type BacktestResponse,
  type Candle,
  type EvaluateResponse,
  type Instrument,
  type Strategy,
  type Trade,
} from "@/lib/types";

type Mode = "evaluate" | "backtest";

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

  const selected = useMemo(
    () => instruments.find((i) => i.symbol === symbol) ?? null,
    [instruments, symbol],
  );

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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-400">
              Maite Trading
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Strategy Analyzer
            </h1>
          </div>
          <p className="hidden text-right text-xs text-zinc-500 sm:block">
            API
            <br />
            <code className="text-zinc-400">{getApiBase()}</code>
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[320px_1fr]">
        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-sm font-medium text-zinc-300">Controls</h2>

          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Instrument</span>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              {instruments.map((i) => (
                <option key={`${i.symbol}-${i.market_type}`} value={i.symbol}>
                  {i.symbol} · {i.market_type} · {i.data_provider}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Strategy</span>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
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
            <span className="text-zinc-400">Timeframe</span>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
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
                  ? "bg-emerald-500 text-zinc-950"
                  : "border border-zinc-700 text-zinc-300"
              }`}
              onClick={() => setMode("evaluate")}
            >
              Evaluate
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-2 ${
                mode === "backtest"
                  ? "bg-emerald-500 text-zinc-950"
                  : "border border-zinc-700 text-zinc-300"
              }`}
              onClick={() => setMode("backtest")}
            >
              Backtest
            </button>
          </div>

          {mode === "evaluate" ? (
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Date</span>
              <input
                type="date"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="space-y-1">
                <span className="text-zinc-400">Start</span>
                <input
                  type="date"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-zinc-400">End</span>
                <input
                  type="date"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
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
              className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {pending ? "Running…" : mode === "evaluate" ? "Run evaluate" : "Run backtest"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onSync}
              className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-60"
            >
              Sync market data
            </button>
          </div>

          {selected ? (
            <p className="text-xs text-zinc-500">
              Provider: <span className="text-zinc-300">{selected.data_provider}</span>
              {" · "}
              {selected.name}
            </p>
          ) : null}
        </section>

        <section className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}
          {status ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300">
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
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"
              >
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {label}
                </p>
                <p className="mt-1 text-xl font-semibold text-zinc-100">{value}</p>
              </div>
            ))}
          </div>

          <TradeChart candles={candles} trades={trades} />

          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <div className="border-b border-zinc-800 px-4 py-3 text-sm text-zinc-400">
              Trades
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-900/80 text-zinc-500">
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
                      <td className="px-3 py-4 text-zinc-500" colSpan={5}>
                        No trades yet. Run evaluate or backtest.
                      </td>
                    </tr>
                  ) : (
                    trades.map((t, idx) => (
                      <tr key={`${t.entry_time}-${idx}`} className="border-t border-zinc-800/80">
                        <td className="px-3 py-2 capitalize text-zinc-200">{t.side}</td>
                        <td className="px-3 py-2 text-zinc-300">
                          {fmtNum(t.entry_price)}
                          <div className="text-xs text-zinc-500">
                            {new Date(t.entry_time).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {fmtNum(t.exit_price ?? null)}
                          <div className="text-xs text-zinc-500">
                            {t.exit_time
                              ? new Date(t.exit_time).toLocaleString()
                              : "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-zinc-200">
                          {fmtNum(t.profit_loss ?? null)}
                        </td>
                        <td className="px-3 py-2 text-zinc-400">{t.signal}</td>
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
