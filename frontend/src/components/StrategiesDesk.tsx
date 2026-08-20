"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DeskSession, DeskStack } from "@/components/DeskSession";
import {
  brokerOpenOption,
  fetchBrokerPositions,
  fetchInstruments,
  scanStrategies,
  syncMarketData,
} from "@/lib/api";
import { useLocale } from "@/components/LocaleProvider";
import {
  playbookByStrategyKey,
  playbooksForVenue,
  scannableStrategyKeys,
  type StrategyPlaybook,
} from "@/lib/playbooks";
import {
  localizePlaybook,
  localizedPlaybookLabel,
  localizedPlaybookName,
} from "@/lib/playbook-localize";
import {
  buildOccOptionSymbol,
  buildOptionsEntryPlan,
  listedExpirationSnapshot,
  planWithDebit,
  rememberListedExpirations,
  type PlanCapital,
} from "@/lib/options-premium-ranges";
import { DEFAULT_OTM_PREMIUM, sizeForSymbol, sizeLongOption } from "@/lib/option-sizing";
import {
  groupInstrumentsForVenue,
  WATCH_SYMBOLS,
} from "@/lib/instrument-groups";
import { setHoldTrader } from "@/lib/schwab-hold";
import {
  extendSchwabQuiet,
  readSchwabQuietUntil,
  subscribeSchwabQuiet,
} from "@/lib/schwab-quiet";
import { isCashRthNy, isFuturesOvernightNy, isGlobexOpenNy } from "@/lib/cash-session";
import {
  FALLBACK_INSTRUMENTS,
  TIMEFRAMES,
  sortFuturesInstruments,
  providerLabel,
  type BrokerAccount,
  type BrokerPosition,
  type Instrument,
  type ScanHit,
  type ScanResponse,
  type Venue,
} from "@/lib/types";

const AUTO_LIVE_MS = 150_000; // 2.5 minutes
const AUTO_LIVE_KEY = "maite.strategies.autoLive";
const AUTO_DESK_KEY = "maite.strategies.autoDesk";
const ARM_OPENS_KEY = "maite.strategies.armOpens";
const CAPITAL_CACHE_KEY = "maite.strategies.capitalCache";
const CAPITAL_CACHE_MS = 24 * 60 * 60 * 1000;
const EXP_CHAIN_KEY = "maite.strategies.expChain";
const EXP_CHAIN_MS = 12 * 60 * 60 * 1000;
/** After capital load only — a couple of trader GETs. */
const OPEN_QUIET_MS = 45_000;
/** After Options TOP 5 / Focus sync — Schwab pricehistory needs a real cool-down. */
const POST_SYNC_QUIET_MS = 90_000;
/** Cool-down after a real Open 429 (honor Schwab Retry-After). */
const RATE_LIMIT_QUIET_MS = 60_000;
/** After the one automatic Open retry still 429s — stop the loop. */
const OPEN_GIVE_UP_QUIET_MS = 180_000;
const OPEN_RETRY_WAIT_SEC = 60;
const DESK_TOP_N = 5;
/**
 * Hybrid desk: Options path is plan → TOS. Schwab BUY_TO_OPEN stays behind
 * this flag (experimental — same OAuth bucket that 429s live orders).
 */
const DESK_OPENS_ENABLED = false;
/**
 * GET accounts/positions for Load capital + TOS sizing. Keep true so Copy for TOS
 * can use live equity/cash. Order POSTs stay off (DESK_OPENS_ENABLED).
 */
const SCHWAB_TRADER_READS = true;
/** Options TOP 5 — no 1m here (too slow across the equity book; Focus/ML02 pulls 1m). */
const DESK_SYNC_TFS = ["1h", "1d", "15m", "4h"] as const;
const DESK_LOOKBACK_DAYS = 25;
const DESK_15M_LOOKBACK_DAYS = 7;
const DESK_5M_LOOKBACK_DAYS = 3;
const DESK_4H_LOOKBACK_DAYS = 14;
/** Futures live desk: union of ML01/ML02/ML03 TFs. */
const DESK_SYNC_TFS_FUTURES = ["4h", "1h", "15m", "5m", "1m"] as const;
const DESK_LOOKBACK_FUTURES = 14;
const DESK_1M_LOOKBACK_DAYS = 1;
/** Parallel Yahoo sync calls — sequential was ~30+ requests and felt stuck. */
const DESK_SYNC_CONCURRENCY = 4;
/** One strategy per HTTP call — extras (15m/1m) still trip API Gateway ~29s. */
const DESK_STRATEGY_CHUNK = 1;
const SCAN_SYMBOL_BATCH = 2;
const DESK_SCAN_SYMBOL_BATCH = 4;
const DESK_SCAN_SYMBOL_BATCH_FUTURES = 1;
const HARD_SYNC_KEY = "maite.strategies.hardSyncDay";
/** Session day when desk candle sync last completed (skip re-download on Auto). */
const DESK_SYNCED_DAY_KEY = "maite.strategies.deskSyncedDay";
/** Watch + rich-premium names stay on Focus Sync & Scan, not the TOP 5 universe. */
const DESK_FOCUS_ONLY = new Set([...WATCH_SYMBOLS, "IOVA"]);

function lookbackDaysForTf(tf: string, base: number): number {
  if (tf === "1m") return Math.min(base, DESK_1M_LOOKBACK_DAYS);
  if (tf === "5m") return Math.min(base, DESK_5M_LOOKBACK_DAYS);
  if (tf === "15m") return Math.min(base, DESK_15M_LOOKBACK_DAYS);
  if (tf === "4h") return Math.min(base, DESK_4H_LOOKBACK_DAYS);
  return base;
}

function takeHardRefresh(sessionDay: string, fromAuto: boolean): boolean {
  if (fromAuto) return false;
  if (typeof window === "undefined") return true;
  try {
    const prev = window.localStorage.getItem(HARD_SYNC_KEY);
    if (prev === sessionDay) return false;
    window.localStorage.setItem(HARD_SYNC_KEY, sessionDay);
    return true;
  } catch {
    return true;
  }
}

function deskSyncedToday(sessionDay: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DESK_SYNCED_DAY_KEY) === sessionDay;
  } catch {
    return false;
  }
}

function markDeskSyncedToday(sessionDay: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DESK_SYNCED_DAY_KEY, sessionDay);
  } catch {
    /* ignore */
  }
}

type DeskConfluenceGroup = {
  symbol: string;
  name: string;
  /** CALL | PUT — only this side is shown / ranked. */
  side: "long" | "short";
  hits: ScanHit[];
  confluence: number;
  /** Matching setups on the opposite side (hidden from rank, shown as note). */
  opposedCount: number;
  /** Watching / near-setup rows used to fill Futures TOP 5 when matches are empty. */
  candidate?: boolean;
};

/** Split /strategy/scan so each request stays under API Gateway's ~29s cap. */
async function scanStrategiesBatched(
  payload: {
    strategies?: string[];
    timeframe?: string;
    session_date?: string;
    data_provider?: string;
    symbols: string[];
    matches_only?: boolean;
  },
  batchSize = SCAN_SYMBOL_BATCH,
): Promise<ScanResponse> {
  const merged: ScanResponse = {
    scanned_at: new Date().toISOString(),
    session_date: payload.session_date ?? "",
    timeframe: payload.timeframe ?? "",
    strategies: payload.strategies ?? [],
    hits: [],
    match_count: 0,
    total_checked: 0,
  };
  const size = Math.max(1, batchSize);
  for (let i = 0; i < payload.symbols.length; i += size) {
    const symbols = payload.symbols.slice(i, i + size);
    let res: ScanResponse | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        res = await scanStrategies({ ...payload, symbols });
        break;
      } catch (err) {
        if (attempt === 0 && isGatewayTimeout(err)) {
          await sleepMs(600);
          continue;
        }
        throw err;
      }
    }
    if (!res) continue;
    merged.scanned_at = res.scanned_at;
    merged.session_date = res.session_date;
    merged.timeframe = res.timeframe;
    merged.strategies = res.strategies;
    merged.hits.push(...res.hits);
    merged.total_checked += res.total_checked;
  }
  merged.match_count = merged.hits.filter((h) => h.matched).length;
  return merged;
}

function hitSide(hit: ScanHit): "long" | "short" | null {
  const side = hit.last_signal?.side;
  if (side === "long" || side === "short") return side;
  if (hit.status.includes("long") || hit.status.includes("call")) return "long";
  if (hit.status.includes("short") || hit.status.includes("put")) return "short";
  return null;
}

/** Signals / active first, then watching, then everything else. */
function scanStatusRank(status: string): number {
  if (status.startsWith("signal_") || status.startsWith("active_")) return 0;
  if (status === "watching") return 1;
  if (status === "flat_after_trades") return 2;
  if (status === "no_data" || status === "error") return 3;
  return 4;
}

function sortScanBoard(hits: ScanHit[]): ScanHit[] {
  return [...hits].sort((a, b) => {
    const rank = scanStatusRank(a.status) - scanStatusRank(b.status);
    if (rank !== 0) return rank;
    const bySymbol = a.symbol.localeCompare(b.symbol);
    if (bySymbol !== 0) return bySymbol;
    return a.strategy.localeCompare(b.strategy);
  });
}

/**
 * Rank by directional confluence: count strategies that agree on CALL *or* PUT,
 * keep the stronger side only (no mixed PUT+CALL stacks in TOP 5).
 */
function rankByConfluence(hits: ScanHit[], topN: number): DeskConfluenceGroup[] {
  const bySymbol = new Map<string, ScanHit[]>();
  for (const hit of hits) {
    if (!hit.matched) continue;
    const list = bySymbol.get(hit.symbol) ?? [];
    if (list.some((h) => h.strategy === hit.strategy)) continue;
    list.push(hit);
    bySymbol.set(hit.symbol, list);
  }

  const groups: DeskConfluenceGroup[] = [];
  for (const [symbol, symbolHits] of bySymbol.entries()) {
    const calls = symbolHits.filter((h) => hitSide(h) === "long");
    const puts = symbolHits.filter((h) => hitSide(h) === "short");
    // Prefer the side with more agreement; on a tie, skip (contradictory — not confluence)
    let side: "long" | "short";
    let keep: ScanHit[];
    let opposed: number;
    if (calls.length > puts.length) {
      side = "long";
      keep = calls;
      opposed = puts.length;
    } else if (puts.length > calls.length) {
      side = "short";
      keep = puts;
      opposed = calls.length;
    } else if (calls.length === 0 && puts.length === 0) {
      continue;
    } else {
      // Exact CALL/PUT tie → no directional confluence; drop from TOP
      continue;
    }
    if (keep.length === 0) continue;
    const sortedHits = [...keep].sort((a, b) => {
      const ta = a.last_signal?.timestamp ?? "";
      const tb = b.last_signal?.timestamp ?? "";
      return tb.localeCompare(ta);
    });
    groups.push({
      symbol,
      name: symbolHits[0]?.name ?? symbol,
      side,
      hits: sortedHits,
      confluence: sortedHits.length,
      opposedCount: opposed,
    });
  }

  groups.sort((a, b) => {
    if (b.confluence !== a.confluence) return b.confluence - a.confluence;
    const tb = b.hits[0]?.last_signal?.timestamp ?? "";
    const ta = a.hits[0]?.last_signal?.timestamp ?? "";
    if (tb !== ta) return tb.localeCompare(ta);
    if (a.opposedCount !== b.opposedCount) return a.opposedCount - b.opposedCount;
    return a.symbol.localeCompare(b.symbol);
  });

  return groups.slice(0, topN);
}

