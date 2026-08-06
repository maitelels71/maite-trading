"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { AlarmWatchesPanel } from "@/components/AlarmWatchesPanel";
import {
  fetchStrategies,
  getApiBase,
  getPremarketResult,
  scanStrategies,
  startPremarketEvaluate,
} from "@/lib/api";
import {
  TIMEFRAMES,
  VENUE_META,
  type PremarketResult,
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
    return "border-emerald-200 bg-[var(--ok-soft)] text-[var(--ok)]";
  }
  if (status === "flat_after_trades") {
    return "border-sky-200 bg-[var(--info-soft)] text-[var(--info)]";
  }
  if (status === "no_data" || status === "error") {
    return "border-amber-200 bg-[var(--warn-soft)] text-[var(--warn)]";
  }
  return "border-[var(--border)] bg-[var(--surface)] text-stone-700";
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
  const [savedRun, setSavedRun] = useState<PremarketResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, startSave] = useTransition();

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

  const loadSavedRun = useCallback(() => {
    setError(null);
    startSave(async () => {
      try {
        const res = await getPremarketResult();
        setSavedRun(res);
        setStatus(`Loaded saved run ${res.run_id.slice(0, 8)}…`);
      } catch (err) {
        setSavedRun(null);
        setStatus(null);
        setError(err instanceof Error ? err.message : "No saved run yet");
      }
    });
  }, []);

  function saveRun() {
    setError(null);
    setStatus(null);
    startSave(async () => {
      try {
        const res = await startPremarketEvaluate({
          session_date: date,
          timeframe,
          data_provider: venue === "all" ? undefined : venue,
          strategies: selectedStrategies.length ? selectedStrategies : undefined,
        });
        setSavedRun(res);
        setStatus(
          `Run saved · ${res.summary.match_count} matches / ${res.summary.total_checked} checked`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save run failed");
      }
    });
  }

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
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Market Scanner</h2>
          <p className="text-sm text-[var(--muted)]">
            Live board of your universe vs strategies. Optionally save a snapshot run
            and watch symbols until they match.
          </p>
        </div>
        <p className="text-xs text-[var(--muted)]">
          API <code className="text-[var(--muted)]">{getApiBase()}</code>
        </p>
      </div>

      <section className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Venue</span>
            <select
              className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
              value={venue}
              onChange={(e) => setVenue(e.target.value as Venue | "all")}
            >
              <option value="all">All venues</option>
              <option value="schwab">{VENUE_META.schwab.label}</option>
              <option value="tradeadvocate">{VENUE_META.tradeadvocate.label}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Timeframe</span>
            <select
              className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
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
            <span className="text-[var(--muted)]">Session date (NY)</span>
            <input
              type="date"
              className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex items-center gap-2 text-stone-700">
              <input
                type="checkbox"
                checked={matchesOnly}
                onChange={(e) => setMatchesOnly(e.target.checked)}
              />
              Matches only
            </label>
            <label className="flex items-center gap-2 text-stone-700">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh ({POLL_MS / 1000}s)
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Strategies</p>
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
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--border-strong)] text-stone-700"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
          <div className="mt-auto flex flex-col gap-2 sm:flex-row lg:flex-col">
            <button
              type="button"
              disabled={pending}
              onClick={runScan}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {pending ? "Scanning…" : "Scan now"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={saveRun}
              className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm text-stone-800 hover:border-stone-400 disabled:opacity-60"
              title="Persist this scan snapshot with a run id you can reload later"
            >
              {saving ? "Saving…" : "Save run"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={loadSavedRun}
              className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm text-stone-800 hover:border-stone-400 disabled:opacity-60"
              title="Reload the last saved run snapshot"
            >
              Load last run
            </button>
          </div>
        </div>
      </section>

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
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          >
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
            <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">{value}</p>
          </div>
        ))}
      </div>

      {savedRun ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-stone-700">
          <p>
            Saved run{" "}
            <code className="text-[var(--foreground)]">{savedRun.run_id.slice(0, 8)}</code>
            {" · "}
            {savedRun.summary.match_count} matches / {savedRun.summary.total_checked}{" "}
            checked · {new Date(savedRun.finished_at).toLocaleString()}
          </p>
        </section>
      ) : null}

      <AlarmWatchesPanel
        sessionDate={date}
        timeframe={timeframe}
        dataProvider={venue === "all" ? undefined : venue}
      />

      {matched.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-[var(--accent)]">Active matches</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {matched.map((hit) => (
              <HitCard key={`${hit.symbol}-${hit.strategy}-m`} hit={hit} highlight />
            ))}
          </div>
        </section>
      ) : (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
          No strategy matches yet. Until Schwab / TradeAdvocate data is synced, most
          rows will show <code className="text-stone-700">no_data</code>.
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-[var(--border)]">
        <div className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          Full scan board
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--surface-muted)] text-[var(--muted)]">
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
                  <td className="px-3 py-4 text-[var(--muted)]" colSpan={5}>
                    Run a scan to populate results.
                  </td>
                </tr>
              ) : (
                hits.map((hit) => (
                  <tr
                    key={`${hit.symbol}-${hit.strategy}`}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-3 py-2 text-[var(--foreground)]">
                      {hit.symbol}
                      <div className="text-xs text-[var(--muted)]">{hit.name}</div>
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">{hit.data_provider}</td>
                    <td className="px-3 py-2 text-stone-700">{hit.strategy}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs ${statusStyle(hit.status)}`}
                      >
                        {hit.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">{hit.detail}</td>
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
          ? "border-emerald-200 bg-[var(--ok-soft)]"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-semibold text-[var(--foreground)]">{hit.symbol}</p>
        <span className={`rounded px-2 py-0.5 text-xs ${statusStyle(hit.status)}`}>
          {hit.status}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {hit.strategy} · {hit.data_provider}
      </p>
      <p className="mt-2 text-sm text-stone-700">{hit.detail}</p>
    </div>
  );
}
