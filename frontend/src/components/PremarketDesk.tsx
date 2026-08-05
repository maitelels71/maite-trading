"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import { getApiBase, getPremarketResult, startPremarketEvaluate } from "@/lib/api";
import {
  VENUE_META,
  type PremarketResult,
  type ScanHit,
  type Venue,
} from "@/lib/types";
import { PremarketAlarmPanel } from "@/components/PremarketAlarmPanel";

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
  if (status === "no_data" || status === "error") {
    return "border-amber-900/50 bg-amber-950/30 text-amber-100";
  }
  return "border-zinc-800 bg-zinc-900/40 text-zinc-300";
}

export function PremarketDesk() {
  const [venue, setVenue] = useState<Venue | "all">("all");
  const [timeframe, setTimeframe] = useState("5m");
  const [date, setDate] = useState(todayNyIso);
  const [result, setResult] = useState<PremarketResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadResult = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await getPremarketResult();
        setResult(res);
        setStatus(`Loaded run ${res.run_id.slice(0, 8)}…`);
      } catch (err) {
        setResult(null);
        setStatus(null);
        setError(err instanceof Error ? err.message : "No saved Premarket result");
      }
    });
  }, []);

  useEffect(() => {
    loadResult();
  }, [loadResult]);

  function onStart() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await startPremarketEvaluate({
          session_date: date,
          timeframe,
          data_provider: venue === "all" ? undefined : venue,
        });
        setResult(res);
        setStatus(
          `Premarket complete · ${res.summary.match_count} matches / ${res.summary.total_checked} checked`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Premarket evaluate failed");
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Premarket</h2>
          <p className="text-sm text-zinc-500">
            Pre-open desk: run all strategies, group by strategy, keep a{" "}
            <code className="text-zinc-400">runId</code> you can reload.
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          API <code className="text-zinc-400">{getApiBase()}</code>
        </p>
      </div>

      <section className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-3">
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
              {["1m", "5m", "15m"].map((tf) => (
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
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
          <button
            type="button"
            disabled={pending}
            onClick={onStart}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {pending ? "Running…" : "Start evaluate"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={loadResult}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-60"
          >
            Load last result
          </button>
        </div>
      </section>

      <PremarketAlarmPanel
        sessionDate={date}
        timeframe={timeframe}
        dataProvider={venue === "all" ? undefined : venue}
      />

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

      {result ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Run", result.run_id.slice(0, 8)],
              ["Checked", String(result.summary.total_checked)],
              ["Matches", String(result.summary.match_count)],
              ["Finished", new Date(result.finished_at).toLocaleTimeString()],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"
              >
                <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
                <p className="mt-1 text-lg font-semibold text-zinc-100">{value}</p>
              </div>
            ))}
          </div>

          {result.best_results.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-emerald-400">Best results</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {result.best_results.map((hit) => (
                  <HitRow key={`best-${hit.symbol}-${hit.strategy}`} hit={hit} />
                ))}
              </div>
            </section>
          ) : (
            <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-400">
              No matches this run. Sync candles (Schwab / TradeAdvocate) when auth is ready —
              until then many rows stay <code className="text-zinc-300">no_data</code>.
            </p>
          )}

          <section className="space-y-4">
            <h3 className="text-sm font-medium text-zinc-300">By strategy</h3>
            {result.strategy_groups.map((group) => (
              <div
                key={group.strategy}
                className="overflow-hidden rounded-xl border border-zinc-800"
              >
                <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
                  <p className="font-medium text-zinc-100">{group.strategy}</p>
                  <p className="text-xs text-zinc-500">
                    {group.match_count} / {group.total} matched
                  </p>
                </div>
                <div className="divide-y divide-zinc-800/80">
                  {group.tickers.map((hit) => (
                    <div key={`${group.strategy}-${hit.symbol}`} className="px-4 py-3">
                      <HitRow hit={hit} compact />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}

function HitRow({ hit, compact }: { hit: ScanHit; compact?: boolean }) {
  return (
    <div className={compact ? "" : "rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-zinc-100">
            {hit.symbol}{" "}
            <span className="text-xs font-normal text-zinc-500">{hit.name}</span>
          </p>
          {!compact ? (
            <p className="text-xs text-zinc-500">
              {hit.strategy} · {hit.data_provider}
            </p>
          ) : null}
        </div>
        <span className={`rounded px-2 py-0.5 text-xs ${statusStyle(hit.status)}`}>
          {hit.status}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-400">{hit.detail}</p>
    </div>
  );
}