/** Skip session-gated watching rows (not actionable on this desk right now). */
const GATED_WATCH_DETAIL =
  /NY RTH|not live in Globex|Globex closed|opening play|not a live match in the afternoon|live until 11:30/i;

function watchingStrategyRank(strategy: string): number {
  if (strategy.startsWith("ml01")) return 0;
  if (strategy.startsWith("ml02")) return 1;
  if (strategy.startsWith("ml03")) return 9;
  return 5;
}

function pickWatchingHit(hits: ScanHit[]): ScanHit | null {
  const usable = hits.filter((h) => !GATED_WATCH_DETAIL.test(String(h.detail || "")));
  if (!usable.length) return null;
  const withSig = usable.filter((h) => h.last_signal);
  const pool = withSig.length ? withSig : usable;
  return [...pool].sort((a, b) => {
    const rank = watchingStrategyRank(a.strategy) - watchingStrategyRank(b.strategy);
    if (rank !== 0) return rank;
    return a.strategy.localeCompare(b.strategy);
  })[0];
}
function padWithWatchingCandidates(
  matched: DeskConfluenceGroup[],
  allHits: ScanHit[],
  topN: number,
): DeskConfluenceGroup[] {
  if (matched.length >= topN) return matched;
  const taken = new Set(matched.map((g) => g.symbol.toUpperCase()));
  const bySymbol = new Map<string, ScanHit[]>();
  for (const hit of allHits) {
    if (hit.matched) continue;
    if (hit.status === "no_data") continue;
    const st = String(hit.status || "").toLowerCase();
    if (st !== "watching" && st !== "flat_after_trades") continue;
    if (GATED_WATCH_DETAIL.test(String(hit.detail || ""))) continue;
    const sym = hit.symbol.toUpperCase();
    if (taken.has(sym)) continue;
    const list = bySymbol.get(sym) ?? [];
    if (list.some((h) => h.strategy === hit.strategy)) continue;
    list.push(hit);
    bySymbol.set(sym, list);
  }
  const extras: DeskConfluenceGroup[] = [];
  for (const [symbol, symbolHits] of bySymbol.entries()) {
    const picked = pickWatchingHit(symbolHits);
    if (!picked) continue;
    extras.push({
      symbol,
      name: picked.name ?? symbol,
      side: hitSide(picked) ?? "long",
      hits: [picked],
      confluence: 0,
      opposedCount: 0,
      candidate: true,
    });
  }
  extras.sort((a, b) => {
    if (b.hits.length !== a.hits.length) return b.hits.length - a.hits.length;
    const tb = b.hits[0]?.last_signal?.timestamp ?? "";
    const ta = a.hits[0]?.last_signal?.timestamp ?? "";
    if (tb !== ta) return tb.localeCompare(ta);
    return a.symbol.localeCompare(b.symbol);
  });
  return [...matched, ...extras].slice(0, topN);
}

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

/** Rolling UTC window so Globex evening bars are not cut at 23:59Z (~20:00 ET). */
function syncRangeIso(lookbackDays: number, now = new Date()): { start: string; end: string } {
  const start = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: now.toISOString() };
}

/** Last/current NY session — mirrors backend resolve_operative_session_date. */
function operativeSessionNyIso(now = new Date(), venue: Venue = "schwab"): string {
  const p = nyParts(now);
  const today = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const [y, m, day] = today.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day, 12)).getUTCDay(); // Sun=0 … Sat=6
  if (venue === "tradeadvocate") {
    const globexOpen = isGlobexOpenNy(now);
    if (globexOpen) return today;
    if (wd === 5) return today; // Friday after 17:00 — last Globex day
    if (wd === 0 || wd === 6) return previousWeekdayIso(today);
    return today; // Mon–Thu 17:00–18:00 halt
  }
  if (wd === 0 || wd === 6) return previousWeekdayIso(today);
  if (p.hh < 9 || (p.hh === 9 && p.mm < 30)) return previousWeekdayIso(today);
  return today;
}

/** True when the venue is not in its live session (prior-session banners). */
function isPremarketOrClosedNy(now = new Date(), venue: Venue = "schwab"): boolean {
  if (venue === "tradeadvocate") {
    return !isGlobexOpenNy(now);
  }
  const p = nyParts(now);
  const today = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const [y, m, day] = today.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day, 12)).getUTCDay();
  if (wd === 0 || wd === 6) return true;
  return p.hh < 9 || (p.hh === 9 && p.mm < 30);
}

function isCashAutoOffNy(now = new Date()): boolean {
  return isPremarketOrClosedNy(now, "schwab");
}

/** NY date + time for scan stamps (avoids “is this yesterday?” confusion). */
function formatNyDateTime(isoOrDate: string | Date, locale: string): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d);
}

function statusStyle(status: string, priorSession = false): string {
  if (priorSession && (status.startsWith("active_") || status.startsWith("signal_"))) {
    return "border-amber-200/50 bg-[var(--warn-soft)] text-[var(--warn)]";
  }
  if (status.startsWith("active_") || status.startsWith("signal_")) {
    return "border-emerald-200 bg-[var(--ok-soft)] text-[var(--ok)]";
  }
  if (status === "no_data" || status === "error") {
    return "border-amber-200 bg-[var(--warn-soft)] text-[var(--warn)]";
  }
  return "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]";
}

function displayScanStatus(
  status: string,
  priorSession: boolean,
  t: (key: string) => string,
): string {
  if (
    priorSession &&
    (status.startsWith("active_") || status.startsWith("signal_"))
  ) {
    return t("strategies.priorSessionStatus").replace("{status}", status);
  }
  return status;
}

function readAutoLive(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTO_LIVE_KEY) === "1";
}

function readAutoDesk(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTO_DESK_KEY) === "1";
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: n < 10 ? 1 : 0,
  });
}

function moneyUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sleepMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isSchwabBusyErr(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : "";
  return /(?:\b429\b|rate limit)/i.test(msg);
}

function isGatewayTimeout(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : "";
  return /(?:\b504\b|\b503\b|timed out)/i.test(msg);
}

function retryAfterSec(err: unknown, fallback: number): number {
  const msg = err instanceof Error ? err.message : "";
  const m = /Retry-After (\d+)/i.exec(msg);
  const n = m ? Number(m[1]) : fallback;
  if (!Number.isFinite(n) || n < 15) return fallback;
  return Math.min(90, Math.max(30, Math.round(n)));
}

function brokerErrorCopy(
  err: unknown,
  fallback: string,
  t: (key: string) => string,
): string {
  const msg = err instanceof Error ? err.message : fallback;
  if (/rate limit/i.test(msg)) return t("strategies.rateLimit");
  return msg;
}

function planCapital(account: BrokerAccount | null): PlanCapital | null {
  if (!account) return null;
  return {
    equity: account.equity ?? 0,
    cashAvailable: account.available_funds ?? account.cash_balance ?? 0,
  };
}

type CapitalCache = {
  at: number;
  accounts: BrokerAccount[];
  tradingEnabled: boolean;
  positions?: BrokerPosition[];
};

function readCapitalCache(): CapitalCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CAPITAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CapitalCache;
    if (!parsed?.at || Date.now() - parsed.at > CAPITAL_CACHE_MS) return null;
    if (!Array.isArray(parsed.accounts)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCapitalCache(
  accounts: BrokerAccount[],
  tradingEnabled: boolean,
  positions: BrokerPosition[] = [],
) {
  if (typeof window === "undefined") return;
  try {
    const slim = positions.map((p) => ({
      account_hash: p.account_hash,
      account_number: p.account_number,
      symbol: p.symbol,
      underlying: p.underlying,
      description: p.description,
      asset_type: p.asset_type,
      quantity: p.quantity,
      average_price: p.average_price,
      market_value: p.market_value,
      mark: p.mark,
      pnl_pct: p.pnl_pct,
      day_pnl: p.day_pnl,
      day_pnl_pct: p.day_pnl_pct,
      close_instruction: p.close_instruction,
      multiplier: p.multiplier,
    }));
    const payload: CapitalCache = {
      at: Date.now(),
      accounts,
      tradingEnabled,
      positions: slim,
    };
    window.localStorage.setItem(CAPITAL_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota
  }
}

function hydrateExpChainCache() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(EXP_CHAIN_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { at?: number; bySymbol?: Record<string, string[]> };
    if (!parsed?.at || Date.now() - parsed.at > EXP_CHAIN_MS) return;
    if (!parsed.bySymbol || typeof parsed.bySymbol !== "object") return;
    for (const [sym, dates] of Object.entries(parsed.bySymbol)) {
      if (Array.isArray(dates)) rememberListedExpirations(sym, dates);
    }
  } catch {
    // ignore
  }
}

function tooRichCopy(
  t: (key: string) => string,
  sizing: ReturnType<typeof sizeLongOption>,
): string {
  const main = t("strategies.openTooRich")
    .replace("{cost}", moneyUsd(sizing.costPerContract))
    .replace("{pct}", formatPct(sizing.actualRiskPct))
    .replace("{risk}", moneyUsd(sizing.riskBudget))
    .replace("{need}", moneyUsd(sizing.equityForDeskRule))
    .replace("{need50}", moneyUsd(sizing.equityForMaxOpen));
  if (sizing.cashShortfall > 0) {
    return (
      main +
      " " +
      t("strategies.openNeedCash")
        .replace("{cash}", moneyUsd(sizing.cashAvailable))
        .replace("{more}", moneyUsd(sizing.cashShortfall))
        .replace("{cost}", moneyUsd(sizing.costPerContract))
    );
  }
  return main;
}

function RiskFlag({
  symbol,
  account,
  entryPremium,
  enabled,
}: {
  symbol: string;
  account: BrokerAccount | null;
  entryPremium?: number;
  enabled: boolean;
}) {
  const { t } = useLocale();
  if (!enabled) {
    return <span className="text-[var(--muted)]">—</span>;
  }
  if (!account) {
    return (
      <span className="text-[10px] text-[var(--muted)]" title={t("strategies.capitalNeed")}>
        —
      </span>
    );
  }
  const sizing = sizeForSymbol(
    symbol,
    account.equity ?? 0,
    account.available_funds ?? account.cash_balance ?? 0,
    entryPremium,
  );
  const pct = formatPct(sizing.actualRiskPct);
  if (sizing.consider) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold text-[var(--ok)] bg-[var(--ok-soft)]"
        title={t("strategies.riskConsiderHint").replace("{pct}", pct)}
      >
        ⚑ {pct}%
      </span>
    );
  }
  return (
    <span
      className="text-[10px] tabular-nums text-[var(--muted)]"
      title={t("strategies.riskOtherHint").replace("{pct}", pct)}
    >
      {pct}%
    </span>
  );
}

