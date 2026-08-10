"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { TradeChart } from "@/components/TradeChart";
import { useLocale } from "@/components/LocaleProvider";
import {
  backtestStrategy,
  evaluateStrategy,
  fetchCandles,
  fetchInstruments,
  fetchStrategies,
  syncMarketData,
} from "@/lib/api";
import {
  playbookByStrategyKey,
  playbooksForVenue,
  strategyDisplayName,
  type StrategyPlaybook,
} from "@/lib/playbooks";
import { APP_MODE_LABEL, APP_VENUE } from "@/lib/app-mode";
import {
  FALLBACK_INSTRUMENTS,
  TIMEFRAMES,
  VENUE_META,
  type BacktestResponse,
  type Candle,
  type EvaluateResponse,
  type Instrument,
  type Signal,
  type Strategy,
  type Trade,
} from "@/lib/types";

type Mode = "evaluate" | "backtest";

function todayNyIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysAgoNyIso(days: number): string {
  const [y, m, d] = todayNyIso().split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
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

function sideBias(side: string): string {
  if (side === "long") return "CALL / LONG";
  if (side === "short") return "PUT / SHORT";
  return side;
}

function holdLabel(entryIso: string, exitIso: string | null | undefined): string {
  if (!exitIso) return "open";
  const ms = new Date(exitIso).getTime() - new Date(entryIso).getTime();
  if (ms < 0 || Number.isNaN(ms)) return "—";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 48) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function Dashboard() {
  const { t } = useLocale();
  const venue = APP_VENUE;
  const [instruments, setInstruments] = useState<Instrument[]>(FALLBACK_INSTRUMENTS);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [symbol, setSymbol] = useState(VENUE_META[APP_VENUE].defaultSymbol);
  const [strategy, setStrategy] = useState(
    APP_VENUE === "tradeadvocate" ? "opening_range_breakout" : "bb_trend_flip_h",
  );
  const [timeframe, setTimeframe] = useState("1h");
  const [tfLocked, setTfLocked] = useState(false);
  const [mode, setMode] = useState<Mode>("evaluate");
  const [date, setDate] = useState(todayNyIso);
  const [startDate, setStartDate] = useState(() => daysAgoNyIso(5));
  const [endDate, setEndDate] = useState(todayNyIso);
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
  const [signals, setSignals] = useState<Signal[]>([]);
  const [selectedTradeIdx, setSelectedTradeIdx] = useState<number | null>(null);
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

  const playbook: StrategyPlaybook | undefined = useMemo(
    () => playbookByStrategyKey(strategy),
    [strategy],
  );

  const books = useMemo(() => playbooksForVenue(venue), [venue]);

  const strategyOptions = useMemo(() => {
    const apiNames = new Set(strategies.map((s) => s.name));
    const fromBooks = books
      .filter((p) => p.strategyKey && (apiNames.size === 0 || apiNames.has(p.strategyKey)))
      .map((p) => ({
        key: p.strategyKey!,
        label: `${p.shortName} — ${p.name.replace(/^[A-Z0-9]+\s*—\s*/, "")}`,
        group: p.id.startsWith("cr") ? "cr" : p.id.startsWith("e") ? "bb" : "other",
        description: p.summary,
      }));
    const covered = new Set(fromBooks.map((o) => o.key));
    const extras = strategies
      .filter((s) => !covered.has(s.name))
      .filter((s) => {
        if (venue === "schwab") return s.name !== "opening_range_breakout" || fromBooks.length === 0;
        return true;
      })
      .map((s) => ({
        key: s.name,
        label: strategyDisplayName(s.name),
        group: "other" as const,
        description: s.description,
      }));
    return [...fromBooks, ...extras];
  }, [books, strategies, venue]);

  useEffect(() => {
    const stillValid = venueInstruments.some((i) => i.symbol === symbol);
    if (!stillValid && venueInstruments.length > 0) {
      setSymbol(VENUE_META[venue].defaultSymbol);
    }
  }, [venue, venueInstruments, symbol]);

  useEffect(() => {
    const pb = playbookByStrategyKey(strategy);
    if (pb?.preferredTimeframe) {
      setTimeframe(pb.preferredTimeframe);
      setTfLocked(true);
    } else {
      setTfLocked(false);
    }
  }, [strategy]);

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
        }
      } catch {
        if (!cancelled) {
          setStatus(
            "API offline. Using fallback instruments. Start backend to run live.",
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

  const syncTfs = useMemo(() => {
    if (playbook?.syncTimeframes?.length) return playbook.syncTimeframes;
    return [timeframe];
  }, [playbook, timeframe]);

  function rangeForCandles(): { start: string; end: string } {
    if (mode === "evaluate") {
      return {
        start: `${date}T00:00:00.000Z`,
        end: `${date}T23:59:59.999Z`,
      };
    }
    return {
      start: `${startDate}T00:00:00.000Z`,
      end: `${endDate}T23:59:59.999Z`,
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
    setSignals(res.signals ?? []);
    setSelectedTradeIdx(res.trades.length ? 0 : null);
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
    setSignals(res.signals ?? []);
    setSelectedTradeIdx(res.trades.length ? 0 : null);
  }

  function onSync() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        const { start, end } = rangeForCandles();
        let bars = 0;
        let errs = 0;
        for (const tf of syncTfs) {
          try {
            const res = await syncMarketData({
              ticker: symbol,
              timeframe: tf,
              start,
              end,
              market_type: selected?.market_type,
              force_refresh: true,
            });
            bars += res.candles_count;
          } catch {
            errs += 1;
          }
        }
        setStatus(`Synced ${bars} candles · ${syncTfs.join("+")} · ${errs} errors`);
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
          setStatus(
            `${strategyDisplayName(strategy)} · ${symbol} · ${date} · ${res.signals?.length ?? 0} signals · ${res.trades.length} trades`,
          );
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
            `${strategyDisplayName(strategy)} · backtest ${startDate}→${endDate}${res.run_id ? ` · run ${res.run_id}` : ""}`,
          );
        }
        await loadCandles();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Run failed");
      }
    });
  }

  const selectedTrade =
    selectedTradeIdx != null ? trades[selectedTradeIdx] ?? null : null;

  const field =
    "w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm";

  const bbOpts = strategyOptions.filter((o) => o.group === "bb");
  const crOpts = strategyOptions.filter((o) => o.group === "cr");
  const otherOpts = strategyOptions.filter((o) => o.group === "other");

  return (
    <div>
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("analyzer.title")}
            </h1>
            <p className="text-sm text-[var(--muted)]">{t("analyzer.subtitle")}</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {t("analyzer.howToUse")}
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
              <span className="rounded bg-[var(--surface-muted)] px-2 py-0.5 ring-1 ring-[var(--border)]">
                {APP_MODE_LABEL}
              </span>
              <span className="font-normal text-[var(--muted)]">
                {VENUE_META[venue].label} · {VENUE_META[venue].shortLabel}
              </span>
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-6 py-6 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-3">
          <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="text-sm font-semibold">{t("analyzer.controls")}</h2>
            <p className="text-[11px] text-[var(--muted)]">{VENUE_META[venue].hint}</p>

            <label className="block space-y-1 text-sm">
              <span className="text-[var(--muted)]">{t("analyzer.instrument")}</span>
              <select
                className={field}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              >
                {venueInstruments.map((i) => (
                  <option key={`${i.symbol}-${i.market_type}`} value={i.symbol}>
                    {i.symbol} · {i.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="text-[var(--muted)]">{t("analyzer.strategy")}</span>
              <select
                className={field}
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
              >
                {bbOpts.length > 0 ? (
                  <optgroup label={t("analyzer.groupBb")}>
                    {bbOpts.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {crOpts.length > 0 ? (
                  <optgroup label={t("analyzer.groupCr")}>
                    {crOpts.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {otherOpts.length > 0 ? (
                  <optgroup label={t("analyzer.groupOther")}>
                    {otherOpts.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="text-[var(--muted)]">{t("analyzer.timeframe")}</span>
              {tfLocked ? (
                <div className={`${field} opacity-80`}>
                  {timeframe}{" "}
                  <span className="text-[10px] text-[var(--muted)]">
                    ({t("analyzer.tfFromPlaybook")})
                  </span>
                </div>
              ) : (
                <select
                  className={field}
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                >
                  {TIMEFRAMES.map((tf) => (
                    <option key={tf} value={tf}>
                      {tf === "1d" ? "Daily" : tf}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <div className="flex gap-2 text-sm">
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2 ${
                  mode === "evaluate"
                    ? "bg-[var(--accent)] text-[var(--on-accent)]"
                    : "border border-[var(--border-strong)] text-[var(--muted)]"
                }`}
                onClick={() => setMode("evaluate")}
              >
                {t("analyzer.modeEvaluate")}
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2 ${
                  mode === "backtest"
                    ? "bg-[var(--accent)] text-[var(--on-accent)]"
                    : "border border-[var(--border-strong)] text-[var(--muted)]"
                }`}
                onClick={() => setMode("backtest")}
              >
                {t("analyzer.modeBacktest")}
              </button>
            </div>

            {mode === "evaluate" ? (
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--muted)]">{t("analyzer.date")}</span>
                <input
                  type="date"
                  className={field}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="space-y-1">
                  <span className="text-[var(--muted)]">{t("analyzer.start")}</span>
                  <input
                    type="date"
                    className={field}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[var(--muted)]">{t("analyzer.end")}</span>
                  <input
                    type="date"
                    className={field}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={pending}
                onClick={onRun}
                className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                {pending
                  ? t("analyzer.running")
                  : mode === "evaluate"
                    ? t("analyzer.runEvaluate")
                    : t("analyzer.runBacktest")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onSync}
                className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--hover)] disabled:opacity-60"
              >
                {t("analyzer.sync")}
              </button>
              <p className="text-[10px] text-[var(--muted)]">
                {t("analyzer.syncHint")} · {syncTfs.join(" + ")}
              </p>
            </div>
          </section>

          {playbook ? (
            <section className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="text-sm font-semibold">{playbook.shortName}</h3>
              <p className="text-xs font-medium text-[var(--foreground)]">
                {playbook.name}
              </p>
              <p className="text-[11px] text-[var(--muted)]">{playbook.summary}</p>
              <p className="text-[10px] text-[var(--muted)]">
                {playbook.markets} · {playbook.sessionWindow}
              </p>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {t("analyzer.entrySteps")}
                </p>
                <ol className="list-decimal space-y-1 pl-4 text-[11px] text-[var(--muted)]">
                  {playbook.entrySteps.slice(0, 5).map((s) => (
                    <li key={s.id}>
                      {s.label}
                      {s.detail ? (
                        <span className="block text-[10px] opacity-80">{s.detail}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {t("analyzer.risk")}
                </p>
                <ul className="space-y-0.5 text-[11px] text-[var(--muted)]">
                  {playbook.riskNotes.slice(0, 4).map((n) => (
                    <li key={n}>· {n}</li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
        </aside>

        <section className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}
          {status ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
              {status}
            </div>
          ) : null}

          <div>
            <h2 className="mb-2 text-sm font-semibold">{t("analyzer.metrics")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {[
                [t("analyzer.trades"), metrics ? String(metrics.total_trades) : "—"],
                [t("analyzer.wins"), metrics ? String(metrics.winning_trades) : "—"],
                [t("analyzer.losses"), metrics ? String(metrics.losing_trades) : "—"],
                [t("analyzer.winRate"), metrics ? fmtPct(metrics.win_rate) : "—"],
                [t("analyzer.pnl"), metrics ? fmtNum(metrics.profit_loss) : "—"],
                [t("analyzer.maxDd"), metrics ? fmtNum(metrics.max_drawdown) : "—"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3"
                >
                  <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                    {label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <TradeChart candles={candles} trades={trades} />

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-medium">
                {t("analyzer.trades")}
                <span className="ml-2 text-[11px] font-normal text-[var(--muted)]">
                  {t("analyzer.journeyHint")}
                </span>
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-[var(--surface-muted)] text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t("analyzer.callPut")}</th>
                      <th className="px-3 py-2 font-medium">{t("analyzer.entry")}</th>
                      <th className="px-3 py-2 font-medium">{t("analyzer.exit")}</th>
                      <th className="px-3 py-2 font-medium">{t("analyzer.pnl")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-[var(--muted)]" colSpan={4}>
                          {t("analyzer.noTrades")}
                        </td>
                      </tr>
                    ) : (
                      trades.map((tr, idx) => {
                        const active = idx === selectedTradeIdx;
                        return (
                          <tr
                            key={`${tr.entry_time}-${idx}`}
                            className={`cursor-pointer border-t border-[var(--border)] ${
                              active ? "bg-[var(--ok-soft)]" : "hover:bg-[var(--hover)]"
                            }`}
                            onClick={() => setSelectedTradeIdx(idx)}
                          >
                            <td className="px-3 py-2 text-[var(--foreground)]">
                              {sideBias(tr.side)}
                            </td>
                            <td className="px-3 py-2 text-[var(--muted)]">
                              {fmtNum(tr.entry_price)}
                              <div className="text-[10px]">
                                {new Date(tr.entry_time).toLocaleString()}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-[var(--muted)]">
                              {fmtNum(tr.exit_price ?? null)}
                              <div className="text-[10px]">
                                {tr.exit_time
                                  ? new Date(tr.exit_time).toLocaleString()
                                  : "—"}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-medium text-[var(--foreground)]">
                              {fmtNum(tr.profit_loss ?? null)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="text-sm font-semibold">{t("analyzer.journey")}</h3>
              {selectedTrade ? (
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted)]">{t("analyzer.callPut")}</dt>
                    <dd className="font-medium">{sideBias(selectedTrade.side)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted)]">{t("analyzer.entry")}</dt>
                    <dd className="text-right">
                      {fmtNum(selectedTrade.entry_price)}
                      <div className="text-[10px] text-[var(--muted)]">
                        {new Date(selectedTrade.entry_time).toLocaleString()}
                      </div>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted)]">{t("analyzer.exit")}</dt>
                    <dd className="text-right">
                      {fmtNum(selectedTrade.exit_price ?? null)}
                      <div className="text-[10px] text-[var(--muted)]">
                        {selectedTrade.exit_time
                          ? new Date(selectedTrade.exit_time).toLocaleString()
                          : "—"}
                      </div>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted)]">{t("analyzer.duration")}</dt>
                    <dd>
                      {holdLabel(selectedTrade.entry_time, selectedTrade.exit_time)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted)]">{t("analyzer.pnl")}</dt>
                    <dd className="font-semibold">
                      {fmtNum(selectedTrade.profit_loss ?? null)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">{t("analyzer.signal")}</dt>
                    <dd className="mt-1 rounded-md bg-[var(--surface-muted)] px-2 py-1.5 text-xs">
                      {selectedTrade.signal || "—"}
                    </dd>
                  </div>
                  {selectedTrade.notes ? (
                    <div>
                      <dt className="text-[var(--muted)]">Notes</dt>
                      <dd className="mt-1 text-xs text-[var(--muted)]">
                        {selectedTrade.notes}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-[var(--muted)]">Playbook</dt>
                    <dd className="mt-1 text-xs font-medium">
                      {strategyDisplayName(strategy)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  {t("analyzer.journeyHint")}
                </p>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-medium">
              {t("analyzer.signals")}
            </div>
            <div className="max-h-56 overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--surface-muted)] text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">{t("analyzer.callPut")}</th>
                    <th className="px-3 py-2 font-medium">Price</th>
                    <th className="px-3 py-2 font-medium">{t("analyzer.reason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-[var(--muted)]" colSpan={4}>
                        {t("analyzer.noSignals")}
                      </td>
                    </tr>
                  ) : (
                    signals.map((sig, idx) => (
                      <tr
                        key={`${sig.timestamp}-${idx}`}
                        className="border-t border-[var(--border)]"
                      >
                        <td className="px-3 py-2 text-[var(--muted)]">
                          {new Date(sig.timestamp).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">{sideBias(sig.side)}</td>
                        <td className="px-3 py-2">{fmtNum(sig.price)}</td>
                        <td className="px-3 py-2 text-[var(--muted)]">{sig.reason}</td>
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
