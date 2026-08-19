"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { DeskSession, DeskStack } from "@/components/DeskSession";
import { useLocale } from "@/components/LocaleProvider";
import {
  brokerClosePosition,
  brokerTpCheck,
  brokerTpLadder,
  fetchBrokerPositions,
} from "@/lib/api";
import {
  readHoldTrader,
  subscribeHoldTrader,
} from "@/lib/schwab-hold";
import { isCashRthNy } from "@/lib/cash-session";
import type { BrokerOrder, BrokerPosition, TpLadderResponse, TpWatch } from "@/lib/types";

const WATCH_KEY = "maite.broker.tpWatches";
const POLL_MS = 20_000;
const LADDER_RETRY_WAIT_SEC = 150;
const DEFAULT_TP_PCT = 35;

function isRateLimitText(msg: string | null | undefined): boolean {
  return /(?:\b429\b|rate limit)/i.test(msg || "");
}

function retryAfterSec(err: unknown, fallback: number): number {
  const msg = err instanceof Error ? err.message : "";
  const m = /Retry-After (\d+)/i.exec(msg);
  const n = m ? Number(m[1]) : fallback;
  if (!Number.isFinite(n) || n < 15) return fallback;
  return Math.min(90, Math.max(30, Math.round(n)));
}

function ladderRateLimited(res: TpLadderResponse): boolean {
  return res.legs.some((leg) => !leg.ok && isRateLimitText(leg.message));
}

