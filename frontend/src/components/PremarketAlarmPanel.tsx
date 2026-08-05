"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { checkPremarketAlarm, fetchStrategies } from "@/lib/api";
import type { PremarketAlarmWatch, Strategy } from "@/lib/types";

const STORAGE_KEY = "maite.premarket.alarms";
const DEFAULT_INTERVAL_SEC = 30;

type Props = {
  sessionDate: string;
  timeframe: string;
  dataProvider?: string;
};

function loadStored(): PremarketAlarmWatch[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PremarketAlarmWatch[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => ({
      ...row,
      status:
        row.status === "running" || row.status === "checking"
          ? "stopped"
          : row.status,
    }));
  } catch {
    return [];
  }
}

function persist(watches: PremarketAlarmWatch[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(watches));
  } catch {
    /* ignore */
  }
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PremarketAlarmPanel({
  sessionDate,
  timeframe,
  dataProvider,
}: Props) {
  const [watches, setWatches] = useState<PremarketAlarmWatch[]>(() => loadStored());
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [symbol, setSymbol] = useState("SPY");
  const [strategy, setStrategy] = useState("opening_range_breakout");
  const [intervalSec, setIntervalSec] = useState(DEFAULT_INTERVAL_SEC);
  const [formError, setFormError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const timersRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const watchesRef = useRef(watches);
  watchesRef.current = watches;

  useEffect(() => {
    persist(watches);
  }, [watches]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await fetchStrategies();
        if (cancelled) return;
        setStrategies(items);
        if (items[0]) setStrategy(items[0].name);
      } catch {
        if (!cancelled) {
          setStrategies([
            {
              name: "opening_range_breakout",
              description: "Opening Range Breakout",
              default_parameters: {},
            },
          ]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearTimer = useCallback((id: string) => {
    const existing = timersRef.current.get(id);
    if (existing != null) {
      window.clearInterval(existing);
      timersRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const id of timersRef.current.keys()) {
        const t = timersRef.current.get(id);
        if (t != null) window.clearInterval(t);
      }
      timersRef.current.clear();
    };
  }, []);

  const runCheck = useCallback(
    async (id: string) => {
      if (inFlightRef.current.has(id)) return;
      const watch = watchesRef.current.find((w) => w.id === id);
      if (!watch || watch.status === "met" || watch.status === "stopped") return;

      inFlightRef.current.add(id);
      setWatches((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: "checking" } : w)),
      );
      try {
        const res = await checkPremarketAlarm({
          symbol: watch.symbol,
          strategy: watch.strategy,
          timeframe: watch.timeframe,
          session_date: sessionDate,
          data_provider: dataProvider,
        });
        const checkedAt = res.checked_at;
        if (res.met) {
          clearTimer(id);
          setWatches((prev) =>
            prev.map((w) =>
              w.id === id
                ? {
                    ...w,
                    status: "met",
                    lastStatus: res.status,
                    lastDetail: res.detail,
                    lastCheckedAt: checkedAt,
                    lastError: null,
                    metAt: checkedAt,
                  }
                : w,
            ),
          );
          setBanner(`Alarm met: ${watch.symbol} · ${watch.strategy}`);
          try {
            if (
              typeof Notification !== "undefined" &&
              Notification.permission === "granted"
            ) {
              new Notification(`Alarm: ${watch.symbol}`, {
                body: res.detail,
                tag: `maite-alarm-${id}`,
              });
            }
          } catch {
            /* ignore */
          }
        } else {
          setWatches((prev) =>
            prev.map((w) =>
              w.id === id
                ? {
                    ...w,
                    status: "running",
                    lastStatus: res.status,
                    lastDetail: res.detail,
                    lastCheckedAt: checkedAt,
                    lastError: null,
                  }
                : w,
            ),
          );
        }
      } catch (err) {
        setWatches((prev) =>
          prev.map((w) =>
            w.id === id
              ? {
                  ...w,
                  status: "error",
                  lastError: err instanceof Error ? err.message : "Check failed",
                }
              : w,
          ),
        );
      } finally {
        inFlightRef.current.delete(id);
      }
    },
    [clearTimer, dataProvider, sessionDate],
  );

  const startWatch = useCallback(
    (id: string, seed?: PremarketAlarmWatch) => {
      const watch = seed ?? watchesRef.current.find((w) => w.id === id);
      if (!watch) return;
      clearTimer(id);
      setWatches((prev) =>
        prev.map((w) =>
          w.id === id
            ? { ...w, status: "running", lastError: null, metAt: null }
            : w,
        ),
      );
      void runCheck(id);
      const handle = window.setInterval(
        () => {
          void runCheck(id);
        },
        Math.max(5, watch.intervalSec) * 1000,
      );
      timersRef.current.set(id, handle);
    },
    [clearTimer, runCheck],
  );

  const stopWatch = useCallback(
    (id: string) => {
      clearTimer(id);
      setWatches((prev) =>
        prev.map((w) =>
          w.id === id && w.status !== "met" ? { ...w, status: "stopped" } : w,
        ),
      );
    },
    [clearTimer],
  );

  const removeWatch = useCallback(
    (id: string) => {
      clearTimer(id);
      setWatches((prev) => prev.filter((w) => w.id !== id));
    },
    [clearTimer],
  );

  function onAdd() {
    setFormError(null);
    const sym = symbol.trim().toUpperCase();
    if (!sym) {
      setFormError("Symbol required");
      return;
    }
    if (!strategy) {
      setFormError("Strategy required");
      return;
    }
    const dup = watches.some(
      (w) =>
        w.symbol === sym &&
        w.strategy === strategy &&
        (w.status === "running" || w.status === "checking"),
    );
    if (dup) {
      setFormError("That watch is already running");
      return;
    }
    const id = newId();
    const watch: PremarketAlarmWatch = {
      id,
      symbol: sym,
      strategy,
      timeframe,
      intervalSec: Math.max(5, intervalSec || DEFAULT_INTERVAL_SEC),
      status: "idle",
      lastStatus: null,
      lastDetail: null,
      lastCheckedAt: null,
      lastError: null,
      metAt: null,
    };
    setWatches((prev) => [watch, ...prev]);
    watchesRef.current = [watch, ...watchesRef.current];
    startWatch(id, watch);
  }

  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div>
        <h3 className="text-sm font-medium text-emerald-400">Alarm watches</h3>
        <p className="text-xs text-zinc-500">
          Poll one symbol + strategy until it matches (OceanView Premarket alarm).
        </p>
      </div>

      {banner ? (
        <div className="rounded-md border border-emerald-700/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">
          {banner}
          <button
            type="button"
            className="ml-3 text-xs text-emerald-300 underline"
            onClick={() => setBanner(null)}
          >
            dismiss
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="text-zinc-400">Symbol</span>
          <input
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          />
        </label>
        <label className="space-y-1 text-sm">
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
        <label className="space-y-1 text-sm">
          <span className="text-zinc-400">Interval (sec)</span>
          <input
            type="number"
            min={5}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
            value={intervalSec}
            onChange={(e) => setIntervalSec(Number(e.target.value) || DEFAULT_INTERVAL_SEC)}
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={onAdd}
            className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
          >
            Add watch
          </button>
        </div>
      </div>
      {formError ? <p className="text-sm text-red-300">{formError}</p> : null}

      {watches.length === 0 ? (
        <p className="text-sm text-zinc-500">No watches yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
          {watches.map((w) => (
            <li
              key={w.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-zinc-100">
                  {w.symbol}{" "}
                  <span className="text-xs font-normal text-zinc-500">{w.strategy}</span>
                </p>
                <p className="text-xs text-zinc-500">
                  every {w.intervalSec}s · {w.status}
                  {w.lastStatus ? ` · last ${w.lastStatus}` : ""}
                  {w.lastCheckedAt
                    ? ` · ${new Date(w.lastCheckedAt).toLocaleTimeString()}`
                    : ""}
                </p>
                {w.lastDetail ? (
                  <p className="mt-1 text-sm text-zinc-400">{w.lastDetail}</p>
                ) : null}
                {w.lastError ? (
                  <p className="mt-1 text-sm text-red-300">{w.lastError}</p>
                ) : null}
                {w.metAt ? (
                  <p className="mt-1 text-sm text-emerald-300">
                    Met at {new Date(w.metAt).toLocaleTimeString()}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {w.status === "running" || w.status === "checking" || w.status === "error" ? (
                  <button
                    type="button"
                    onClick={() => stopWatch(w.id)}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500"
                  >
                    Stop
                  </button>
                ) : w.status !== "met" ? (
                  <button
                    type="button"
                    onClick={() => startWatch(w.id)}
                    className="rounded-md border border-emerald-700/60 px-3 py-1.5 text-xs text-emerald-200 hover:border-emerald-500"
                  >
                    Start
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeWatch(w.id)}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-500"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
