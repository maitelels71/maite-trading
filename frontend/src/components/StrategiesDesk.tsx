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
    () => STRATEGY_PLAYBOOKS.find((p) => p.id === selectedId) ?? STRATEGY_PLAYBOOKS[0],
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h2 className="text-xl font-semibold text-[var(--foreground)]">
          {t("strategies.title")}
        </h2>
        <p className="text-sm text-[var(--muted)]">{t("strategies.subtitle")}</p>
        <p className="mt-2 text-sm font-medium text-[var(--brand)]">
          {t("strategies.liveScanTitle")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-1">
          {STRATEGY_PLAYBOOKS.map((p) => {
            const active = p.id === playbook.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                  active
                    ? "bg-[var(--accent)] text-[var(--on-accent)]"
                    : "text-[var(--muted)] hover:bg-[var(--hover)]"
                }`}
              >
                <span className="block font-medium">{p.shortName}</span>
                <span
                  className={`block text-xs ${active ? "text-[var(--on-accent)]/85" : "text-[var(--muted)]"}`}
                >
                  {p.name}
                </span>
              </button>
            );
          })}
        </aside>

        <div className="space-y-6">
          <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{playbook.name}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{playbook.summary}</p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {playbook.markets} · {playbook.sessionWindow}
                </p>
                {!playbook.strategyKey ? (
                  <p className="mt-2 text-xs text-[var(--warn)]">
                    {t("strategies.draftHint")}
                  </p>
                ) : null}
              </div>
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${
                  playbook.strategyKey
                    ? "bg-[var(--ok-soft)] text-[var(--ok)]"
                    : "bg-[var(--warn-soft)] text-[var(--warn)]"
                }`}
              >
                {playbook.strategyKey
                  ? t("strategies.scanReady")
                  : t("strategies.draft")}
              </span>
            </div>
          </header>

          <PlaybookRules playbook={playbook} checked={checkedSteps} onToggle={toggleStep} />

          <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h4 className="font-medium text-[var(--foreground)]">
                  {t("strategies.liveScanTitle")}
                </h4>
                <p className="text-xs text-[var(--muted)]">
                  {t("strategies.liveScanHint")}
                </p>
              </div>
              <button
                type="button"
                disabled={pending || !playbook.strategyKey}
                onClick={runScan}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {pending ? t("strategies.scanning") : t("strategies.scanNow")}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">{t("strategies.venue")}</span>
                <select
                  className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
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
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">{t("strategies.timeframe")}</span>
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
                <span className="text-[var(--muted)]">{t("strategies.sessionDate")}</span>
                <input
                  type="date"
                  className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>

            {error ? (
              <div className="rounded-md border border-red-200 bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </div>
            ) : null}

            {scan ? (
              <p className="text-xs text-[var(--muted)]">
                {scan.match_count} matches · {scan.total_checked} checked ·{" "}
                {new Date(scan.scanned_at).toLocaleTimeString()}
              </p>
            ) : null}

            {matches.length > 0 ? (
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-[var(--accent)]">
                  Meeting strategy now
                </h5>
                <div className="grid gap-2 md:grid-cols-2">
                  {matches.map((hit) => (
                    <HitCard key={`${hit.symbol}-${hit.strategy}`} hit={hit} />
                  ))}
                </div>
              </div>
            ) : scan ? (
              <p className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--muted)]">
                No matches right now. Sync candles if many rows show{" "}
                <code>no_data</code>.
              </p>
            ) : null}

            {board.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[var(--surface-muted)] text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Symbol</th>
                      <th className="px-3 py-2 font-medium">Venue</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.map((hit) => (
                      <tr
                        key={`${hit.symbol}-${hit.strategy}-row`}
                        className="border-t border-[var(--border)]"
                      >
                        <td className="px-3 py-2 font-medium">{hit.symbol}</td>
                        <td className="px-3 py-2 text-[var(--muted)]">
                          {hit.data_provider}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs ${statusStyle(hit.status)}`}
                          >
                            {hit.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[var(--muted)]">{hit.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      </div>
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
    <div className="grid gap-4 lg:grid-cols-2">
      <RuleBlock
        title="Entry steps"
        items={playbook.entrySteps}
        checked={checked}
        onToggle={onToggle}
      />
      <RuleBlock
        title="Exits & management"
        items={playbook.exitSteps}
        checked={checked}
        onToggle={onToggle}
      />

      <div className="space-y-3 lg:col-span-2">
        <h4 className="text-sm font-medium text-[var(--foreground)]">
          By timeframe
        </h4>
        <div className="grid gap-3 md:grid-cols-3">
          {playbook.byTimeframe.map((tf) => (
            <div
              key={tf.timeframe}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <p className="text-sm font-medium">{tf.timeframe}</p>
              <p className="text-xs text-[var(--muted)]">{tf.focus}</p>
              <ul className="mt-2 space-y-2">
                {tf.steps.map((step) => (
                  <li key={step.id}>
                    <label className="flex cursor-pointer gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={Boolean(checked[step.id])}
                        onChange={() => onToggle(step.id)}
                      />
                      <span>
                        <span className="block">{step.label}</span>
                        {step.detail ? (
                          <span className="text-xs text-[var(--muted)]">
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

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h4 className="text-sm font-medium">Risk notes</h4>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-[var(--muted)]">
          {playbook.riskNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h4 className="text-sm font-medium">Invalidation</h4>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-[var(--muted)]">
          {playbook.invalidation.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
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
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h4 className="text-sm font-medium">{title}</h4>
      <ul className="mt-2 space-y-2">
        {items.map((step, idx) => (
          <li key={step.id}>
            <label className="flex cursor-pointer gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(checked[step.id])}
                onChange={() => onToggle(step.id)}
              />
              <span>
                <span className="font-medium text-[var(--foreground)]">
                  {idx + 1}. {step.label}
                </span>
                {step.detail ? (
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    {step.detail}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HitCard({ hit }: { hit: ScanHit }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-[var(--ok-soft)] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-semibold">{hit.symbol}</p>
        <span className={`rounded px-2 py-0.5 text-xs ${statusStyle(hit.status)}`}>
          {hit.status}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {hit.name} · {hit.data_provider}
      </p>
      <p className="mt-2 text-sm text-[var(--muted)]">{hit.detail}</p>
    </div>
  );
}