function loadWatches(): TpWatch[] {
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TpWatch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWatches(rows: TpWatch[]) {
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

function watchId(p: BrokerPosition): string {
  return `${p.account_hash}::${p.symbol}`;
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function formatOrderWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d);
}

export function PositionsDesk() {
  const { t } = useLocale();
  const [positions, setPositions] = useState<BrokerPosition[]>([]);
  const [orders, setOrders] = useState<BrokerOrder[]>([]);
  const [accountLabels, setAccountLabels] = useState<string[]>([]);
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [ladderBusy, setLadderBusy] = useState(false);
  const [retryLeft, setRetryLeft] = useState<number | null>(null);
  const [watches, setWatches] = useState<TpWatch[]>(() => loadWatches());
  const [armedConfirm, setArmedConfirm] = useState(false);
  const [holdTrader, setHoldTrader] = useState(() => readHoldTrader());
  const [cashRth, setCashRth] = useState(() => isCashRthNy());
  const inFlight = useRef<Set<string>>(new Set());
  const retryAbort = useRef(false);
  const retryGen = useRef(0);
  const quietUntilMs = useRef(0);

  useEffect(() => subscribeHoldTrader(() => setHoldTrader(readHoldTrader())), []);

  useEffect(() => {
    const tick = () => setCashRth(isCashRthNy());
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      retryAbort.current = true;
      retryGen.current += 1;
    };
  }, []);

  useEffect(() => {
    saveWatches(watches);
  }, [watches]);

  const refresh = useCallback((opts?: { keepError?: boolean }) => {
    if (readHoldTrader()) {
      setHoldTrader(true);
      setNote(t("positions.holdOpen"));
      return;
    }
    startTransition(async () => {
      if (!opts?.keepError) setError(null);
      try {
        const res = await fetchBrokerPositions();
        setPositions(res.positions);
        setOrders(res.orders ?? []);
        setOrdersError(res.orders_error ?? null);
        const labels = res.accounts
          .map((a) => a.accountNumber)
          .filter((n): n is string => Boolean(n && String(n).trim()));
        setAccountLabels(labels);
        setTradingEnabled(res.trading_enabled);
        const best = [...(res.accounts ?? [])].sort(
          (a, b) => (b.equity ?? 0) - (a.equity ?? 0),
        )[0];
        const equityBit =
          best?.equity != null && best.equity > 0
            ? ` · equity ${money(best.equity)} · 10% ${money(best.risk_budget)}`
            : "";
        setNote(
          t("positions.loaded")
            .replace("{n}", String(res.positions.length))
            .replace("{accounts}", String(res.accounts.length))
            .replace("{orders}", String((res.orders ?? []).length))
            .replace(
              "{accountList}",
              labels.length > 0 ? labels.join(", ") : "—",
            ) + equityBit,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load positions");
        setPositions([]);
        setOrders([]);
        setOrdersError(null);
        setAccountLabels([]);
      }
    });
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upsertWatch = useCallback(
    (pos: BrokerPosition, patch: Partial<TpWatch>) => {
      const id = watchId(pos);
      setWatches((prev) => {
        const existing = prev.find((w) => w.id === id);
        const next: TpWatch = {
          id,
          accountHash: pos.account_hash,
          symbol: pos.symbol,
          quantity: Math.abs(pos.quantity),
          assetType: pos.asset_type,
          instruction: pos.close_instruction,
          averagePrice: pos.average_price,
          targetPct: existing?.targetPct ?? DEFAULT_TP_PCT,
          autoClose: existing?.autoClose ?? false,
          lastPnlPct: existing?.lastPnlPct ?? null,
          lastMark: existing?.lastMark ?? null,
          lastStatus: existing?.lastStatus ?? null,
          firedAt: existing?.firedAt ?? null,
          ...patch,
          alertOn: false,
        };
        const others = prev.filter((w) => w.id !== id);
        if (!next.autoClose && next.targetPct === DEFAULT_TP_PCT) return others;
        return [...others, next];
      });
    },
    [],
  );

  const tickWatches = useCallback(async () => {
    if (readHoldTrader() || pending || ladderBusy) return;
    if (Date.now() < quietUntilMs.current) return;
    const active = watches.filter((w) => w.autoClose);
    if (active.length === 0) return;

    for (const w of active) {
      if (inFlight.current.has(w.id)) continue;
      if (w.firedAt && w.autoClose) continue;
      inFlight.current.add(w.id);
      try {
        const res = await brokerTpCheck({
          account_hash: w.accountHash,
          symbol: w.symbol,
          quantity: w.quantity,
          asset_type: w.assetType,
          instruction: w.instruction,
          average_price: w.averagePrice,
          target_pct: w.targetPct,
          auto_close: w.autoClose && armedConfirm && tradingEnabled && isCashRthNy(),
          confirm_live: w.autoClose && armedConfirm && tradingEnabled && isCashRthNy(),
        });
        setWatches((prev) =>
          prev.map((row) =>
            row.id === w.id
              ? {
                  ...row,
                  lastPnlPct: res.pnl_pct,
                  lastMark: res.mark,
                  lastStatus: res.message,
                  firedAt: res.closed
                    ? new Date().toISOString()
                    : res.hit && !row.autoClose
                      ? row.firedAt ?? new Date().toISOString()
                      : row.firedAt,
                }
              : row,
          ),
        );
        if (res.hit) {
          if (res.closed) {
            setNote(t("positions.closedNote").replace("{symbol}", w.symbol));
            refresh();
          }
        }
      } catch (err) {
        const raw = err instanceof Error ? err.message : "TP check failed";
        if (isRateLimitText(raw)) {
          const wait = retryAfterSec(err, 60);
          quietUntilMs.current = Date.now() + wait * 1000;
          setError(raw);
        }
        setWatches((prev) =>
          prev.map((row) =>
            row.id === w.id
              ? {
                  ...row,
                  lastStatus: raw,
                }
              : row,
          ),
        );
      } finally {
        inFlight.current.delete(w.id);
      }
    }
  }, [watches, armedConfirm, tradingEnabled, pending, ladderBusy, t, refresh]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void tickWatches();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [tickWatches]);

  function closeNow(pos: BrokerPosition) {
    if (!armedConfirm) {
      setError(t("positions.needArm"));
      return;
    }
    if (!isCashRthNy()) {
      setCashRth(false);
      setError(t("positions.needRth"));
      return;
    }
    if (!window.confirm(t("positions.confirmClose").replace("{symbol}", pos.symbol))) {
      return;
    }

    retryAbort.current = false;
    const gen = ++retryGen.current;
    setLadderBusy(true);
    setRetryLeft(null);
    setError(null);
    const sleep = (ms: number) =>
      new Promise((resolve) => window.setTimeout(resolve, ms));
    const stale = () => retryAbort.current || retryGen.current !== gen;
    const payload = {
      account_hash: pos.account_hash,
      symbol: pos.symbol,
      quantity: Math.abs(pos.quantity),
      asset_type: pos.asset_type,
      instruction: pos.close_instruction,
      confirm_live: true as const,
    };

    void (async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (stale()) return;
          try {
            const res = await brokerClosePosition(payload);
            if (stale()) return;
            setNote(
              t("positions.closedNote").replace("{symbol}", pos.symbol) +
                (res.order_id ? ` · #${res.order_id}` : ""),
            );
            refresh();
            return;
          } catch (err) {
            if (stale()) return;
            const raw = err instanceof Error ? err.message : "Close failed";
            if (!isRateLimitText(raw) || attempt === 1) {
              setError(raw);
              return;
            }
            const wait = retryAfterSec(err, 60);
            quietUntilMs.current = Date.now() + wait * 1000;
            for (let n = wait; n > 0; n -= 1) {
              if (stale()) return;
              setRetryLeft(n);
              await sleep(1000);
            }
            if (stale()) return;
            setRetryLeft(null);
            setError(null);
          }
        }
      } finally {
        if (retryGen.current === gen) {
          setLadderBusy(false);
          setRetryLeft(null);
        }
      }
    })();
  }

  function closeAll() {
    if (!armedConfirm) {
      setError(t("positions.needArm"));
      return;
    }
    if (!isCashRthNy()) {
      setCashRth(false);
      setError(t("positions.needRth"));
      return;
    }
    if (positions.length === 0) return;
    const snapshot = [...positions];
    if (
      !window.confirm(
        t("positions.confirmCloseAll").replace("{n}", String(snapshot.length)),
      )
    ) {
      return;
    }
    startTransition(async () => {
      setError(null);
      const okSyms: string[] = [];
      let rateLimited = false;
      let lastErr = "";
      for (let i = 0; i < snapshot.length; i += 1) {
        const pos = snapshot[i];
        const label = pos.underlying || pos.symbol;
        try {
          await brokerClosePosition({
            account_hash: pos.account_hash,
            symbol: pos.symbol,
            quantity: Math.abs(pos.quantity),
            asset_type: pos.asset_type,
            instruction: pos.close_instruction,
            confirm_live: true,
          });
          okSyms.push(label);
          if (i < snapshot.length - 1) {
            await new Promise((r) => window.setTimeout(r, 800));
          }
        } catch (err) {
          lastErr = err instanceof Error ? err.message : "Close failed";
          if (/rate limit/i.test(lastErr)) {
            rateLimited = true;
            break;
          }
        }
      }
      if (okSyms.length > 0) {
        setNote(
          t("positions.closeAllNote")
            .replace("{ok}", String(okSyms.length))
            .replace("{n}", String(snapshot.length))
            .replace("{syms}", okSyms.join(", ")),
        );
      }
      if (rateLimited) {
        setError(
          t("positions.closeAllRateLimit")
            .replace("{ok}", String(okSyms.length))
            .replace("{n}", String(snapshot.length)),
        );
      } else if (okSyms.length < snapshot.length) {
        setError(lastErr || "Close all failed");
      }
      refresh();
    });
  }

  function placeTpLadder(pos: BrokerPosition) {
    if (!armedConfirm) {
      setError(t("positions.needArm"));
      return;
    }
    if (!isCashRthNy()) {
      setCashRth(false);
      setError(t("positions.needRth"));
      return;
    }
    if (pos.average_price <= 0) {
      setError(t("positions.needAvg"));
      return;
    }
    const qty = Math.abs(pos.quantity);
    const tpPct =
      watches.find((row) => row.id === watchId(pos))?.targetPct ?? DEFAULT_TP_PCT;
    const limitPx = Math.round(pos.average_price * (1 + tpPct / 100) * 100) / 100;
    const msg = t("positions.confirmLadder")
      .replace("{symbol}", pos.symbol)
      .replace("{avg}", money(pos.average_price))
      .replace("{qty}", String(qty))
      .replace("{pct}", String(tpPct))
      .replace("{limit}", money(limitPx));
    if (!window.confirm(msg)) return;

    upsertWatch(pos, { autoClose: false, targetPct: tpPct });

    const payload = {
      account_hash: pos.account_hash,
      symbol: pos.symbol,
      quantity: qty,
      asset_type: pos.asset_type,
      instruction: pos.close_instruction,
      average_price: pos.average_price,
      confirm_live: true as const,
      duration: "GOOD_TILL_CANCEL",
      target_pct: tpPct,
    };

    const applyResult = (res: TpLadderResponse) => {
      const summary = res.legs
        .map((leg) => {
          const bit = `${leg.pct}%×${leg.quantity}@${money(leg.limit_price)}`;
          if (leg.ok) return bit;
          return `${bit} FAIL${leg.message ? ` (${leg.message})` : ""}`;
        })
        .join(" · ");
      setNote(
        `${t("positions.ladderNote").replace("{symbol}", pos.symbol)} — ${summary}`,
      );
      if (res.ok) {
        refresh();
        return;
      }
      const failed = res.legs.filter((leg) => !leg.ok);
      setError(
        ladderRateLimited(res)
          ? t("positions.ladderRateLimit")
          : [res.message, ...failed.map((leg) => leg.message).filter(Boolean)]
              .filter(Boolean)
              .join(" — "),
      );
      if (!ladderRateLimited(res)) refresh({ keepError: true });
    };

    retryAbort.current = false;
    const gen = ++retryGen.current;
    setLadderBusy(true);
    setRetryLeft(null);
    setError(null);
    const sleep = (ms: number) =>
      new Promise((resolve) => window.setTimeout(resolve, ms));
    const stale = () => retryAbort.current || retryGen.current !== gen;
    void (async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (stale()) return;
          try {
            const res = await brokerTpLadder(payload);
            if (stale()) return;
            if (res.ok || !ladderRateLimited(res) || attempt === 1) {
              applyResult(res);
              return;
            }
          } catch (err) {
            if (stale()) return;
            const raw = err instanceof Error ? err.message : "TP ladder failed";
            if (!isRateLimitText(raw) || attempt === 1) {
              setError(
                isRateLimitText(raw) ? t("positions.ladderRateLimit") : raw,
              );
              return;
            }
          }
          for (let n = LADDER_RETRY_WAIT_SEC; n > 0; n -= 1) {
            if (stale()) return;
            setRetryLeft(n);
            await sleep(1000);
          }
          if (stale()) return;
          setRetryLeft(null);
          setError(null);
        }
      } finally {
        if (retryGen.current === gen) {
          setLadderBusy(false);
          setRetryLeft(null);
        }
      }
    })();
  }

  function cancelLadderRetry() {
    retryAbort.current = true;
    retryGen.current += 1;
    setRetryLeft(null);
    setLadderBusy(false);
    setError(t("positions.ladderCancelled"));
  }

  return (
    <DeskStack>
      <DeskSession
        first
        step={1}
        title={t("positions.title")}
        hint={t("positions.hint")}
        actions={
          <div className="flex shrink-0 items-center gap-1.5">
            {positions.length > 0 ? (
              <button
                type="button"
                disabled={pending || ladderBusy || !tradingEnabled || !cashRth}
                onClick={closeAll}
                title={!cashRth ? t("positions.needRth") : undefined}
                className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] hover:bg-[var(--hover)] disabled:opacity-50"
              >
                {t("positions.closeAll")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={pending || holdTrader}
              title={holdTrader ? t("positions.holdOpen") : undefined}
              onClick={() => refresh()}
              className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {pending ? t("positions.refreshing") : t("positions.refresh")}
            </button>
          </div>
        }
      >
        {note ? (
          <div className="space-y-0.5 text-[11px] text-[var(--muted)]">
            <p>{note}</p>
            {accountLabels.length > 0 ? (
              <p>
                {t("positions.accountsLabel")}:{" "}
                <span className="font-mono tabular-nums text-[var(--foreground)]">
                  {accountLabels.join(" · ")}
                </span>
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--muted)]">{t("positions.emptyHint")}</p>
        )}
        {holdTrader ? (
          <p className="mt-2 text-[11px] text-[var(--warn)]">{t("positions.holdOpen")}</p>
        ) : null}
        {!cashRth ? (
          <div className="mt-2 rounded-md border border-amber-200/60 bg-[var(--warn-soft)] px-3 py-1.5 text-xs leading-snug text-[var(--warn)]">
            {t("positions.needRth")}
          </div>
        ) : null}
        {retryLeft != null || error ? (
          <div className="mt-2 flex items-start justify-between gap-2 rounded-md border border-red-200 bg-[var(--danger-soft)] px-3 py-1.5 text-xs text-[var(--danger)]">
            <span>
              {retryLeft != null
                ? t("positions.schwabWaiting").replace("{n}", String(retryLeft))
                : error}
            </span>
            {retryLeft != null ? (
              <button
                type="button"
                onClick={cancelLadderRetry}
                className="shrink-0 rounded border border-[var(--danger)]/40 px-2 py-0.5 text-[10px] font-medium hover:bg-[var(--hover)]"
              >
                {t("positions.ladderCancel")}
              </button>
            ) : null}
          </div>
        ) : null}

        <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[11px] leading-snug">
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--accent)]"
            checked={armedConfirm}
            onChange={(e) => setArmedConfirm(e.target.checked)}
          />
          <span>
            <span className="font-semibold text-[var(--foreground)]">
              {t("positions.armTitle")}
            </span>
            <span className="mt-0.5 block text-[var(--muted)]">
              {tradingEnabled
                ? t("positions.armBody")
                : t("positions.tradingDisabled")}
            </span>
          </span>
        </label>

        {positions.length > 0 ? (
          <div className="mt-2 overflow-auto rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--surface-muted)] text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-1.5 font-medium">{t("positions.colAccount")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("positions.colSymbol")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("positions.colQty")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("positions.colAvg")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("positions.colMark")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("positions.colPnl")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("positions.colTp")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("positions.colAuto")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("positions.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => {
                  const id = watchId(pos);
                  const w = watches.find((row) => row.id === id);
                  const pnl = w?.lastPnlPct ?? pos.pnl_pct;
                  const mark = w?.lastMark ?? pos.mark;
                  const autoOn = Boolean(w?.autoClose);
                  const tpPct = w?.targetPct ?? DEFAULT_TP_PCT;
                  const tpHit = pnl != null && pnl >= tpPct;
                  return (
                    <tr
                      key={id}
                      className="border-t border-[var(--border)] align-top"
                    >
                      <td className="px-2 py-1.5 font-mono text-[11px] tabular-nums">
                        {pos.account_number || "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-semibold">{pos.underlying || pos.symbol}</div>
                        <div className="max-w-[14rem] truncate text-[10px] text-[var(--muted)]">
                          {pos.description || pos.symbol}
                        </div>
                        <div className="text-[10px] uppercase text-[var(--muted)]">
                          {pos.asset_type}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{pos.quantity}</td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {money(pos.average_price)}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{money(mark)}</td>
                      <td
                        className={`px-2 py-1.5 font-medium tabular-nums ${
                          (pnl ?? 0) >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
                        }`}
                      >
                        {pct(pnl)}
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          className="rounded border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 py-1 text-[11px]"
                          value={tpPct}
                          onChange={(e) =>
                            upsertWatch(pos, {
                              targetPct: Number(e.target.value),
                            })
                          }
                        >
                          <option value={10}>10%</option>
                          <option value={20}>20%</option>
                          <option value={35}>35%</option>
                          <option value={50}>50%</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          className="accent-[var(--accent)]"
                          checked={Boolean(w?.autoClose)}
                          disabled={!tradingEnabled}
                          onChange={(e) =>
                            upsertWatch(pos, {
                              autoClose: e.target.checked,
                            })
                          }
                          title={t("positions.autoHint")}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            disabled={pending || ladderBusy || !tradingEnabled || !cashRth}
                            onClick={() => placeTpLadder(pos)}
                            className="rounded border border-[var(--ok)]/40 bg-[var(--ok-soft)] px-2 py-1 text-[10px] font-medium text-[var(--ok)] hover:bg-[var(--hover)] disabled:opacity-40"
                            title={!cashRth ? t("positions.needRth") : t("positions.ladderHint")}
                          >
                            {t("positions.tpLadder").replace(
                              "{pct}",
                              String(tpPct),
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={pending || ladderBusy || !tradingEnabled || !cashRth}
                            onClick={() => closeNow(pos)}
                            className="rounded border border-[var(--border)] px-2 py-1 text-[10px] font-medium hover:bg-[var(--hover)] disabled:opacity-40"
                            title={!cashRth ? t("positions.needRth") : undefined}
                          >
                            {t("positions.closeNow")}
                          </button>
                        </div>
                        {tpHit ? (
                          <div className="mt-1 max-w-[10rem] text-[9px] font-medium leading-snug text-[var(--ok)]">
                            {t("positions.tpHit").replace("{pct}", String(tpPct))}
                          </div>
                        ) : null}
                        {autoOn ? (
                          <div className="mt-1 max-w-[10rem] text-[9px] leading-snug text-[var(--muted)]">
                            {t("positions.ladderOffBecauseAuto")}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : !pending ? (
          <div className="mt-2 space-y-1 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[11px] leading-snug text-[var(--muted)]">
            <p className="font-medium text-[var(--foreground)]">
              {t("positions.noPositions")}
            </p>
            <p>{t("positions.noPositionsHint")}</p>
          </div>
        ) : null}

        {ordersError ? (
          <div className="mt-3 rounded-md border border-amber-300/60 bg-[var(--warn-soft)] px-3 py-2 text-[11px] leading-snug text-[var(--warn)]">
            {t("positions.ordersRateLimit").replace("{detail}", ordersError)}
          </div>
        ) : null}
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
            {t("positions.ordersTitle")}
          </p>
          {orders.length > 0 ? (
            <div className="overflow-auto rounded-lg border border-[var(--border)]">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-[var(--surface-muted)] text-[var(--muted)]">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">{t("positions.colWhen")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("positions.colAccount")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("positions.colSymbol")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("positions.colStatus")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("positions.colSide")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("positions.colQty")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("positions.colLimit")}</th>
                    <th className="px-2 py-1.5 font-medium">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr
                      key={`${o.account_hash}-${o.order_id}-${o.symbol}`}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[var(--muted)]">
                        {formatOrderWhen(o.entered_time)} ET
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[11px] tabular-nums">
                        {o.account_number || "—"}
                      </td>
                      <td className="px-2 py-1.5 font-medium">{o.symbol || "—"}</td>
                      <td className="px-2 py-1.5 text-[var(--muted)]">{o.status}</td>
                      <td className="px-2 py-1.5 text-[var(--muted)]">
                        {o.instruction || o.order_type}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{o.quantity ?? "—"}</td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {o.price != null ? money(Number(o.price)) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-[10px] text-[var(--muted)]">
                        {o.order_id || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !pending ? (
            <p className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[11px] leading-snug text-[var(--muted)]">
              {t("positions.ordersEmpty")}
            </p>
          ) : null}
        </div>
      </DeskSession>
    </DeskStack>
  );
}
