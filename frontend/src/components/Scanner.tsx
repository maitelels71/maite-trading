"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { fetchStrategies, getApiBase, scanStrategies } from "@/lib/api";
import {
  TIMEFRAMES,
  VENUE_META,
  type ScanHit,
  type ScanResponse,
  type Strategy,
  type Venue,
} from "@/lib/types";

const POLL_MS = 30_000;

function todayNyIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function statusStyle(status: string): string {
  if (status.startsWith("active_") || status.startsWith("signal_")) {
    return "border-emerald-700/60 bg-emerald-950/40 text-emerald-200";
  }
  if (status === "flat_after_trades") {
    return "border-sky-800/60 bg-sky-950/30 text-sky-200";
  }
  if (status === "no_data" || status === "error") {
    return "border-amber-900/50 bg-amber-950/30 text-amber-100";
  }
  return "border-zinc-800 bg-zinc-900/40 text-zinc-300";
}

export function Scanner() {
  const [venue, setVenue] = useState<Venue | "all">("all");
  const [timeframe, setTimeframe] = useState("5m");
  const [date, setDate] = useState(todayNyIso);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [matchesOnly, setMatchesOnly] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await fetchStrategies();
        if (cancelled) return;
        setStrategies(items);
        setSelectedStrategies(items.map((s) => s.name));
      } catch {
        if (!cancelled) {
          setStrategies([
            {
              name: "opening_range_breakout",
              description: "Opening Range Breakout",
              default_parameters: {},
            },
          ]);
          setSelectedStrategies(["opening_range_breakout"]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runScan = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await scanStrategies({
          strategies: selectedStrategies.length ? selectedStrategies : undefined,
          timeframe,
          session_date: date,
          data_provider: venue === "all" ? undefined : venue,
          matches_only: matchesOnly,
        });
        setResult(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Scan failed");
      }
    });
  }, [selectedStrategies, timeframe, date, venue, matchesOnly]);

  useEffect(() => {
    runScan();
  }, [runScan]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => runScan(), POLL_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, runScan]);

  const hits = result?.hits ?? [];
  const matched = useMemo(() => hits.filter((h) => h.matched), [hits]);

  function toggleStrategy(name: string) {
    setSelectedStrategies((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Market Scanner</h2>
          <p className="text-sm text-zinc-500">
            Polls your universe against available strategies (ORB now; more later).
            Refresh every {POLL_MS / 1000}s when live.
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          API <code className="text-zinc-400">{getApiBase()}</code>
        </p>
      </div>

      <section className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-zinc-400">Venue</span>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
              value={venue}
              onChange={(e) => setVenue(e.target.value as Venue | "all")}
            >
              <option value="all">All venues</option>
              <option value="schwab">{VENUE_META.schwab.label}</option>
              <option value="tradeadvocate">{VENUE_META.tradeadvocate.label}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-zinc-400">Timeframe</span>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-zinc-400">Session date (NY)</span>
            <input
              type="date"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={matchesOnly}
                onChange={(e) => setMatchesOnly(e.target.checked)}
              />
              Matches only
            </label>
            <label className="flex items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Strategies</p>
          <div className="flex flex-wrap gap-2">
            {(strategies.length
              ? strategies
              : [{ name: "opening_range_breakout", description: "", default_parameters: {} }]
            ).map((s) => {
              const on = selectedStrategies.includes(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => toggleStrategy(s.name)}
                  className={`rounded-md px-3 py-1.5 text-xs ${
                    on
                      ? "bg-emerald-500 text-zinc-950"
                      : "border border-zinc-700 text-zinc-300"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={runScan}
            className="mt-auto rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {pending ? "Scanning…" : "Scan now"}
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Checked", result ? String(result.total_checked) : "—"],
          ["Matches", result ? String(result.match_count) : "—"],
          [
            "Last scan",
            result ? new Date(result.scanned_at).toLocaleTimeString() : "—",
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"
          >
            <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-zinc-100">{value}</p>
          </div>
        ))}
      </div>

      {matched.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-emerald-400">Active matches</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {matched.map((hit) => (
              <HitCard key={`${hit.symbol}-${hit.strategy}-m`} hit={hit} highlight />
            ))}
          </div>
        </section>
      ) : (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-400">
          No strategy matches yet. Until Schwab / TradeAdvocate data is synced, most
          rows will show <code className="text-zinc-300">no_data</code>.
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-zinc-800">
        <div className="border-b border-zinc-800 px-4 py-3 text-sm text-zinc-400">
          Full scan board
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900/80 text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Venue</th>
                <th className="px-3 py-2 font-medium">Strategy</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {hits.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500" colSpan={5}>
                    Run a scan to populate results.
                  </td>
                </tr>
              ) : (
                hits.map((hit) => (
                  <tr
                    key={`${hit.symbol}-${hit.strategy}`}
                    className="border-t border-zinc-800/80"
                  >
                    <td className="px-3 py-2 text-zinc-100">
                      {hit.symbol}
                      <div className="text-xs text-zinc-500">{hit.name}</div>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{hit.data_provider}</td>
                    <td className="px-3 py-2 text-zinc-300">{hit.strategy}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs ${statusStyle(hit.status)}`}
                      >
                        {hit.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{hit.detail}</td>
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

function HitCard({ hit, highlight }: { hit: ScanHit; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlight
          ? "border-emerald-700/50 bg-emerald-950/20"
          : "border-zinc-800 bg-zinc-900/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-semibold text-zinc-100">{hit.symbol}</p>
        <span className={`rounded px-2 py-0.5 text-xs ${statusStyle(hit.status)}`}>
          {hit.status}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {hit.strategy} · {hit.data_provider}
      </p>
      <p className="mt-2 text-sm text-zinc-300">{hit.detail}</p>
    </div>
  );
}
