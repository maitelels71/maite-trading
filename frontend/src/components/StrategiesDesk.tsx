"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { fetchInstruments, scanStrategies, syncMarketData } from "@/lib/api";
import { useLocale } from "@/components/LocaleProvider";
import {
  playbookByStrategyKey,
  playbooksForVenue,
  scannableStrategyKeys,
  type StrategyPlaybook,
} from "@/lib/playbooks";
import {
  TIMEFRAMES,
  VENUE_META,
  type Instrument,
  type ScanHit,
  type ScanResponse,
  type Venue,
} from "@/lib/types";

const AUTO_LIVE_MS = 150_000; // 2.5 minutes
const AUTO_LIVE_KEY = "maite.strategies.autoLive";
const DESK_TOP_N = 5;
const DESK_SYNC_TFS = ["1h", "1d"] as const;
const DESK_LOOKBACK_DAYS = 60;
const DESK_STRATEGY_CHUNK = 3;

function nyParts(d = new Date()): { y: number; m: number; day: number; hh: number; mm: number; weekday: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    day: Number(parts.day),
    hh: Number(parts.hour),
    mm: Number(parts.minute),
    weekday: parts.weekday ?? "",
  };
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function previousWeekdayIso(isoDate: string): string {
  let d = addDaysIso(isoDate, -1);
  // JS: 0=Sun … 6=Sat from UTC noon of that calendar day
  for (let i = 0; i < 7; i += 1) {
    const [y, m, day] = d.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, day, 12)).getUTCDay();
    if (wd !== 0 && wd !== 6) return d;
    d = addDaysIso(d, -1);
  }
  return d;
}

/** Last/current NY cash session — mirrors backend resolve_operative_session_date. */
function operativeSessionNyIso(now = new Date()): string {
  const p = nyParts(now);
  const today = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const [y, m, day] = today.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day, 12)).getUTCDay();
  if (wd === 0 || wd === 6) return previousWeekdayIso(today);
  if (p.hh < 9 || (p.hh === 9 && p.mm < 30)) return previousWeekdayIso(today);
  return today;
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

function readAutoLive(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTO_LIVE_KEY) === "1";
}

type StrategiesDeskProps = {
  venue: Venue;
};

