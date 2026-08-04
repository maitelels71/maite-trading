"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  FALLBACK_INSTRUMENTS,
  FALLBACK_STRATEGIES,
  TIMEFRAMES,
  fetchInstruments,
  fetchStrategies,
  getApiBase,
  num,
  runBacktestRange,
  runEvaluateDay,
  type Candle,
  type Instrument,
  type Metrics,
  type StrategyInfo,
  type Trade,
} from "@/lib/api";
import { StrategyChart } from "@/components/StrategyChart";

type Mode = "evaluate" | "backtest";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number, digits = 2) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function buildDemoCandles(trades: Trade[]): Candle[] {
  // Synthetic path for demo when API has no candle endpoint yet
  if (!trades.length) {
    const base = 100;
    const start = new Date();
    start.setHours(9, 30, 0, 0);
    return Array.from({ length: 24 }, (_, i) => {
      const ts = new Date(start.getTime() + i * 5 * 60_000);
      const open = base + i * 0.2;
      const close = open + (i % 2 === 0 ? 0.4 : -0.3);
      return {
        timestamp: ts.toISOString(),
        open,
        high: Math.max(open, close) + 0.5,
        low: Math.min(open, close) - 0.5,
        close,
        volume: 100 + i,
      };
    });
  }
  const points: Candle[] = [];
  for (const t of trades) {
    const entry = num(t.entry_price);
    points.push({
      timestamp: t.entry_time,
      open: entry * 0.999,
      high: entry * 1.002,
      low: entry * 0.998,
      close: entry,
    });
    if (t.exit_time && t.exit_price != null) {
      const exit = num(t.exit_price);
      points.push({
        timestamp: t.exit_time,
        open: exit * 0.999,
        high: exit * 1.002,
        low: exit * 0.998,
        close: exit,
      });
    }
  }
  return points.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

export function Dashboard() {
  const [instruments, setInstruments] = useState<Instrument[]>(FALLBACK_INSTRUMENTS);
  const [strategies, setStrategies] = useState<StrategyInfo[]>(FALLBACK_STRATEGIES);
  const [symbol, setSymbol] = useState("SPY");
  const [strategy, setStrategy] = useState("opening_range_breakout");
  const [timeframe, setTimeframe] = useState("5m");
  const [mode, setMode] = useState<Mode>("evaluate");
  const [date, setDate] = useState(todayISO());
  const [startDate, setStartDate] = useState(daysAgoISO(30));
  const [endDate, setEndDate] = useState(todayISO());
  const [rangeMinutes, setRangeMinutes] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [runMeta, setRunMeta] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);

  const selected = useMemo(
    () => instruments.find((i) => i.symbol === symbol) ?? instruments[0],
    [instruments, symbol],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ins, strats] = await Promise.all([fetchInstruments(), fetchStrategies()]);
      if (cancelled) return;
      setInstruments(ins);
      setStrategies(strats);
      try {
        const res = await fetch(`${getApiBase()}/health`);
        setApiOnline(res.ok);
      } catch {
        setApiOnline(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function onRun() {
    setError(null);
    startTransition(async () => {
      try {
        const parameters = { opening_range_minutes: rangeMinutes };
        const result =
          mode === "evaluate"
            ? await runEvaluateDay({
                ticker: selected.symbol,
                strategy,
                timeframe,
                date,
                parameters,
              })
            : await runBacktestRange({
                ticker: selected.symbol,
                strategy,
                timeframe,
                start_date: startDate,
                end_date: endDate,
                parameters,
              });
        setMetrics(result.metrics);
        setTrades(result.trades);
        setRunMeta(result.runMeta);
        setCandles(buildDemoCandles(result.trades));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8">
      <header className="mb-10 animate-[fadeUp_0.7s_ease_both]">
        <p
          className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--brand)]"
          style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}
        >
          Maite Trading
        </p>
        <h1
          className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-[var(--ink)] sm:text-5xl"
          style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}
        >
          Strategy Analyzer
        </h1>
        <p className="mt-3 max-w-xl text-base text-[var(--muted)]">
          Research Opening Range Breakout across equities (Schwab) and futures
          (TradeAdvocate). Sync backtests, no live orders in v1.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${
              apiOnline
                ? "border-[rgba(61,214,140,0.35)] text-[var(--brand)]"
                : "border-[var(--line)]"
            }`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background: apiOnline ? "var(--brand)" : "var(--warn)",
                boxShadow: apiOnline ? "0 0 12px var(--brand)" : "none",
              }}
            />
            API {apiOnline == null ? "checking…" : apiOnline ? "online" : "offline — using fallbacks"}
          </span>
          <span className="text-[var(--muted)]">{getApiBase()}</span>
        </div>
      </header>

      <section
        className="mb-8 grid gap-4 rounded-3xl border border-[var(--line)] bg-[var(--bg-panel)] p-5 backdrop-blur-md animate-[fadeUp_0.8s_ease_both]"
        style={{ boxShadow: "var(--shadow)" }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Instrument">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="field"
            >
              {instruments.map((i) => (
                <option key={`${i.symbol}-${i.market_type}`} value={i.symbol}>
                  {i.symbol} · {i.market_type} · {i.data_provider}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Strategy">
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="field"
            >
              {strategies.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Timeframe">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="field"
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf === "1d" ? "Daily" : tf}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Opening range (min)">
            <input
              type="number"
              min={1}
              max={60}
              value={rangeMinutes}
              onChange={(e) => setRangeMinutes(Number(e.target.value))}
              className="field"
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["evaluate", "backtest"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                mode === m
                  ? "bg-[var(--brand)] text-[#062016]"
                  : "border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {m === "evaluate" ? "Evaluate day" : "Backtest range"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mode === "evaluate" ? (
            <Field label="Session date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="field"
              />
            </Field>
          ) : (
            <>
              <Field label="Start date">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="field"
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="field"
                />
              </Field>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRun}
            disabled={pending}
            className="rounded-full bg-[var(--brand)] px-6 py-2.5 text-sm font-semibold text-[#062016] transition hover:bg-[#63e3a5] disabled:opacity-60"
          >
            {pending ? "Running…" : mode === "evaluate" ? "Run evaluate" : "Run backtest"}
          </button>
          {selected && (
            <p className="text-sm text-[var(--muted)]">
              {selected.name} via <span className="text-[var(--ink)]">{selected.data_provider}</span>
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-[rgba(255,122,110,0.35)] bg-[rgba(255,122,110,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
      </section>

      <section className="mb-8 animate-[fadeUp_0.9s_ease_both]">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}
          >
            Chart
          </h2>
          {runMeta && <p className="text-sm text-[var(--muted)]">{runMeta}</p>}
        </div>
        <StrategyChart candles={candles} trades={trades} />
      </section>

      {metrics && (
        <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 animate-[fadeUp_1s_ease_both]">
          <Metric label="Trades" value={String(metrics.total_trades)} />
          <Metric label="Win rate" value={`${fmt(num(metrics.win_rate) * 100, 1)}%`} />
          <Metric label="Wins" value={String(metrics.winning_trades)} />
          <Metric label="PnL" value={fmt(num(metrics.profit_loss))} accent={num(metrics.profit_loss) >= 0 ? "long" : "short"} />
          <Metric label="Max DD" value={fmt(num(metrics.max_drawdown))} accent="short" />
        </section>
      )}

      <section className="animate-[fadeUp_1.05s_ease_both]">
        <h2
          className="mb-3 text-xl font-semibold"
          style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}
        >
          Trades
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--bg-panel)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Side</th>
                <th className="px-4 py-3 font-medium">Entry</th>
                <th className="px-4 py-3 font-medium">Exit</th>
                <th className="px-4 py-3 font-medium">PnL</th>
                <th className="px-4 py-3 font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-[var(--muted)]">
                    No trades yet. Run a strategy to populate this table.
                  </td>
                </tr>
              ) : (
                trades.map((t, idx) => (
                  <tr key={`${t.entry_time}-${idx}`} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-3">
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-semibold uppercase"
                        style={{
                          color: t.side === "short" ? "var(--short)" : "var(--long)",
                          background:
                            t.side === "short"
                              ? "rgba(255,122,110,0.12)"
                              : "rgba(61,214,140,0.12)",
                        }}
                      >
                        {t.side}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>{fmt(num(t.entry_price))}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {new Date(t.entry_time).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{t.exit_price != null ? fmt(num(t.exit_price)) : "—"}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {t.exit_time ? new Date(t.exit_time).toLocaleString() : "—"}
                      </div>
                    </td>
                    <td
                      className="px-4 py-3 font-medium"
                      style={{
                        color:
                          num(t.profit_loss) >= 0 ? "var(--long)" : "var(--short)",
                      }}
                    >
                      {t.profit_loss != null ? fmt(num(t.profit_loss)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{t.signal}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "long" | "short";
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-panel)] px-4 py-4">
      <div className="text-xs uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div
        className="mt-2 text-2xl font-semibold"
        style={{
          fontFamily: "var(--font-syne), Syne, sans-serif",
          color:
            accent === "long"
              ? "var(--long)"
              : accent === "short"
                ? "var(--short)"
                : "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
