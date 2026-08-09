"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { scanStrategies } from "@/lib/api";
import { useLocale } from "@/components/LocaleProvider";
import { STRATEGY_PLAYBOOKS, type StrategyPlaybook } from "@/lib/playbooks";
import {
  TIMEFRAMES,
  VENUE_META,
  type ScanHit,
  type ScanResponse,
  type Venue,
} from "@/lib/types";

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
  if (status === "no_data" || status === "error") {
    return "border-amber-200 bg-[var(--warn-soft)] text-[var(--warn)]";
  }
  return "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]";
}

export function StrategiesDesk() {
  const { t } = useLocale();
  const [selectedId, setSelectedId] = useState("sbc");
  const [venue, setVenue] = useState<Venue | "all">("all");
  const [timeframe, setTimeframe] = useState("5m");
  const [date, setDate] = useState(todayNyIso);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});

  const playbook = useMemo(
    () =>
      STRATEGY_PLAYBOOKS.find((p) => p.id === selectedId) ??
      STRATEGY_PLAYBOOKS[0],
    [selectedId],
  );

  useEffect(() => {
    setScan(null);
    setError(null);
    setCheckedSteps({});
  }, [selectedId]);

  const runScan = useCallback(() => {
    if (!playbook?.strategyKey) {
      setError(t("strategies.draftError"));
      setScan(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await scanStrategies({
          strategies: [playbook.strategyKey!],
          timeframe,
          session_date: date,
          data_provider: venue === "all" ? undefined : venue,
          matches_only: false,
        });
        setScan(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Scan failed");
        setScan(null);
      }
    });
  }, [playbook, timeframe, date, venue, t]);

  const matches = useMemo(
    () => (scan?.hits ?? []).filter((h) => h.matched),
    [scan],
  );
  const board = scan?.hits ?? [];

  function toggleStep(id: string) {
    setCheckedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (!playbook) return null;

  const field =
    "w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-xs";

  return (
    <div className="mx-auto max-w-7xl space-y-3 px-4 py-4 sm:px-6">
      {/* Compact top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0">
          <h2 className="text-lg font-semibold leading-tight">
            {t("strategies.title")}
          </h2>
          <p className="text-[11px] text-[var(--muted)]">
            {t("strategies.howToUse")}
          </p>
        </div>
      </div>

      {/* Strategy picker — horizontal chips */}
      <div className="flex flex-wrap gap-1.5">
        {STRATEGY_PLAYBOOKS.map((p) => {
          const active = p.id === playbook.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                active
                  ? "bg-[var(--accent)] text-[var(--on-accent)]"
                  : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--hover)]"
              }`}
            >
              <span className="font-semibold">{p.shortName}</span>
              <span
                className={`ml-1.5 ${active ? "opacity-85" : "text-[var(--muted)]"}`}
              >
                {p.strategyKey ? "· scan" : "· draft"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Live scan ON TOP — per selected strategy */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="mr-auto min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">
                {t("strategies.liveScanTitle")}
              </h3>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  playbook.strategyKey
                    ? "bg-[var(--ok-soft)] text-[var(--ok)]"
                    : "bg-[var(--warn-soft)] text-[var(--warn)]"
                }`}
                title={
                  playbook.strategyKey
                    ? t("strategies.scanReadyHint")
                    : t("strategies.draftHint")
                }
              >
                {playbook.strategyKey
                  ? t("strategies.scanReady")
                  : t("strategies.draft")}
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted)]">
              {playbook.shortName} · {t("strategies.liveScanHint")}
            </p>
          </div>
          <label className="space-y-0.5 text-[11px] text-[var(--muted)]">
            {t("strategies.venue")}
            <select
              className={field}
              value={venue}
              onChange={(e) => setVenue(e.target.value as Venue | "all")}
            >
              <option value="all">{t("strategies.allVenues")}</option>
              <option value="schwab">{VENUE_META.schwab.label}</option>
              <option value="tradeadvocate">
                {VENUE_META.tradeadvocate.label}
              </option>
            </select>
          </label>
          <label className="space-y-0.5 text-[11px] text-[var(--muted)]">
            {t("strategies.timeframe")}
            <select
              className={field}
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
          <label className="space-y-0.5 text-[11px] text-[var(--muted)]">
            {t("strategies.sessionDate")}
            <input
              type="date"
              className={field}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={pending || !playbook.strategyKey}
            onClick={runScan}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {pending ? t("strategies.scanning") : t("strategies.scanNow")}
          </button>
        </div>

        {error ? (
          <div className="mt-2 rounded-md border border-red-200 bg-[var(--danger-soft)] px-3 py-1.5 text-xs text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        {scan ? (
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            {scan.match_count} matches · {scan.total_checked} checked ·{" "}
            {new Date(scan.scanned_at).toLocaleTimeString()}
          </p>
        ) : null}

        {matches.length > 0 ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((hit) => (
              <HitCard key={`${hit.symbol}-${hit.strategy}`} hit={hit} />
            ))}
          </div>
        ) : scan ? (
          <p className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--muted)]">
            No matches right now. Sync candles if many rows show{" "}
            <code>no_data</code>.
          </p>
        ) : null}

        {board.length > 0 ? (
          <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-[var(--surface-muted)] text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Symbol</th>
                  <th className="px-2 py-1.5 font-medium">Venue</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {board.map((hit) => (
                  <tr
                    key={`${hit.symbol}-${hit.strategy}-row`}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-2 py-1 font-medium">{hit.symbol}</td>
                    <td className="px-2 py-1 text-[var(--muted)]">
                      {hit.data_provider}
                    </td>
                    <td className="px-2 py-1">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${statusStyle(hit.status)}`}
                      >
                        {hit.status}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-[var(--muted)]">
                      {hit.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* Compact strategy header */}
      <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{playbook.name}</h3>
            <p className="text-[12px] leading-snug text-[var(--muted)]">
              {playbook.summary}
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {playbook.markets} · {playbook.sessionWindow}
            </p>
          </div>
        </div>
      </header>

      {/* Dense playbook — more visible at once */}
      <PlaybookRules
        playbook={playbook}
        checked={checkedSteps}
        onToggle={toggleStep}
      />
    </div>
  );
}

function PlaybookRules({
  playbook,
  checked,
  onToggle,
}: {
  playbook: StrategyPlaybook;
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      <RuleBlock
        title="Entry"
        items={playbook.entrySteps}
        checked={checked}
        onToggle={onToggle}
      />
      <RuleBlock
        title="Exits"
        items={playbook.exitSteps}
        checked={checked}
        onToggle={onToggle}
      />

      <div className="space-y-2 xl:col-span-1 lg:col-span-2 xl:col-auto">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-3 py-1.5">
              <h4 className="text-xs font-semibold">Risk</h4>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {playbook.riskNotes.map((n) => (
                <li
                  key={n}
                  className="px-3 py-1.5 text-[12px] leading-snug text-[var(--muted)]"
                >
                  {n}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-3 py-1.5">
              <h4 className="text-xs font-semibold">Invalidation</h4>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {playbook.invalidation.map((n) => (
                <li
                  key={n}
                  className="px-3 py-1.5 text-[12px] leading-snug text-[var(--muted)]"
                >
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-2 lg:col-span-2 xl:col-span-3">
        <h4 className="text-xs font-semibold text-[var(--muted)]">
          By timeframe
        </h4>
        <div className="grid gap-2 md:grid-cols-3">
          {playbook.byTimeframe.map((tf) => (
            <div
              key={tf.timeframe}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            >
              <div className="border-b border-[var(--border)] px-3 py-1.5">
                <p className="text-xs font-semibold">{tf.timeframe}</p>
                <p className="text-[11px] text-[var(--muted)]">{tf.focus}</p>
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {tf.steps.map((step) => (
                  <li key={step.id}>
                    <label className="flex cursor-pointer gap-2 px-3 py-1.5 text-[12px] hover:bg-[var(--surface-muted)]">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={Boolean(checked[step.id])}
                        onChange={() => onToggle(step.id)}
                      />
                      <span>
                        <span className="block leading-snug">{step.label}</span>
                        {step.detail ? (
                          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
                            {step.detail}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RuleBlock({
  title,
  items,
  checked,
  onToggle,
}: {
  title: string;
  items: { id: string; label: string; detail?: string }[];
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const done = items.filter((i) => checked[i.id]).length;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
        <h4 className="text-xs font-semibold">{title}</h4>
        <span className="text-[11px] tabular-nums text-[var(--muted)]">
          {done}/{items.length}
        </span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {items.map((step, idx) => {
          const on = Boolean(checked[step.id]);
          return (
            <li key={step.id}>
              <label className="flex cursor-pointer gap-2 px-3 py-1.5 text-[12px] hover:bg-[var(--surface-muted)]">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={on}
                  onChange={() => onToggle(step.id)}
                />
                <span>
                  <span
                    className={`block leading-snug ${
                      on
                        ? "text-[var(--muted)] line-through"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    {idx + 1}. {step.label}
                  </span>
                  {step.detail ? (
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
                      {step.detail}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HitCard({ hit }: { hit: ScanHit }) {
  return (
    <div className="rounded-lg border border-emerald-200/40 bg-[var(--ok-soft)] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{hit.symbol}</p>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] ${statusStyle(hit.status)}`}
        >
          {hit.status}
        </span>
      </div>
      <p className="text-[11px] text-[var(--muted)]">
        {hit.name} · {hit.data_provider}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-[var(--muted)]">
        {hit.detail}
      </p>
    </div>
  );
}