export function StrategiesDesk({ venue }: StrategiesDeskProps) {
  const { t } = useLocale();
  const books = useMemo(() => playbooksForVenue(venue), [venue]);
  const [selectedId, setSelectedId] = useState(books[0]?.id ?? "");
  const [timeframe, setTimeframe] = useState("15m");
  const [sessionDate, setSessionDate] = useState(operativeSessionNyIso);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [deskTop, setDeskTop] = useState<ScanHit[]>([]);
  const [deskNote, setDeskNote] = useState<string | null>(null);
  const [deskError, setDeskError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deskPending, startDeskTransition] = useTransition();
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [autoLive, setAutoLive] = useState(false);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const runGen = useRef(0);
  const deskGen = useRef(0);

  useEffect(() => {
    setAutoLive(readAutoLive());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchInstruments()
      .then((rows) => {
        if (!cancelled) setInstruments(rows);
      })
      .catch(() => {
        if (!cancelled) setInstruments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!books.some((p) => p.id === selectedId)) {
      setSelectedId(books[0]?.id ?? "");
    }
  }, [books, selectedId]);

  const playbook = useMemo(
    () => books.find((p) => p.id === selectedId) ?? books[0],
    [books, selectedId],
  );

  const tfLocked = Boolean(playbook?.preferredTimeframe);
  const effectiveTf = playbook?.preferredTimeframe ?? timeframe;
  const syncTfs = useMemo(() => {
    if (playbook?.syncTimeframes?.length) return playbook.syncTimeframes;
    if (playbook?.preferredTimeframe) return [playbook.preferredTimeframe];
    return [effectiveTf];
  }, [playbook?.syncTimeframes, playbook?.preferredTimeframe, effectiveTf]);
  const lookbackDays = playbook?.syncLookbackDays ?? 7;

  const venueInstruments = useMemo(
    () => instruments.filter((i) => i.data_provider === venue),
    [instruments, venue],
  );

  const deskStrategyKeys = useMemo(
    () => scannableStrategyKeys(venue),
    [venue],
  );

  const universe = useMemo(() => {
    if (venueInstruments.length > 0) return venueInstruments;
    return [
      { symbol: "SPY", market_type: "etf", data_provider: "schwab" },
      { symbol: "QQQ", market_type: "etf", data_provider: "schwab" },
      { symbol: "AAPL", market_type: "stock", data_provider: "schwab" },
      { symbol: "AMZN", market_type: "stock", data_provider: "schwab" },
      { symbol: "TSLA", market_type: "stock", data_provider: "schwab" },
    ] as Instrument[];
  }, [venueInstruments]);

  useEffect(() => {
    setScan(null);
    setError(null);
    setSyncNote(null);
    setCheckedSteps({});
    if (playbook?.preferredTimeframe) {
      setTimeframe(playbook.preferredTimeframe);
    }
  }, [selectedId, venue, playbook?.preferredTimeframe]);

  async function syncUniverse(tfs: string[], lookback: number, gen: number, genRef: { current: number }, endDay: string) {
    const startDay = addDaysIso(endDay, -lookback);
    const start = `${startDay}T00:00:00.000Z`;
    const end = `${endDay}T23:59:59.999Z`;
    let syncedBars = 0;
    let syncErrors = 0;
    for (const inst of universe) {
      if (inst.data_provider && inst.data_provider !== venue) continue;
      for (const tf of tfs) {
        try {
          const res = await syncMarketData({
            ticker: inst.symbol,
            timeframe: tf,
            start,
            end,
            market_type: inst.market_type,
            force_refresh: true,
          });
          syncedBars += res.candles_count;
        } catch {
          syncErrors += 1;
        }
      }
    }
    if (gen !== genRef.current) return null;
    return { syncedBars, syncErrors };
  }

  const syncAndScan = useCallback(async () => {
    if (!playbook?.strategyKey) {
      setError(t("strategies.draftError"));
      setScan(null);
      return;
    }
    const day = operativeSessionNyIso();
    setSessionDate(day);
    const gen = ++runGen.current;
    setError(null);
    setSyncNote(t("strategies.syncing"));

    const synced = await syncUniverse(syncTfs, lookbackDays, gen, runGen, day);
    if (!synced) return;

    setSyncNote(
      t("strategies.syncDone")
        .replace("{bars}", String(synced.syncedBars))
        .replace("{symbols}", String(universe.length))
        .replace("{errors}", String(synced.syncErrors)),
    );

    try {
      const res = await scanStrategies({
        strategies: [playbook.strategyKey],
        timeframe: effectiveTf,
        session_date: day,
        data_provider: venue,
        matches_only: false,
      });
      if (gen !== runGen.current) return;
      setScan(res);
      if (res.session_date) setSessionDate(res.session_date);
    } catch (err) {
      if (gen !== runGen.current) return;
      setError(err instanceof Error ? err.message : "Scan failed");
      setScan(null);
    }
  }, [
    playbook,
    lookbackDays,
    syncTfs,
    universe,
    venue,
    effectiveTf,
    t,
  ]);

  const runDeskTop5 = useCallback(async () => {
    if (deskStrategyKeys.length === 0) {
      setDeskError(t("strategies.draftError"));
      return;
    }
    const day = operativeSessionNyIso();
    setSessionDate(day);
    const gen = ++deskGen.current;
    setDeskError(null);
    setDeskNote(t("strategies.syncing"));

    const synced = await syncUniverse(
      [...DESK_SYNC_TFS],
      DESK_LOOKBACK_DAYS,
      gen,
      deskGen,
      day,
    );
    if (!synced) return;

    setDeskNote(
      t("strategies.syncDone")
        .replace("{bars}", String(synced.syncedBars))
        .replace("{symbols}", String(universe.length))
        .replace("{errors}", String(synced.syncErrors)),
    );

    try {
      const picked: ScanHit[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < deskStrategyKeys.length; i += DESK_STRATEGY_CHUNK) {
        if (gen !== deskGen.current) return;
        if (seen.size >= DESK_TOP_N) break;
        const chunk = deskStrategyKeys.slice(i, i + DESK_STRATEGY_CHUNK);
        const res = await scanStrategies({
          strategies: chunk,
          timeframe: "1h",
          session_date: day,
          data_provider: venue,
          matches_only: true,
          top_n: DESK_TOP_N,
        });
        for (const hit of res.hits) {
          if (!hit.matched || seen.has(hit.symbol)) continue;
          seen.add(hit.symbol);
          picked.push(hit);
          if (picked.length >= DESK_TOP_N) break;
        }
      }
      if (gen !== deskGen.current) return;
      setDeskTop(picked.slice(0, DESK_TOP_N));
      setDeskNote(
        `${picked.length} top hits · ${new Date().toLocaleTimeString()}`,
      );
    } catch (err) {
      if (gen !== deskGen.current) return;
      setDeskError(err instanceof Error ? err.message : "Desk scan failed");
      setDeskTop([]);
    }
  }, [deskStrategyKeys, universe, venue, t]);

  const runSyncAndScan = useCallback(() => {
    startTransition(async () => {
      await syncAndScan();
    });
  }, [syncAndScan]);

  const runDeskScan = useCallback(() => {
    startDeskTransition(async () => {
      await runDeskTop5();
    });
  }, [runDeskTop5]);

  const runScanOnly = useCallback(() => {
    if (!playbook?.strategyKey) {
      setError(t("strategies.draftError"));
      setScan(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const day = operativeSessionNyIso();
      setSessionDate(day);
      try {
        const res = await scanStrategies({
          strategies: [playbook.strategyKey!],
          timeframe: effectiveTf,
          session_date: day,
          data_provider: venue,
          matches_only: false,
        });
        setScan(res);
        if (res.session_date) setSessionDate(res.session_date);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Scan failed");
        setScan(null);
      }
    });
  }, [playbook, effectiveTf, venue, t]);

  function toggleAutoLive() {
    setAutoLive((prev) => {
      const next = !prev;
      window.localStorage.setItem(AUTO_LIVE_KEY, next ? "1" : "0");
      return next;
    });
  }

  useEffect(() => {
    if (!autoLive || !playbook?.strategyKey) return;
    const kickoff = window.setTimeout(() => {
      void syncAndScan();
    }, 400);
    const id = window.setInterval(() => {
      void syncAndScan();
    }, AUTO_LIVE_MS);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(id);
    };
  }, [autoLive, playbook?.strategyKey, playbook?.id, venue, syncAndScan]);

  const matches = useMemo(
    () => (scan?.hits ?? []).filter((h) => h.matched),
    [scan],
  );
  const board = scan?.hits ?? [];

  function toggleStep(id: string) {
    setCheckedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const titleKey =
    venue === "schwab" ? "strategies.titleEtf" : "strategies.titleFutures";
  const dataViaKey =
    venue === "schwab" ? "strategies.dataViaSchwab" : "strategies.dataViaTa";

  const field =
    "w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-xs";

  if (!playbook) {
    return (
      <div className="mx-auto max-w-7xl space-y-3 px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold leading-tight">{t(titleKey)}</h2>
        <p className="text-[11px] text-[var(--muted)]">{t(dataViaKey)}</p>
        <p className="text-sm text-[var(--muted)]">{t("strategies.emptyList")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-3 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{t(titleKey)}</h2>
          <p className="text-[11px] text-[var(--muted)]">
            {t(dataViaKey)} · {t("strategies.howToUse")}
          </p>
        </div>
        <span className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-medium text-[var(--muted)]">
          {VENUE_META[venue].label}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[16rem] flex-1 space-y-0.5 text-[11px] text-[var(--muted)]">
          {t("strategies.playbook")}
          <select
            className={field}
            value={playbook.id}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <optgroup label="BB · E01–E04">
              {books
                .filter((p) => p.id.startsWith("e"))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.shortName} — {p.name.replace(/^E\d+\s*—\s*/, "")}
                    {p.strategyKey ? "" : " (draft)"}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Creando Riquezas · CR01–CR11">
              {books
                .filter((p) => p.id.startsWith("cr"))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.shortName} — {p.name.replace(/^CR\d+\s*—\s*/, "")}
                    {p.strategyKey ? "" : " (draft)"}
                  </option>
                ))}
            </optgroup>
            {books
              .filter((p) => !p.id.startsWith("e") && !p.id.startsWith("cr"))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.shortName} — {p.name}
                </option>
              ))}
          </select>
        </label>
        <label className="space-y-0.5 text-[11px] text-[var(--muted)]">
          {t("strategies.sessionDate")}
          <div className={`${field} opacity-90`}>
            {sessionDate}{" "}
            <span className="text-[10px] text-[var(--muted)]">
              ({t("strategies.sessionAuto")})
            </span>
          </div>
        </label>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="mr-auto min-w-0">
            <h3 className="text-sm font-semibold">{t("strategies.deskTopTitle")}</h3>
            <p className="text-[11px] text-[var(--muted)]">
              {t("strategies.deskTopHint")}
            </p>
          </div>
          <button
            type="button"
            disabled={deskPending || deskStrategyKeys.length === 0}
            onClick={runDeskScan}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {deskPending
              ? t("strategies.deskTopScanning")
              : t("strategies.deskTopScan")}
          </button>
        </div>
        {deskNote ? (
          <p className="mt-2 text-[11px] text-[var(--muted)]">{deskNote}</p>
        ) : null}
        {deskError ? (
          <div className="mt-2 rounded-md border border-red-200 bg-[var(--danger-soft)] px-3 py-1.5 text-xs text-[var(--danger)]">
            {deskError}
          </div>
        ) : null}
        {deskTop.length > 0 ? (
          <div className="mt-2 overflow-auto rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--surface-muted)] text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium">
                    {t("strategies.colSymbol")}
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    {t("strategies.colStrategy")}
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    {t("strategies.colSide")}
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    {t("strategies.colDetail")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {deskTop.map((hit, i) => {
                  const pb = playbookByStrategyKey(hit.strategy);
                  const side = hit.last_signal?.side;
                  return (
                    <tr
                      key={`${hit.symbol}-${hit.strategy}-top`}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="px-2 py-1.5 text-[var(--muted)]">{i + 1}</td>
                      <td className="px-2 py-1.5 font-semibold">{hit.symbol}</td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          className="text-left font-medium text-[var(--accent)] hover:underline"
                          onClick={() => pb && setSelectedId(pb.id)}
                          title={pb?.name ?? hit.strategy}
                        >
                          {pb?.shortName ?? hit.strategy}
                        </button>
                        <span className="ml-1 text-[10px] text-[var(--muted)]">
                          {pb?.name?.replace(/^[A-Z0-9]+\s*—\s*/, "") ?? ""}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 uppercase text-[var(--muted)]">
                        {side === "long"
                          ? "CALL"
                          : side === "short"
                            ? "PUT"
                            : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-[var(--muted)]">
                        {hit.last_signal?.reason ?? hit.detail}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : deskNote && !deskPending ? (
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            {t("strategies.deskTopEmpty")}
          </p>
        ) : null}
      </section>

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
              {autoLive ? (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[var(--ok-soft)] text-[var(--ok)]">
                  {t("strategies.autoOn")}
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-[var(--muted)]">
              {playbook.shortName} · {t("strategies.liveScanHint")}
            </p>
            <p className="text-[10px] text-[var(--muted)]">
              {t("strategies.syncHint").replace("{tfs}", syncTfs.join(" + "))}
            </p>
          </div>
          <label className="space-y-0.5 text-[11px] text-[var(--muted)]">
            {t("strategies.timeframe")}
            {tfLocked ? (
              <div
                className={`${field} opacity-80`}
                title={t("strategies.tfLockedHint")}
              >
                {effectiveTf}{" "}
                <span className="text-[10px]">({t("strategies.tfFixed")})</span>
              </div>
            ) : (
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
            )}
          </label>
          <button
            type="button"
            disabled={pending || !playbook.strategyKey}
            onClick={runSyncAndScan}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {pending ? t("strategies.syncScanning") : t("strategies.syncAndScan")}
          </button>
          <button
            type="button"
            disabled={pending || !playbook.strategyKey}
            onClick={runScanOnly}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--hover)] disabled:opacity-50"
          >
            {t("strategies.scanOnly")}
          </button>
          <button
            type="button"
            disabled={!playbook.strategyKey}
            onClick={toggleAutoLive}
            className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
              autoLive
                ? "border border-[var(--ok)] text-[var(--ok)]"
                : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--hover)]"
            }`}
            title={t("strategies.autoHint")}
          >
            {autoLive ? t("strategies.autoStop") : t("strategies.autoStart")}
          </button>
        </div>

        {syncNote ? (
          <p className="mt-2 text-[11px] text-[var(--muted)]">{syncNote}</p>
        ) : null}

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
            {t("strategies.noMatches")}
          </p>
        ) : null}

        {board.length > 0 ? (
          <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-[var(--surface-muted)] text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Symbol</th>
                  <th className="px-2 py-1.5 font-medium">Strategy</th>
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
                    <td className="px-2 py-1">
                      {playbookByStrategyKey(hit.strategy)?.shortName ??
                        hit.strategy}
                    </td>
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