function TosFlag({
  status,
  t,
}: {
  status: "open" | "working" | null;
  t: (key: string) => string;
}) {
  if (status === "open") {
    return (
      <span
        className="inline-flex rounded px-1 py-0.5 text-[10px] font-semibold text-[var(--ok)] bg-[var(--ok-soft)]"
        title={t("strategies.tosOpenHint")}
      >
        {t("strategies.tosOpen")}
      </span>
    );
  }
  if (status === "working") {
    return (
      <span
        className="inline-flex rounded px-1 py-0.5 text-[10px] font-semibold text-[var(--warn)] bg-[var(--warn-soft)]"
        title={t("strategies.tosWorkingHint")}
      >
        {t("strategies.tosWorking")}
      </span>
    );
  }
  return <span className="text-[10px] text-[var(--muted)]">—</span>;
}

type StrategiesDeskProps = {
  venue: Venue;
  autoScan?: boolean;
};

export function StrategiesDesk({ venue, autoScan = false }: StrategiesDeskProps) {
  const { t, locale } = useLocale();
  const books = useMemo(() => playbooksForVenue(venue), [venue]);
  const [selectedId, setSelectedId] = useState(books[0]?.id ?? "");
  const [timeframe, setTimeframe] = useState("15m");
  const [sessionDate, setSessionDate] = useState(() =>
    operativeSessionNyIso(new Date(), venue),
  );
  const [premarket, setPremarket] = useState(false);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [deskGroups, setDeskGroups] = useState<DeskConfluenceGroup[]>([]);
  const [deskNote, setDeskNote] = useState<string | null>(null);
  const [deskError, setDeskError] = useState<string | null>(null);
  /** Which TOP 5 row checkbox is on (one row); still loads that row's playbook into Focus. */
  const [deskFocusKey, setDeskFocusKey] = useState<string | null>(null);
  const deskFocusKeyRef = useRef<string | null>(null);
  const deskFocusPinnedRef = useRef(false);
  deskFocusKeyRef.current = deskFocusKey;
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [deskBusy, setDeskBusy] = useState(false);
  const [focusBusy, setFocusBusy] = useState(false);
  const [quietUntil, setQuietUntil] = useState(() =>
    typeof window === "undefined" ? 0 : readSchwabQuietUntil(),
  );
  const [nowTick, setNowTick] = useState(() => Date.now());
  const wasHeavyBrokerBusy = useRef(false);
  const deskBusyRef = useRef(false);
  const focusBusyRef = useRef(false);
  const deskEpochRef = useRef(0);
  const focusEpochRef = useRef(0);
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [autoLive, setAutoLive] = useState(false);
  const [autoDesk, setAutoDesk] = useState(false);
  const autoLiveRef = useRef(false);
  const autoDeskRef = useRef(false);
  autoLiveRef.current = autoLive;
  autoDeskRef.current = autoDesk;
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [brokerAccounts, setBrokerAccounts] = useState<BrokerAccount[]>([]);
  const [tosPositions, setTosPositions] = useState<BrokerPosition[]>([]);
  const [workingUnderlyings, setWorkingUnderlyings] = useState<Record<string, true>>(
    {},
  );
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [capitalNote, setCapitalNote] = useState<string | null>(null);
  const [capitalError, setCapitalError] = useState<string | null>(null);
  const [capitalPending, setCapitalPending] = useState(false);
  const [armOpens, setArmOpens] = useState(false);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const openFailed429Ref = useRef(false);
  const [listedExpRev, setListedExpRev] = useState(0);
  const runGen = useRef(0);
  const deskGen = useRef(0);

  const abortBrokerSync = useCallback(() => {
    // Stop further candle requests; leave busy until the in-flight call returns.
    runGen.current += 1;
    deskGen.current += 1;
  }, []);

  useEffect(() => {
    hydrateExpChainCache();
    if (Object.keys(listedExpirationSnapshot()).length) {
      setListedExpRev((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    // Trigger opens always starts off so Auto / Sync can run. Arm only when ready to send.
    setArmOpens(false);
    window.localStorage.setItem(ARM_OPENS_KEY, "0");
    setHoldTrader(false);
    const blockAuto = venue === "schwab" && isCashAutoOffNy();
    if (blockAuto || venue === "schwab") {
      // Options never auto-starts TOP 5 (landing or leftover localStorage).
      // The cash universe + multi-TF scan exceeds API Gateway ~29s.
      setAutoLive(false);
      setAutoDesk(false);
      window.localStorage.setItem(AUTO_LIVE_KEY, "0");
      window.localStorage.setItem(AUTO_DESK_KEY, "0");
      return;
    }
    const live = readAutoLive();
    const desk = readAutoDesk();
    // Prefer desk auto if both were left on from an older build
    if (live && desk) {
      window.localStorage.setItem(AUTO_LIVE_KEY, "0");
      setAutoLive(false);
      setAutoDesk(true);
    } else {
      setAutoLive(live);
      setAutoDesk(desk);
    }
  }, [venue]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setSessionDate(operativeSessionNyIso(now, venue));
      setPremarket(isPremarketOrClosedNy(now, venue));
      if (venue === "schwab" && isCashAutoOffNy(now)) {
        if (autoLiveRef.current || autoDeskRef.current) abortBrokerSync();
        autoLiveRef.current = false;
        autoDeskRef.current = false;
        setAutoLive(false);
        setAutoDesk(false);
        window.localStorage.setItem(AUTO_LIVE_KEY, "0");
        window.localStorage.setItem(AUTO_DESK_KEY, "0");
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [venue, abortBrokerSync]);

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

  const primaryAccount = useMemo(() => {
    if (brokerAccounts.length === 0) return null;
    return [...brokerAccounts].sort(
      (a, b) => (b.equity ?? 0) - (a.equity ?? 0),
    )[0];
  }, [brokerAccounts]);

  const capitalFetchedAt = useRef(0);

  const startSchwabQuiet = useCallback((ms = RATE_LIMIT_QUIET_MS) => {
    const until = extendSchwabQuiet(ms);
    setQuietUntil(until);
    setNowTick(Date.now());
  }, []);

  const loadCapital = useCallback(async (force = false) => {
    if (venue !== "schwab") return;
    if (!force) {
      const cached = readCapitalCache();
      if (cached) {
        capitalFetchedAt.current = cached.at;
        setBrokerAccounts(cached.accounts);
        setTradingEnabled(cached.tradingEnabled);
        setTosPositions(cached.positions ?? []);
        const best = [...cached.accounts].sort(
          (a, b) => (b.equity ?? 0) - (a.equity ?? 0),
        )[0];
        if (best) {
          setCapitalNote(
            t("strategies.capitalEquity")
              .replace("{eq}", moneyUsd(best.equity))
              .replace("{risk}", moneyUsd(best.risk_budget))
              .replace(
                "{cash}",
                moneyUsd(best.available_funds ?? best.cash_balance),
              ),
          );
        }
        setCapitalError(null);
        return;
      }
    }
    if (!SCHWAB_TRADER_READS) {
      setCapitalNote(t("strategies.capitalCacheOnly"));
      return;
    }
    setCapitalPending(true);
    setCapitalError(null);
    try {
      const res = await fetchBrokerPositions({ includeOrders: false });
      capitalFetchedAt.current = Date.now();
      const accounts = res.accounts ?? [];
      const positions = res.positions ?? [];
      const tradingOn = Boolean(res.trading_enabled);
      setBrokerAccounts(accounts);
      setTradingEnabled(tradingOn);
      setTosPositions(positions);
      writeCapitalCache(accounts, tradingOn, positions);
      setWorkingUnderlyings((prev) => {
        const next = { ...prev };
        for (const p of positions) {
          const u = (p.underlying || "").toUpperCase();
          if (u && Number(p.quantity) > 0) delete next[u];
        }
        return next;
      });
      const best = [...accounts].sort(
        (a, b) => (b.equity ?? 0) - (a.equity ?? 0),
      )[0];
      if (best) {
        setCapitalNote(
          t("strategies.capitalEquity")
            .replace("{eq}", moneyUsd(best.equity))
            .replace("{risk}", moneyUsd(best.risk_budget))
            .replace(
              "{cash}",
              moneyUsd(best.available_funds ?? best.cash_balance),
            ),
        );
      } else {
        setCapitalNote(t("strategies.capitalNeed"));
      }
      startSchwabQuiet(OPEN_QUIET_MS);
    } catch (err) {
      capitalFetchedAt.current = Date.now();
      setCapitalError(
        brokerErrorCopy(err, t("strategies.openFail"), t),
      );
      setCapitalNote(null);
    } finally {
      setCapitalPending(false);
    }
  }, [venue, t, startSchwabQuiet]);

  useEffect(() => {
    if (venue !== "schwab") return;
    // Cache only on landing — a live Schwab GET here 503s (~29s) and
    // used to look like a Desk TOP 5 timeout.
    const cached = readCapitalCache();
    if (cached) void loadCapital(false);
  }, [venue, loadCapital]);

  useEffect(() => {
    const sync = () => {
      setQuietUntil(readSchwabQuietUntil());
      setNowTick(Date.now());
    };
    sync();
    return subscribeSchwabQuiet(sync);
  }, []);

  useEffect(() => {
    if (venue !== "schwab") return;
    const heavy = deskBusy || focusBusy;
    if (wasHeavyBrokerBusy.current && !heavy) {
      startSchwabQuiet(OPEN_QUIET_MS);
    }
    wasHeavyBrokerBusy.current = heavy;
  }, [deskBusy, focusBusy, venue, startSchwabQuiet]);

  useEffect(() => {
    if (quietUntil <= Date.now()) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [quietUntil]);

  const quietRemainSec = Math.max(0, Math.ceil((quietUntil - nowTick) / 1000));
  const schwabBusy = deskBusy || focusBusy || quietRemainSec > 0;

  useEffect(() => {
    if (quietRemainSec > 0) return;
    if (openFailed429Ref.current) {
      openFailed429Ref.current = false;
      setOpenError(null);
      setOpenNote(t("strategies.openReadyRetry"));
    }
    setDeskError((prev) =>
      prev && /rate limit/i.test(prev) ? null : prev,
    );
  }, [quietRemainSec, t]);

  const openFromPlan = useCallback(
    async (
      plan: NonNullable<ReturnType<typeof buildOptionsEntryPlan>>,
      rowKey: string,
    ) => {
      if (!primaryAccount?.hashValue) {
        setOpenError(t("strategies.capitalNeed"));
        return;
      }
      if (!tradingEnabled) {
        setOpenError(t("strategies.openNeedTrading"));
        return;
      }
      if (!armOpens) {
        setOpenError(t("strategies.openNeedArm"));
        return;
      }
      if (!isCashRthNy()) {
        setOpenError(t("strategies.openNeedRth"));
        return;
      }
      if (deskBusy || focusBusy || quietRemainSec > 0) {
        setOpenError(
          quietRemainSec > 0
            ? t("strategies.openWaitQuiet").replace("{n}", String(quietRemainSec))
            : t("strategies.openWaitSync"),
        );
        return;
      }
      // One Schwab call only: POST BUY_TO_OPEN. Quote/exp GETs were 429-ing
      // before the order ever left, so Open looked "always busy".
      setOpenError(null);
      setOpenNote(null);
      const livePlan = plan;
      const sizing = sizeLongOption({
        entryPremium: livePlan.entryPremium,
        equity: primaryAccount.equity ?? 0,
        cashAvailable:
          primaryAccount.available_funds ?? primaryAccount.cash_balance ?? 0,
      });
      const overRisk = sizing.canOpen && !sizing.consider;
      if (!sizing.canOpen) {
        setOpenError(tooRichCopy(t, sizing));
        return;
      }
      const qty = sizing.contracts;
      const occ = buildOccOptionSymbol(
        livePlan.symbol,
        livePlan.expIso,
        livePlan.optionType,
        livePlan.strike,
      );
      setOpenNote(t("strategies.openConfirmLook"));
      const ok = window.confirm(
        overRisk
          ? t("strategies.openConfirmOverRisk")
              .replace("{px}", moneyUsd(livePlan.entryPremium))
              .replace("{cost}", moneyUsd(sizing.costPerContract))
              .replace("{pct}", formatPct(sizing.actualRiskPct))
              .replace("{eq}", moneyUsd(sizing.equity))
              .replace("{risk}", moneyUsd(sizing.riskBudget))
              .replace("{occ}", occ || "—")
          : t("strategies.openConfirm")
              .replace("{n}", String(qty))
              .replace("{sym}", livePlan.symbol)
              .replace("{type}", livePlan.optionType)
              .replace("{strike}", moneyUsd(livePlan.strike))
              .replace("{exp}", livePlan.expLabel)
              .replace("{px}", moneyUsd(livePlan.entryPremium))
              .replace("{cost}", moneyUsd(sizing.costPerContract * qty))
              .replace("{risk}", moneyUsd(sizing.riskBudget))
              .replace("{occ}", occ || "—"),
      );
      if (!ok) {
        setOpenNote(t("strategies.openCancelled"));
        return;
      }
      setOpeningKey(rowKey);
      setOpenError(null);
      setOpenNote(null);
      const payload = {
        account_hash: primaryAccount.hashValue,
        underlying: livePlan.symbol,
        option_type: livePlan.optionType,
        strike: livePlan.strike,
        exp_iso: livePlan.expIso,
        entry_premium: livePlan.entryPremium,
        quantity: qty,
        confirm_live: true as const,
        equity: primaryAccount.equity ?? 0,
        cash_available:
          primaryAccount.available_funds ?? primaryAccount.cash_balance ?? 0,
      };
      try {
        let res: Awaited<ReturnType<typeof brokerOpenOption>> | null = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            res = await brokerOpenOption(payload);
            break;
          } catch (err) {
            const raw = err instanceof Error ? err.message : t("strategies.openFail");
            if (isGatewayTimeout(err)) {
              setOpenError(t("strategies.openTimeoutMaybeSent"));
              return;
            }
            const rateLimited = isSchwabBusyErr(err);
            if (!rateLimited || attempt === 1) {
              if (rateLimited) {
                openFailed429Ref.current = true;
                setHoldTrader(true);
                startSchwabQuiet(OPEN_GIVE_UP_QUIET_MS);
                setOpenNote(null);
                setOpenError(
                  t("strategies.openNotSent429") +
                    " " +
                    t("strategies.openNotSent429Next"),
                );
              } else {
                setOpenError(raw);
              }
              return;
            }
            setHoldTrader(true);
            const waitSec = retryAfterSec(err, OPEN_RETRY_WAIT_SEC);
            startSchwabQuiet(waitSec * 1000);
            setOpenNote(null);
            for (let n = waitSec; n > 0; n -= 1) {
              setOpenError(
                t("strategies.openSendingWait").replace("{n}", String(n)),
              );
              await sleepMs(1000);
            }
            setOpenError(null);
            setOpenNote(t("strategies.openSendingNow"));
          }
        }
        if (!res) return;
        setArmOpens(false);
        window.localStorage.setItem(ARM_OPENS_KEY, "0");
        setHoldTrader(false);
        setWorkingUnderlyings((prev) => ({
          ...prev,
          [livePlan.symbol.toUpperCase()]: true,
        }));
        setOpenNote(
          t("strategies.openOkGoPositions")
            .replace("{sym}", res.option_symbol || livePlan.symbol)
            .replace("{id}", res.order_id || "—"),
        );
      } finally {
        setOpeningKey(null);
      }
    },
    [primaryAccount, tradingEnabled, armOpens, t, deskBusy, focusBusy, quietRemainSec, startSchwabQuiet],
  );

  useEffect(() => {
    if (!books.some((p) => p.id === selectedId)) {
      setSelectedId(books[0]?.id ?? "");
    }
  }, [books, selectedId]);

  const playbook = useMemo(() => {
    const raw = books.find((p) => p.id === selectedId) ?? books[0];
    return raw ? localizePlaybook(raw, locale) : undefined;
  }, [books, selectedId, locale]);

  const playbookGroups = useMemo(() => {
    const map = new Map<string, StrategyPlaybook[]>();
    for (const p of books) {
      const label = playbookGroupLabel(p, t);
      const list = map.get(label) ?? [];
      list.push(p);
      map.set(label, list);
    }
    return [...map.entries()].map(([label, items]) => ({ label, items }));
  }, [books, t]);

  const tfLocked = Boolean(playbook?.preferredTimeframe);
  const effectiveTf = playbook?.preferredTimeframe ?? timeframe;
  const syncTfs = useMemo(() => {
    if (playbook?.syncTimeframes?.length) return playbook.syncTimeframes;
    if (playbook?.preferredTimeframe) return [playbook.preferredTimeframe];
    return [effectiveTf];
  }, [playbook?.syncTimeframes, playbook?.preferredTimeframe, effectiveTf]);

  const venueInstruments = useMemo(() => {
    const filtered = instruments.filter((i) => i.data_provider === venue);
    if (venue === "tradeadvocate") {
      return sortFuturesInstruments(filtered);
    }
    return groupInstrumentsForVenue(filtered, "schwab").flatMap((g) => g.items);
  }, [instruments, venue]);

  const deskStrategyKeys = useMemo(
    () => scannableStrategyKeys(venue),
    [venue],
  );

  const universe = useMemo(() => {
    if (venueInstruments.length > 0) return venueInstruments;
    return FALLBACK_INSTRUMENTS.filter((i) => i.data_provider === venue);
  }, [venueInstruments, venue]);

  const deskUniverse = useMemo(() => {
    if (venue !== "schwab") return universe;
    return universe.filter(
      (i) => !DESK_FOCUS_ONLY.has(i.symbol.toUpperCase()),
    );
  }, [universe, venue]);

  useEffect(() => {
    setScan(null);
    setError(null);
    setSyncNote(null);
    setCheckedSteps({});
    if (playbook?.preferredTimeframe) {
      setTimeframe(playbook.preferredTimeframe);
    }
  }, [selectedId, venue, playbook?.preferredTimeframe]);

  async function syncUniverse(opts: {
    tfs: string[];
    lookback: number;
    gen: number;
    genRef: { current: number };
    endDay: string;
    items: Instrument[];
    forceRefresh: boolean;
    onProgress?: (done: number, total: number, label: string) => void;
  }) {
    const jobs: { inst: Instrument; tf: string }[] = [];
    for (const inst of opts.items) {
      if (inst.data_provider && inst.data_provider !== venue) continue;
      for (const tf of opts.tfs) {
        jobs.push({ inst, tf });
      }
    }
    let syncedBars = 0;
    let syncErrors = 0;
    let lastError = "";
    let done = 0;
    const total = jobs.length;
    const concurrency =
      venue === "schwab" ? 1 : Math.min(DESK_SYNC_CONCURRENCY, Math.max(1, total));

    const runOne = async (job: { inst: Instrument; tf: string }) => {
      if (opts.gen !== opts.genRef.current) return;
      const days = lookbackDaysForTf(job.tf, opts.lookback);
      const { start, end } = syncRangeIso(days);
      try {
        const res = await syncMarketData({
          ticker: job.inst.symbol,
          timeframe: job.tf,
          start,
          end,
          market_type: job.inst.market_type,
          force_refresh: opts.forceRefresh,
        });
        syncedBars += res.candles_count;
      } catch (err) {
        syncErrors += 1;
        lastError = err instanceof Error ? err.message : "sync failed";
      } finally {
        done += 1;
        opts.onProgress?.(
          done,
          total,
          `${job.inst.symbol} ${job.tf}`,
        );
      }
      if (venue === "schwab") await sleepMs(400);
    };

    for (let i = 0; i < jobs.length; i += concurrency) {
      if (opts.gen !== opts.genRef.current) return null;
      const chunk = jobs.slice(i, i + concurrency);
      const errorsBefore = syncErrors;
      await Promise.all(chunk.map(runOne));
      if (syncedBars === 0 && syncErrors > errorsBefore) {
        break;
      }
    }
    if (opts.gen !== opts.genRef.current) return null;
    return {
      syncedBars,
      syncErrors,
      lastError,
      symbolCount: opts.items.filter(
        (i) => !i.data_provider || i.data_provider === venue,
      ).length,
    };
  }

  const syncAndScan = useCallback(
    async (
      override?: StrategyPlaybook,
      opts?: {
        fromAuto?: boolean;
        skipDeskTfs?: boolean;
        items?: Instrument[];
      },
    ) => {
      const pb = override ?? playbook;
      if (!pb?.strategyKey) {
        setError(t("strategies.draftError"));
        setScan(null);
        return;
      }
      const day = operativeSessionNyIso(new Date(), venue);
      setSessionDate(day);
      const gen = ++runGen.current;
      const epoch = ++focusEpochRef.current;
      focusBusyRef.current = true;
      setFocusBusy(true);
      setError(null);
      setSyncNote(t("strategies.syncing"));
      try {
        const scanTf = pb.preferredTimeframe ?? timeframe;
        let tfs =
          pb.syncTimeframes?.length
            ? pb.syncTimeframes
            : pb.preferredTimeframe
              ? [pb.preferredTimeframe]
              : [scanTf];
        const deskTfs =
          venue === "tradeadvocate" ? DESK_SYNC_TFS_FUTURES : DESK_SYNC_TFS;
        if (opts?.skipDeskTfs) {
          tfs = tfs.filter(
            (tf) => !(deskTfs as readonly string[]).includes(tf),
          );
        }
        const lookback = pb.syncLookbackDays ?? 7;
        const items = opts?.items ?? universe;
        const forceRefresh = takeHardRefresh(day, Boolean(opts?.fromAuto));

        if (tfs.length > 0) {
          const synced = await syncUniverse({
            tfs,
            lookback,
            gen,
            genRef: runGen,
            endDay: day,
            items,
            forceRefresh,
            onProgress: (done, total, label) => {
              if (gen !== runGen.current) return;
              setSyncNote(
                t("strategies.syncProgress")
                  .replace("{done}", String(done))
                  .replace("{total}", String(total))
                  .replace("{label}", label),
              );
            },
          });
          if (!synced) return;
          setSyncNote(
            t("strategies.syncDone")
              .replace("{bars}", String(synced.syncedBars))
              .replace("{symbols}", String(synced.symbolCount))
              .replace("{errors}", String(synced.syncErrors)),
          );
        } else {
          setSyncNote(t("strategies.syncSkipped"));
        }

        const symbols = items
          .filter((i) => !i.data_provider || i.data_provider === venue)
          .map((i) => i.symbol);
        try {
          const res = await scanStrategiesBatched({
            strategies: [pb.strategyKey],
            timeframe: scanTf,
            session_date: day,
            data_provider: venue,
            symbols,
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
      } finally {
        if (focusEpochRef.current === epoch) {
          focusBusyRef.current = false;
          setFocusBusy(false);
        }
      }
    },
    [playbook, timeframe, universe, venue, t],
  );

  const runDeskTop5 = useCallback(
    async (opts?: { fromAuto?: boolean }) => {
      if (deskStrategyKeys.length === 0) {
        setDeskError(t("strategies.draftError"));
        return;
      }
      const day = operativeSessionNyIso(new Date(), venue);
      setSessionDate(day);
      const gen = ++deskGen.current;
      const epoch = ++deskEpochRef.current;
      deskBusyRef.current = true;
      setDeskBusy(true);
      setDeskError(null);
      setDeskNote(t("strategies.syncing"));
      const fromAuto = Boolean(opts?.fromAuto);
      const forceRefresh = takeHardRefresh(day, fromAuto);
      // First pass of the session day always syncs. Later Auto polls only scan
      // (re-downloading 4h/1h/15m/5m/1m × all symbols is what froze TOP 5).
      const needCandleSync = !fromAuto || !deskSyncedToday(day);
      try {
      if (needCandleSync) {
        const synced = await syncUniverse({
          tfs: [
            ...(venue === "tradeadvocate"
              ? DESK_SYNC_TFS_FUTURES
              : DESK_SYNC_TFS),
          ],
          lookback:
            venue === "tradeadvocate"
              ? DESK_LOOKBACK_FUTURES
              : DESK_LOOKBACK_DAYS,
          gen,
          genRef: deskGen,
          endDay: day,
          items: deskUniverse,
          forceRefresh,
          onProgress: (done, total, label) => {
            if (gen !== deskGen.current) return;
            setDeskNote(
              t("strategies.syncProgress")
                .replace("{done}", String(done))
                .replace("{total}", String(total))
                .replace("{label}", label),
            );
          },
        });
        if (!synced) {
          if (deskGen.current !== gen) {
            setDeskNote(t("strategies.syncAborted"));
          }
          return;
        }
        if (synced.syncedBars === 0 && synced.syncErrors > 0) {
          setAutoDesk(false);
          window.localStorage.setItem(AUTO_DESK_KEY, "0");
          setDeskError(
            t("strategies.syncAllFailed").replace(
              "{error}",
              synced.lastError || "sync failed",
            ),
          );
          setDeskNote(null);
          return;
        }
        markDeskSyncedToday(day);

        setDeskNote(
          t("strategies.syncDone")
            .replace("{bars}", String(synced.syncedBars))
            .replace("{symbols}", String(synced.symbolCount))
            .replace("{errors}", String(synced.syncErrors)),
        );
      } else {
        setDeskNote(t("strategies.deskScanningOnly"));
      }

      try {
        const allHits: ScanHit[] = [];
        const allMatches: ScanHit[] = [];
        const symbols = deskUniverse
          .filter((i) => !i.data_provider || i.data_provider === venue)
          .map((i) => i.symbol);
        for (let i = 0; i < deskStrategyKeys.length; i += DESK_STRATEGY_CHUNK) {
          if (gen !== deskGen.current) return;
          const chunk = deskStrategyKeys.slice(i, i + DESK_STRATEGY_CHUNK);
          const res = await scanStrategiesBatched(
            {
              strategies: chunk,
              timeframe: "1h",
              session_date: day,
              data_provider: venue,
              symbols,
              // Futures: keep watching/no_data so an empty TOP 5 can say why.
              matches_only: venue !== "tradeadvocate",
            },
            venue === "tradeadvocate"
              ? DESK_SCAN_SYMBOL_BATCH_FUTURES
              : DESK_SCAN_SYMBOL_BATCH,
          );
          for (const hit of res.hits) {
            allHits.push(hit);
            if (hit.matched) allMatches.push(hit);
          }
        }
        if (gen !== deskGen.current) return;
        const now = new Date();
        const overnight = venue === "tradeadvocate" && isFuturesOvernightNy(now);
        const globexClosed = venue === "tradeadvocate" && !isGlobexOpenNy(now);
        let ranked = rankByConfluence(allMatches, DESK_TOP_N);
        if (venue === "tradeadvocate") {
          ranked = padWithWatchingCandidates(ranked, allHits, DESK_TOP_N);
        }
        setDeskGroups(ranked);
        const strategyHits = ranked.reduce(
          (n, g) => n + (g.candidate ? 0 : g.confluence),
          0,
        );
        const watchPad = ranked.filter((g) => g.candidate).length;
        const noData = allHits.filter((h) => h.status === "no_data").length;
        const checked = allHits.length || allMatches.length;
        if (globexClosed) {
          setDeskNote(t("strategies.deskTopEmptyGlobexClosed"));
        } else if (ranked.length === 0 && noData > 0) {
          setDeskNote(
            t("strategies.deskTopEmptyNoData")
              .replace("{nodata}", String(noData))
              .replace("{checked}", String(checked))
              .replace("{session}", day),
          );
        } else if (overnight && ranked.length === 0) {
          setDeskNote(
            t("strategies.deskTopEmptyOvernight")
              .replace("{checked}", String(checked))
              .replace("{when}", formatNyDateTime(now, locale)),
          );
        } else if (ranked.length > 0 && strategyHits === 0 && watchPad > 0) {
          setDeskNote(
            t("strategies.deskTopWatchingOnly")
              .replace("{n}", String(watchPad))
              .replace("{checked}", String(checked))
              .replace("{when}", formatNyDateTime(now, locale)),
          );
        } else {
          setDeskNote(
            t(
              overnight
                ? "strategies.deskTopSummaryOvernight"
                : "strategies.deskTopSummary",
            )
              .replace("{n}", String(ranked.length))
              .replace("{hits}", String(strategyHits))
              .replace("{session}", day)
              .replace("{when}", formatNyDateTime(now, locale)),
          );
        }

        const firstHit = ranked[0]?.hits[0];
        const focusPb = firstHit
          ? playbookByStrategyKey(firstHit.strategy)
          : undefined;
        const pinnedKey = deskFocusPinnedRef.current
          ? deskFocusKeyRef.current
          : null;
        const pinnedStillThere = Boolean(
          pinnedKey &&
            ranked.some((g) =>
              g.hits.some((h) => `${h.symbol}::${h.strategy}` === pinnedKey),
            ),
        );
        if (pinnedStillThere) {
          // User picked a TOP 5 row — Auto / refresh must not steal the playbook.
        } else if (firstHit && focusPb?.strategyKey) {
          deskFocusPinnedRef.current = false;
          setDeskFocusKey(`${firstHit.symbol}::${firstHit.strategy}`);
          setSelectedId(focusPb.id);
          if (gen !== deskGen.current) return;
          // Options: do not Focus-sync the whole universe after TOP 5 — that
          // second Schwab blast is what 429s the Open POST.
          // Futures Auto: skip Focus re-sync (would restart the slow loop).
          // Manual: Focus only the winning symbol, not the full book.
          if (!armOpens && venue !== "schwab" && !fromAuto) {
            const focusItems = universe.filter(
              (i) => i.symbol.toUpperCase() === firstHit.symbol.toUpperCase(),
            );
            await syncAndScan(focusPb, {
              fromAuto,
              skipDeskTfs: true,
              items: focusItems.length ? focusItems : universe.slice(0, 1),
            });
          }
        } else {
          deskFocusPinnedRef.current = false;
          setDeskFocusKey(null);
        }
      } catch (err) {
        if (gen !== deskGen.current) return;
        const copy = brokerErrorCopy(err, "Desk scan failed", t);
        if (/rate limit/i.test(copy)) startSchwabQuiet();
        setDeskError(copy);
        setDeskGroups([]);
      }
      } finally {
        if (deskEpochRef.current === epoch) {
          deskBusyRef.current = false;
          setDeskBusy(false);
        }
      }
    },
    [deskStrategyKeys, deskUniverse, universe, venue, t, locale, syncAndScan, armOpens, startSchwabQuiet],
  );

  const runSyncAndScan = useCallback(() => {
    if (focusBusyRef.current) return;
    void syncAndScan();
  }, [syncAndScan]);

  const runDeskScan = useCallback(() => {
    if (deskBusyRef.current) return;
    void runDeskTop5({ fromAuto: false });
  }, [runDeskTop5]);

  const landedScanKey = useRef<string>("");
  useEffect(() => {
    if (!autoScan || armOpens) return;
    if (deskStrategyKeys.length === 0 || deskUniverse.length === 0) return;
    if (venue === "schwab") return;
    setAutoLive(false);
    window.localStorage.setItem(AUTO_LIVE_KEY, "0");
    setAutoDesk(true);
    window.localStorage.setItem(AUTO_DESK_KEY, "1");
    const key = venue;
    if (landedScanKey.current === key) return;
    const id = window.setTimeout(() => {
      landedScanKey.current = key;
      if (deskBusyRef.current || focusBusyRef.current) return;
      void runDeskTop5({ fromAuto: false });
    }, 450);
    return () => window.clearTimeout(id);
  }, [
    autoScan,
    armOpens,
    deskStrategyKeys.length,
    deskUniverse.length,
    venue,
    runDeskTop5,
  ]);

  const autoBlocked = venue === "schwab" && isCashAutoOffNy();

  function toggleAutoLive() {
    setAutoLive((prev) => {
      const next = !prev;
      if (next && venue === "schwab" && isCashAutoOffNy()) return false;
      window.localStorage.setItem(AUTO_LIVE_KEY, next ? "1" : "0");
      // Only one auto at a time — TOP 5 + Focus together doubles broker sync
      if (next) {
        setAutoDesk(false);
        window.localStorage.setItem(AUTO_DESK_KEY, "0");
      }
      return next;
    });
  }

  function toggleAutoDesk() {
    setAutoDesk((prev) => {
      const next = !prev;
      if (next && venue === "schwab" && isCashAutoOffNy()) return false;
      window.localStorage.setItem(AUTO_DESK_KEY, next ? "1" : "0");
      if (next) {
        setAutoLive(false);
        window.localStorage.setItem(AUTO_LIVE_KEY, "0");
      }
      return next;
    });
  }

  useEffect(() => {
    return () => {
      // Leaving the tab aborts in-flight desk/focus work so remount is not stuck.
      deskGen.current += 1;
      runGen.current += 1;
      deskBusyRef.current = false;
      focusBusyRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!autoLive || armOpens || autoBlocked || !playbook?.strategyKey) return;
    const kickoff = window.setTimeout(() => {
      if (deskBusyRef.current || focusBusyRef.current) return;
      void syncAndScan(undefined, { fromAuto: true });
    }, 400);
    const id = window.setInterval(() => {
      if (deskBusyRef.current || focusBusyRef.current) return;
      void syncAndScan(undefined, { fromAuto: true });
    }, AUTO_LIVE_MS);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(id);
    };
  }, [autoLive, armOpens, autoBlocked, playbook?.strategyKey, playbook?.id, venue, syncAndScan]);

  useEffect(() => {
    if (!autoDesk || armOpens || autoBlocked || deskStrategyKeys.length === 0) return;
    const kickoff = window.setTimeout(() => {
      if (deskBusyRef.current || focusBusyRef.current) return;
      void runDeskTop5({ fromAuto: true });
    }, 400);
    const id = window.setInterval(() => {
      if (deskBusyRef.current || focusBusyRef.current) return;
      void runDeskTop5({ fromAuto: true });
    }, AUTO_LIVE_MS);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(id);
    };
  }, [autoDesk, armOpens, autoBlocked, deskStrategyKeys.length, venue, runDeskTop5]);

  const matches = useMemo(
    () => sortScanBoard((scan?.hits ?? []).filter((h) => h.matched)),
    [scan],
  );
  const board = useMemo(() => sortScanBoard(scan?.hits ?? []), [scan]);

  const planFor = (
    symbol: string,
    side: string | null | undefined,
    price: number | string | null | undefined,
  ) => {
    void listedExpRev;
    return buildOptionsEntryPlan(
      symbol,
      side,
      price,
      new Date(),
      planCapital(primaryAccount),
    );
  };

  const tosFlag = (symbol: string): "open" | "working" | null => {
    const u = symbol.trim().toUpperCase();
    if (
      tosPositions.some(
        (p) =>
          (p.underlying || "").toUpperCase() === u && Number(p.quantity) > 0,
      )
    ) {
      return "open";
    }
    if (workingUnderlyings[u]) return "working";
    return null;
  };

  function toggleStep(id: string) {
    setCheckedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const titleKey = "strategies.title";
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
    <DeskStack>
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <div className="mr-auto min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{t(titleKey)}</h2>
          <p className="text-[11px] text-[var(--muted)]">
            {t(dataViaKey)} · {t("strategies.howToUse")}
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
          {t("strategies.sessionDate")}
          <div
            className={`${field} w-auto min-w-[11rem] truncate opacity-90`}
            title={
              premarket
                ? venue === "tradeadvocate"
                  ? t("strategies.globexClosedHint")
                  : t("strategies.premarketHint")
                : `${sessionDate} (${
                    venue === "tradeadvocate"
                      ? t("strategies.sessionAutoFutures")
                      : t("strategies.sessionAuto")
                  })`
            }
          >
            {sessionDate}{" "}
            <span className="text-[10px]">
              (
              {premarket
                ? venue === "tradeadvocate"
                  ? t("strategies.globexClosedBadge")
                  : t("strategies.premarketBadge")
                : venue === "tradeadvocate"
                  ? t("strategies.sessionAutoFutures")
                  : t("strategies.sessionAuto")}
              )
            </span>
          </div>
        </label>
        <span className="inline-flex h-6 min-w-[7.5rem] items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          {venue === "schwab" ? t("about.modeOptions") : t("about.modeFutures")}
        </span>
      </div>

      {venue === "schwab" ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
                {t("strategies.capitalTitle")}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                {t("strategies.capitalHintTos")}
              </p>
            </div>
            <button
              type="button"
              disabled={capitalPending || quietRemainSec > 0}
              onClick={() => void loadCapital(true)}
              title={
                quietRemainSec > 0
                  ? t("strategies.openWaitQuiet").replace(
                      "{n}",
                      String(quietRemainSec),
                    )
                  : undefined
              }
              className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium hover:bg-[var(--hover)] disabled:opacity-50"
            >
              {capitalPending
                ? t("strategies.capitalLoading")
                : t("strategies.capitalLoad")}
            </button>
          </div>
          {capitalNote ? (
            <p className="mt-1.5 text-[12px] font-medium text-[var(--foreground)]">
              {capitalNote}
            </p>
          ) : null}
          {capitalError ? (
            <p className="mt-1 text-[11px] text-[var(--danger)]">{capitalError}</p>
          ) : null}
          {!tradingEnabled && brokerAccounts.length > 0 ? (
            <p className="mt-1 text-[11px] text-[var(--warn)]">
              {t("strategies.openNeedTrading")}
            </p>
          ) : null}
          {DESK_OPENS_ENABLED ? (
          <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-[11px] leading-snug">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
              checked={armOpens}
              onChange={(e) => {
                const on = e.target.checked;
                setArmOpens(on);
                window.localStorage.setItem(ARM_OPENS_KEY, on ? "1" : "0");
                if (on) {
                  abortBrokerSync();
                  setAutoDesk(false);
                  setAutoLive(false);
                  window.localStorage.setItem(AUTO_DESK_KEY, "0");
                  window.localStorage.setItem(AUTO_LIVE_KEY, "0");
                  setHoldTrader(true);
                } else {
                  setHoldTrader(false);
                }
              }}
            />
            <span>
              <span className="font-semibold text-[var(--foreground)]">
                {t("strategies.armOpens")}
              </span>
              <span className="mt-0.5 block text-[var(--muted)]">
                {t("strategies.armOpensBody")}
              </span>
            </span>
          </label>
          ) : (
            <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">
              {t("strategies.opensPausedNote")}
            </p>
          )}
          {openNote ? (
            <p className="mt-1.5 text-[11px] text-[var(--ok)]">{openNote}</p>
          ) : null}
          {openError ? (
            <p className="mt-1 text-[11px] text-[var(--danger)]">{openError}</p>
          ) : quietRemainSec > 0 ? (
            <p className="mt-1 text-[11px] text-[var(--danger)]">
              {t("strategies.openWaitQuiet").replace(
                "{n}",
                String(quietRemainSec),
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      <DeskSession
        first
        step={1}
        title={t("session.deskTop5")}
        hint={
          venue === "tradeadvocate"
            ? t("session.deskTop5HintFutures")
            : t("session.deskTop5Hint")
        }
        actions={
          <>
            <button
              type="button"
              disabled={
                deskBusy ||
                deskStrategyKeys.length === 0 ||
                Boolean(openingKey) ||
                armOpens ||
                quietRemainSec > 0
              }
              onClick={runDeskScan}
              className="shrink-0 cursor-pointer rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deskBusy
                ? t("strategies.deskTopScanning")
                : t("strategies.deskTopScan")}
            </button>
            <button
              type="button"
              disabled={deskStrategyKeys.length === 0 || armOpens || autoBlocked}
              onClick={toggleAutoDesk}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                autoDesk
                  ? "border border-[var(--ok)] text-[var(--ok)]"
                  : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--hover)]"
              }`}
              title={
                autoBlocked
                  ? t("strategies.autoOffSession")
                  : armOpens
                    ? t("strategies.armPausesAuto")
                    : venue === "tradeadvocate"
                      ? t("strategies.deskAutoHintFutures")
                      : t("strategies.deskAutoHint")
              }
            >
              {autoDesk ? t("strategies.autoStop") : t("strategies.autoStart")}
            </button>
          </>
        }
      >
        {deskNote ? (
          <p className="text-[11px] text-[var(--muted)]">{deskNote}</p>
        ) : (
          <p className="text-[11px] text-[var(--muted)]">
            {t(
              venue === "tradeadvocate"
                ? "strategies.deskTopHintFutures"
                : "strategies.deskTopHint",
            )}
          </p>
        )}
        {deskError ? (
          <div className="mt-2 rounded-md border border-red-200 bg-[var(--danger-soft)] px-3 py-1.5 text-xs text-[var(--danger)]">
            {deskError}
          </div>
        ) : null}
        {premarket && deskGroups.length > 0 ? (
          <div className="mt-2 rounded-md border border-amber-300/60 bg-[var(--warn-soft)] px-3 py-2 text-[11px] leading-snug text-[var(--warn)]">
            {t("strategies.priorSessionBanner")}
          </div>
        ) : null}
        {deskGroups.length > 0 ? (
          <div className="mt-2 overflow-auto rounded-lg border border-[var(--border)]">
            <p className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1.5 text-[10px] text-[var(--muted)]">
              {t("strategies.focusHint")}
            </p>
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--surface-muted)] text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-1.5 font-medium">{t("strategies.colRisk")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("strategies.colFocus")}</th>
                  <th className="px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium">
                    {t("strategies.colSymbol")}
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    {t("strategies.colTos")}
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    {t("strategies.colConfluence")}
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
                  <th className="px-2 py-1.5 font-medium">
                    {t("strategies.colSignalAt")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {deskGroups.map((group, gi) =>
                  group.hits.map((hit, hi) => {
                    const pb = playbookByStrategyKey(hit.strategy);
                    const side = hit.last_signal?.side;
                    const rowKey = `${hit.symbol}::${hit.strategy}`;
                    const focused = deskFocusKey === rowKey;
                    const isFirst = hi === 0;
                    return (
                      <tr
                        key={`${hit.symbol}-${hit.strategy}-top`}
                        className={`border-t border-[var(--border)] ${
                          focused
                            ? "bg-[var(--ok-soft)]/40"
                            : isFirst
                              ? "bg-[var(--surface)]"
                              : "bg-[var(--surface-muted)]/40"
                        }`}
                      >
                        <td className="px-2 py-1.5">
                          {isFirst ? (
                            <RiskFlag
                              symbol={hit.symbol}
                              account={primaryAccount}
                              entryPremium={
                                venue === "schwab" && hit.last_signal
                                  ? (planFor(
                                      hit.symbol,
                                      hit.last_signal.side,
                                      hit.last_signal.price,
                                    )?.entryPremium ?? undefined)
                                  : undefined
                              }
                              enabled={venue === "schwab"}
                            />
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                            checked={focused}
                            disabled={!pb}
                            title={t("strategies.focusHint")}
                            aria-label={
                              pb
                                ? `${hit.symbol} · ${localizedPlaybookLabel(pb, locale)}`
                                : `${hit.symbol} · ${hit.strategy}`
                            }
                            onChange={() => {
                              if (!pb) return;
                              const nextKey = rowKey;
                              deskFocusPinnedRef.current = true;
                              deskFocusKeyRef.current = nextKey;
                              setDeskFocusKey(nextKey);
                              setSelectedId(pb.id);
                              if (armOpens) return;
                              const focusItems = universe.filter(
                                (i) =>
                                  i.symbol.toUpperCase() ===
                                  hit.symbol.toUpperCase(),
                              );
                              void syncAndScan(pb, {
                                skipDeskTfs: true,
                                items: focusItems.length
                                  ? focusItems
                                  : universe.slice(0, 1),
                              });
                            }}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-[var(--muted)]">
                          {isFirst ? gi + 1 : ""}
                        </td>
                        <td className="px-2 py-1.5 font-semibold">
                          {isFirst ? hit.symbol : ""}
                        </td>
                        <td className="px-2 py-1.5">
                          {isFirst ? (
                            <TosFlag
                              status={tosFlag(hit.symbol)}
                              t={t}
                            />
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5">
                          {isFirst ? (
                            <span className="inline-flex flex-col gap-0.5">
                              {group.candidate ? (
                                <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-[var(--warn-soft)] text-[var(--warn)]">
                                  {t("strategies.confluenceWatching")}
                                </span>
                              ) : (
                                <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-[var(--accent-soft)] text-[var(--accent-fg)]">
                                  {t("strategies.confluenceCount")
                                    .replace("{n}", String(group.confluence))
                                    .replace(
                                      "{side}",
                                      group.side === "long" ? "CALL" : "PUT",
                                    )}
                                </span>
                              )}
                              {group.opposedCount > 0 ? (
                                <span className="text-[9px] text-[var(--muted)]">
                                  {t("strategies.confluenceOpposed").replace(
                                    "{n}",
                                    String(group.opposedCount),
                                  )}
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 font-medium text-[var(--foreground)]">
                          {pb
                            ? localizedPlaybookLabel(pb, locale)
                            : hit.strategy}
                        </td>
                        <td className="px-2 py-1.5 uppercase text-[var(--muted)]">
                          {side === "long"
                            ? "CALL"
                            : side === "short"
                              ? "PUT"
                              : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--muted)]">
                          <div className="space-y-0.5">
                            <div>{hit.last_signal?.reason ?? hit.detail}</div>
                            {venue === "schwab" && hit.last_signal ? (
                              (() => {
                                const plan = planFor(
                                  hit.symbol,
                                  hit.last_signal.side,
                                  hit.last_signal.price,
                                );
                                if (!plan) return null;
                                const rowOpenKey = `${hit.symbol}::${hit.strategy}::open`;
                                return (
                                  <div className="space-y-1 text-[10px] leading-snug text-[var(--foreground)]">
                                    <div>
                                      {plan.optionType} strike ≈ {plan.strike}
                                      {plan.strike !== plan.atmStrike
                                        ? ` (ATM ${plan.atmStrike})`
                                        : ""}
                                      {` · Exp ${plan.expLabel}${plan.expIsToday ? " (hoy)" : ""}`}
                                      {` · debit $${plan.entryPremium}`}
                                      {plan.hasRange
                                        ? ` · óptimo ${plan.rangeLabel} · TP 10/20/35/50/100: $${plan.tp10}/$${plan.tp20}/$${plan.tp35}/$${plan.tp50}/$${plan.tp100}`
                                        : ""}
                                    </div>
                                    <OpenPlanButton
                                      plan={plan}
                                      rowKey={rowOpenKey}
                                      account={primaryAccount}
                                      tradingEnabled={tradingEnabled}
                                      armOpens={armOpens}
                                      brokerBusy={schwabBusy}
                                      busyTitle={
                                        quietRemainSec > 0
                                          ? t("strategies.openWaitQuiet").replace(
                                              "{n}",
                                              String(quietRemainSec),
                                            )
                                          : t("strategies.openWaitSync")
                                      }
                                      opening={openingKey === rowOpenKey}
                                      onOpen={
                                        DESK_OPENS_ENABLED
                                          ? openFromPlan
                                          : undefined
                                      }
                                    />
                                  </div>
                                );
                              })()
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-[var(--muted)]">
                          {hit.last_signal?.timestamp
                            ? formatNyDateTime(
                                hit.last_signal.timestamp,
                                locale,
                              )
                            : "—"}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        ) : !deskBusy && !deskNote ? (
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            {t(
              premarket
                ? "strategies.deskTopEmptyPremarket"
                : "strategies.deskTopEmpty",
            )}
          </p>
        ) : null}
      </DeskSession>

      <DeskSession
        step={2}
        title={t("session.focusScan")}
        hint={t("session.focusScanHint")}
        actions={
          <>
            <button
              type="button"
              disabled={
                focusBusy ||
                !playbook.strategyKey ||
                Boolean(openingKey) ||
                armOpens ||
                quietRemainSec > 0
              }
              onClick={runSyncAndScan}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {focusBusy ? t("strategies.syncScanning") : t("strategies.syncAndScan")}
            </button>
            <button
              type="button"
              disabled={!playbook.strategyKey || armOpens || autoBlocked}
              onClick={toggleAutoLive}
              className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                autoLive
                  ? "border border-[var(--ok)] text-[var(--ok)]"
                  : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--hover)]"
              }`}
              title={
                autoBlocked
                  ? t("strategies.autoOffSession")
                  : armOpens
                    ? t("strategies.armPausesAuto")
                    : t("strategies.autoHint")
              }
            >
              {autoLive ? t("strategies.autoStop") : t("strategies.autoStart")}
            </button>
          </>
        }
      >
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[14rem] max-w-md flex-1 space-y-0.5 text-[11px] text-[var(--muted)]">
            {t("strategies.playbook")}
            <select
              className={field}
              value={playbook.id}
              onChange={(e) => {
                deskFocusPinnedRef.current = false;
                setSelectedId(e.target.value);
                setDeskFocusKey(null);
              }}
              title={localizedPlaybookLabel(playbook, locale)}
            >
              {playbookGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {localizedPlaybookLabel(p, locale)}
                      {p.strategyKey ? "" : ` (${t("strategies.draftShort")})`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {!tfLocked ? (
            <label className="w-[5.5rem] space-y-0.5 text-[11px] text-[var(--muted)]">
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
          ) : null}
          <p className="pb-2 text-[11px] text-[var(--muted)]">
            {t("session.pickPlaybookHint")}
          </p>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
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
          <span className="text-[10px] text-[var(--muted)]">
            {t(
              venue === "schwab"
                ? "strategies.syncHint"
                : "strategies.syncHintFutures",
            ).replace("{tfs}", syncTfs.join(" + "))}
          </span>
        </div>

        {syncNote ? (
          <p className="text-[11px] text-[var(--muted)]">{syncNote}</p>
        ) : null}

        {error ? (
          <div className="mt-2 rounded-md border border-red-200 bg-[var(--danger-soft)] px-3 py-1.5 text-xs text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        {scan ? (
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            {(premarket
              ? t("strategies.priorSessionSummary")
              : t("strategies.scanSummary")
            )
              .replace("{session}", scan.session_date || sessionDate)
              .replace("{when}", formatNyDateTime(scan.scanned_at, locale))
              .replace("{matches}", String(scan.match_count))
              .replace("{checked}", String(scan.total_checked))}
          </p>
        ) : null}

        {premarket && matches.length > 0 ? (
          <div className="mt-2 rounded-md border border-amber-300/60 bg-[var(--warn-soft)] px-3 py-2 text-[11px] leading-snug text-[var(--warn)]">
            {t("strategies.priorSessionBanner")}
          </div>
        ) : null}

        {matches.length > 0 ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((hit) => (
              <HitCard
                key={`${hit.symbol}-${hit.strategy}`}
                hit={hit}
                priorSession={premarket}
                showOptionsPlan={venue === "schwab"}
                account={primaryAccount}
                tradingEnabled={tradingEnabled}
                armOpens={armOpens}
                brokerBusy={schwabBusy}
                busyTitle={
                  quietRemainSec > 0
                    ? t("strategies.openWaitQuiet").replace(
                        "{n}",
                        String(quietRemainSec),
                      )
                    : t("strategies.openWaitSync")
                }
                openingKey={openingKey}
                onOpen={DESK_OPENS_ENABLED ? openFromPlan : undefined}
              />
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
                  <th className="px-2 py-1.5 font-medium">{t("strategies.colRisk")}</th>
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
                    <td className="px-2 py-1">
                      <RiskFlag
                        symbol={hit.symbol}
                        account={primaryAccount}
                        entryPremium={
                          venue === "schwab" && hit.last_signal
                            ? (planFor(
                                hit.symbol,
                                hit.last_signal.side,
                                hit.last_signal.price,
                              )?.entryPremium ?? undefined)
                            : undefined
                        }
                        enabled={venue === "schwab"}
                      />
                    </td>
                    <td className="px-2 py-1 font-medium">{hit.symbol}</td>
                    <td className="px-2 py-1">
                      {(() => {
                        const pb = playbookByStrategyKey(hit.strategy);
                        return pb
                          ? localizedPlaybookLabel(pb, locale)
                          : hit.strategy;
                      })()}
                    </td>
                    <td className="px-2 py-1 text-[var(--muted)]">
                      {providerLabel(hit.data_provider)}
                    </td>
                    <td className="px-2 py-1">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${statusStyle(hit.status, premarket)}`}
                      >
                        {displayScanStatus(hit.status, premarket, t)}
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
      </DeskSession>

      <DeskSession
        step={3}
        title={t("session.playbook")}
        hint={t("session.playbookHint")}
        panel={false}
      >
        <div className="space-y-3">
          <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">
                <span className="text-[var(--accent)]">{playbook.shortName}</span>
                <span className="text-[var(--muted)]"> · </span>
                {localizedPlaybookName(playbook, locale)}
              </h3>
              <p className="text-[12px] leading-snug text-[var(--muted)]">
                {playbook.summary}
              </p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                {playbook.markets} · {playbook.sessionWindow}
              </p>
            </div>
          </header>

          {playbook.setupImage ? (
            <figure className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <figcaption className="border-b border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]">
                {t("strategies.setup")} ·{" "}
                {localizedPlaybookLabel(playbook, locale)}
              </figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={playbook.setupImage}
                alt={`${t("strategies.setup")} ${localizedPlaybookLabel(playbook, locale)}`}
                className="h-auto w-full object-contain bg-[var(--surface-muted)]"
              />
            </figure>
          ) : null}
        </div>
      </DeskSession>

      <DeskSession
        step={4}
        title={t("session.checklist")}
        hint={t("session.checklistHint")}
        panel={false}
      >
        <PlaybookRules
          playbook={playbook}
          checked={checkedSteps}
          onToggle={toggleStep}
          t={t}
        />
      </DeskSession>
    </DeskStack>
  );
}

function playbookGroupLabel(
  p: StrategyPlaybook,
  t: (key: string) => string,
): string {
  if (p.group === "Maylels" || p.id.startsWith("ml"))
    return t("strategies.groupMaylels");
  if (p.group?.startsWith("BB") || p.id.startsWith("e"))
    return t("strategies.groupBb");
  if (p.group?.startsWith("Creando") || p.id.startsWith("cr"))
    return t("strategies.groupCr");
  return t("strategies.groupOther");
}

function PlaybookRules({
  playbook,
  checked,
  onToggle,
  t,
}: {
  playbook: StrategyPlaybook;
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      <RuleBlock
        title={t("strategies.entry")}
        items={playbook.entrySteps}
        checked={checked}
        onToggle={onToggle}
      />
      <RuleBlock
        title={t("strategies.exits")}
        items={playbook.exitSteps}
        checked={checked}
        onToggle={onToggle}
      />

      <div className="space-y-2 xl:col-span-1 lg:col-span-2 xl:col-auto">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-3 py-1.5">
              <h4 className="text-xs font-semibold">{t("strategies.risk")}</h4>
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
              <h4 className="text-xs font-semibold">
                {t("strategies.invalidation")}
              </h4>
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
          {t("strategies.byTimeframe")}
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

function HitCard({
  hit,
  priorSession = false,
  showOptionsPlan = false,
  account = null,
  tradingEnabled = false,
  armOpens = false,
  brokerBusy = false,
  busyTitle,
  openingKey = null,
  onOpen,
}: {
  hit: ScanHit;
  priorSession?: boolean;
  showOptionsPlan?: boolean;
  account?: BrokerAccount | null;
  tradingEnabled?: boolean;
  armOpens?: boolean;
  brokerBusy?: boolean;
  busyTitle?: string;
  openingKey?: string | null;
  onOpen?: (
    plan: NonNullable<ReturnType<typeof buildOptionsEntryPlan>>,
    rowKey: string,
  ) => void;
}) {
  const { locale, t } = useLocale();
  const pb = playbookByStrategyKey(hit.strategy);
  const strategyLabel = pb
    ? localizedPlaybookLabel(pb, locale)
    : hit.strategy;
  const signalAt = hit.last_signal?.timestamp
    ? formatNyDateTime(hit.last_signal.timestamp, locale)
    : null;
  const plan =
    showOptionsPlan && hit.last_signal
      ? buildOptionsEntryPlan(
          hit.symbol,
          hit.last_signal.side,
          hit.last_signal.price,
          new Date(),
          planCapital(account),
        )
      : null;
  const rowKey = `${hit.symbol}::${hit.strategy}::open`;
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        priorSession
          ? "border-amber-300/50 bg-[var(--warn-soft)]"
          : "border-emerald-200/40 bg-[var(--ok-soft)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{hit.symbol}</p>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] ${statusStyle(hit.status, priorSession)}`}
        >
          {displayScanStatus(hit.status, priorSession, t)}
        </span>
      </div>
      {priorSession ? (
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--warn)]">
          {t("strategies.priorSessionBadge")}
        </p>
      ) : null}
      <p className="text-[11px] text-[var(--muted)]">
        {strategyLabel} · {hit.name} · {providerLabel(hit.data_provider)}
      </p>
      {signalAt ? (
        <p className="mt-0.5 text-[10px] font-medium text-[var(--muted)]">
          {t("strategies.signalAt")} {signalAt} ET
        </p>
      ) : null}
      <p className="mt-1 text-[12px] leading-snug text-[var(--muted)]">
        {hit.detail}
      </p>
      {plan ? (
        <OptionsPlanBlock
          plan={plan}
          account={account}
          tradingEnabled={tradingEnabled}
          armOpens={armOpens}
          brokerBusy={brokerBusy}
          busyTitle={busyTitle}
          opening={openingKey === rowKey}
          onOpen={onOpen}
          rowKey={rowKey}
        />
      ) : null}
    </div>
  );
}

function OpenPlanButton({
  plan,
  rowKey,
  account,
  tradingEnabled,
  armOpens,
  brokerBusy = false,
  busyTitle,
  opening,
  onOpen,
}: {
  plan: NonNullable<ReturnType<typeof buildOptionsEntryPlan>>;
  rowKey: string;
  account: BrokerAccount | null;
  tradingEnabled: boolean;
  armOpens: boolean;
  brokerBusy?: boolean;
  busyTitle?: string;
  opening: boolean;
  onOpen?: (
    plan: NonNullable<ReturnType<typeof buildOptionsEntryPlan>>,
    rowKey: string,
  ) => void;
}) {
  const { t } = useLocale();
  const rthOpen = isCashRthNy();
  const [manualPrem, setManualPrem] = useState(
    String(plan.entryPremium > 0 ? plan.entryPremium : DEFAULT_OTM_PREMIUM),
  );
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setManualPrem(
      String(plan.entryPremium > 0 ? plan.entryPremium : DEFAULT_OTM_PREMIUM),
    );
  }, [plan.symbol, plan.optionType, plan.expIso, plan.entryPremium]);
  const typed = Number(manualPrem);
  const livePlan =
    Number.isFinite(typed) && typed > 0 ? planWithDebit(plan, typed) : plan;
  const entryPremium = livePlan.entryPremium;
  const equity = account?.equity ?? 0;
  const cash =
    account?.available_funds ?? account?.cash_balance ?? 0;
  const sizing = sizeLongOption({
    entryPremium,
    equity,
    cashAvailable: cash,
  });
  const qty = Math.max(1, sizing.contracts || 1);
  const occ =
    buildOccOptionSymbol(
      livePlan.symbol,
      livePlan.expIso,
      livePlan.optionType,
      livePlan.strike,
    ) || livePlan.symbol;

  async function copyTosPlan() {
    const line = [
      `BUY_TO_OPEN ${qty} ${occ}`,
      `LIMIT ${entryPremium.toFixed(2)} DAY`,
      `${livePlan.symbol} ${livePlan.optionType} ${livePlan.strike} exp ${livePlan.expLabel}`,
      `cost≈$${(entryPremium * 100 * qty).toFixed(2)}`,
    ].join(" · ");
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t("strategies.tosCopyPrompt"), line);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="inline-flex items-center gap-1 text-[10px] text-[var(--muted)]">
        {t("strategies.optionsPremManual")}
        <input
          type="number"
          min={0.01}
          step={0.01}
          inputMode="decimal"
          value={manualPrem}
          onChange={(e) => setManualPrem(e.target.value)}
          className="w-16 rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-[11px] tabular-nums text-[var(--foreground)]"
        />
      </label>
      <span className="text-[10px] tabular-nums text-[var(--muted)]">
        {t("strategies.optionsStrike")} {moneyUsd(livePlan.strike)}
      </span>
      <button
        type="button"
        onClick={() => void copyTosPlan()}
        className="rounded border border-[var(--ok)]/40 bg-[var(--ok-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--ok)] hover:bg-[var(--hover)]"
        title={occ}
      >
        {copied ? t("strategies.tosCopied") : t("strategies.tosCopyOpen")}
      </button>
      {!sizing.canOpen && account ? (
        <p className="text-[10px] leading-snug text-[var(--warn)]">
          {tooRichCopy(t, sizing)}
        </p>
      ) : null}
      {onOpen && DESK_OPENS_ENABLED ? (
        !account ? (
          <p className="text-[10px] text-[var(--muted)]">
            {t("strategies.capitalNeed")}
          </p>
        ) : !tradingEnabled ? (
          <p className="text-[10px] text-[var(--muted)]">
            {t("strategies.tradingDisabledShort")}
          </p>
        ) : !rthOpen ? (
          <p className="text-[10px] leading-snug text-[var(--warn)]">
            {t("strategies.openNeedRth")}
          </p>
        ) : (
          <button
            type="button"
            disabled={opening || !armOpens || brokerBusy || !sizing.canOpen}
            title={
              brokerBusy
                ? busyTitle || t("strategies.openWaitSync")
                : !armOpens
                  ? t("strategies.openNeedArm")
                  : t("strategies.openSchwabExperimental")
            }
            onClick={() => onOpen(livePlan, rowKey)}
            className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)] hover:bg-[var(--hover)] disabled:opacity-40"
          >
            {opening
              ? "…"
              : t("strategies.openSchwab")
                  .replace("{n}", String(qty))
                  .replace("{px}", moneyUsd(entryPremium))}
          </button>
        )
      ) : null}
    </div>
  );
}

function OptionsPlanBlock({
  plan,
  account = null,
  tradingEnabled = false,
  armOpens = false,
  brokerBusy = false,
  busyTitle,
  opening = false,
  onOpen,
  rowKey,
}: {
  plan: NonNullable<ReturnType<typeof buildOptionsEntryPlan>>;
  account?: BrokerAccount | null;
  tradingEnabled?: boolean;
  armOpens?: boolean;
  brokerBusy?: boolean;
  busyTitle?: string;
  opening?: boolean;
  onOpen?: (
    plan: NonNullable<ReturnType<typeof buildOptionsEntryPlan>>,
    rowKey: string,
  ) => void;
  rowKey?: string;
}) {
  const { t } = useLocale();
  const money = (n: number) =>
    n > 0
      ? n.toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "—";
  return (
    <div
      className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface)]/70 px-2 py-1.5"
      title={t("strategies.optionsPlanHint")}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
        {t("strategies.optionsPlan")} · {plan.optionType}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-[var(--foreground)]">
        Spot {money(plan.spot)} → {t("strategies.optionsStrike")}{" "}
        <span className="font-semibold tabular-nums">{money(plan.strike)}</span>
        {plan.strike !== plan.atmStrike ? (
          <span className="text-[var(--muted)]">
            {" "}
            ({t("strategies.optionsAtm")} {money(plan.atmStrike)})
          </span>
        ) : null}
        {" · "}
        {t("strategies.optionsExp")}{" "}
        <span className="font-semibold tabular-nums">{plan.expLabel}</span>
        {plan.expIsToday ? (
          <span className="text-[var(--muted)]">
            {" "}
            ({t("strategies.optionsExpHoy")})
          </span>
        ) : null}
      </p>
      {plan.hasRange ? (
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
          {t("strategies.optionsPrem")}: {plan.rangeLabel}
        </p>
      ) : (
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
          {t("strategies.optionsNoRange")}
        </p>
      )}
      <p className="mt-0.5 text-[11px] leading-snug text-[var(--foreground)]">
        {t("strategies.optionsPlanDebit")}:{" "}
        <span className="font-semibold tabular-nums">
          {money(plan.entryPremium)}
        </span>
        <span className="text-[var(--muted)]">
          {" "}
          · {t(`strategies.optionsFit.${plan.premiumFit}`)}
        </span>
      </p>
      {plan.entryPremium > 0 ? (
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--foreground)]">
          {t("strategies.optionsTp")}:{" "}
          <span className="tabular-nums">10% {money(plan.tp10)}</span>
          {" · "}
          <span className="tabular-nums">20% {money(plan.tp20)}</span>
          {" · "}
          <span className="tabular-nums">35% {money(plan.tp35)}</span>
          {" · "}
          <span className="tabular-nums">50% {money(plan.tp50)}</span>
          {" · "}
          <span className="font-semibold tabular-nums">
            100% {money(plan.tp100)}
          </span>
        </p>
      ) : null}
      <div className="mt-1.5">
        <OpenPlanButton
          plan={plan}
          rowKey={rowKey || `${plan.symbol}::plan`}
          account={account}
          tradingEnabled={tradingEnabled}
          armOpens={armOpens}
          brokerBusy={brokerBusy}
          busyTitle={busyTitle}
          opening={opening}
          onOpen={DESK_OPENS_ENABLED ? onOpen : undefined}
        />
      </div>
    </div>
  );
}
