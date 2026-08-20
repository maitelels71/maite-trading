"use client";

import { useCallback, useEffect, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocale } from "@/components/LocaleProvider";
import {
  fetchCoinbaseRuns,
  fetchCoinbaseStats,
  fetchCoinbaseStatus,
  runCoinbaseBot,
  saveCoinbaseSettings,
  type CoinbaseRun,
  type CoinbaseStats,
  type CoinbaseStatus,
} from "@/lib/api";
import { clearDeskToken } from "@/lib/desk-session";

function fmtUsd(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function fmtPct(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function CoinbaseDesk() {
  const { t } = useLocale();
  const [status, setStatus] = useState<CoinbaseStatus | null>(null);
  const [stats, setStats] = useState<CoinbaseStats | null>(null);
  const [runs, setRuns] = useState<CoinbaseRun[]>([]);
  const [latest, setLatest] = useState<CoinbaseRun | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"test" | "live" | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);
  const [maxTrade, setMaxTrade] = useState("25");
  const [minTrade, setMinTrade] = useState("5");
  const [cashPct, setCashPct] = useState("10");
  const [threshold, setThreshold] = useState("5");
  const [lookback, setLookback] = useState("30");
  const [planNote, setPlanNote] = useState("");

  function knobsFromStatus(st: CoinbaseStatus) {
    setMaxTrade(String(st.max_trade_usd));
    setMinTrade(String(st.min_trade_usd));
    setCashPct(String(Math.round(st.cash_pct * 1000) / 10));
    setThreshold(String(st.rebalance_threshold_pct));
    setLookback(String(st.lookback_days));
  }

  function readKnobs() {
    const maxUsd = Number(maxTrade);
    const minUsd = Number(minTrade);
    const cash = Number(cashPct) / 100;
    const drift = Number(threshold);
    const days = Number(lookback);
    return {
      max_trade_usd: maxUsd,
      min_trade_usd: minUsd,
      cash_pct: cash,
      rebalance_threshold_pct: drift,
      lookback_days: days,
    };
  }

  const refresh = useCallback(async () => {
    const [st, stt, history] = await Promise.all([
      fetchCoinbaseStatus(),
      fetchCoinbaseStats(),
      fetchCoinbaseRuns(),
    ]);
    setStatus(st);
    knobsFromStatus(st);
    setStats(stt);
    setRuns(history);
    setLatest(history[0] ?? null);
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t("coinbase.loadFailed"));
    });
  }, [refresh, t]);

  async function run(live: boolean) {
    setError("");
    setBusy(live ? "live" : "test");
    try {
      const result = await runCoinbaseBot({
        live,
        confirm_live: live,
        ...readKnobs(),
      });
      setLatest(result);
      setPlanNote("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("coinbase.runFailed"));
    } finally {
      setBusy(null);
      setConfirmLive(false);
    }
  }

  async function savePlan() {
    setError("");
    setPlanNote("");
    try {
      const saved = await saveCoinbaseSettings(readKnobs());
      setMaxTrade(String(saved.max_trade_usd));
      setMinTrade(String(saved.min_trade_usd));
      setCashPct(String(Math.round(saved.cash_pct * 1000) / 10));
      setThreshold(String(saved.rebalance_threshold_pct));
      setLookback(String(saved.lookback_days));
      setPlanNote(t("coinbase.savedPlan"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("coinbase.runFailed"));
    }
  }

  function logout() {
    clearDeskToken();
    window.location.href = "/";
  }

  const holdings = latest?.holdings ?? {};
  const weights = latest?.weights ?? {};
  const prices = latest?.prices ?? {};
  const quote = latest?.quote ?? status?.quote ?? "USD";

  return (
    <div className="min-h-screen text-[var(--foreground)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <BrandMark className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--info)]">
                {t("hub.coinbaseEyebrow")}
              </p>
              <h1 className="text-lg font-bold leading-tight">
                {t("hub.coinbaseTitle")}
              </h1>
            </div>
          </div>
          <LanguageToggle />
          <ThemeToggle />
          <a
            href="/"
            className="inline-flex shrink-0 items-center rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-bold text-[var(--foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--on-accent)] hover:border-[var(--accent)]"
          >
            ← {t("hub.homeBack")}
          </a>
          <button
            type="button"
            onClick={logout}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--hover)]"
          >
            {t("hub.logout")}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          {t("coinbase.intro")}
        </p>

        {error ? (
          <p className="rounded-lg bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-4">
          <StatCard
            label={t("coinbase.statPortfolio")}
            value={fmtUsd(
              latest?.portfolio_value ?? stats?.last_portfolio_value,
            )}
          />
          <StatCard
            label={t("coinbase.statRuns")}
            value={String(stats?.total_runs ?? 0)}
            hint={`${stats?.dry_runs ?? 0} ${t("coinbase.test")} · ${stats?.live_runs ?? 0} ${t("coinbase.live")}`}
          />
          <StatCard
            label={t("coinbase.statLast")}
            value={fmtTime(stats?.last_run_at)}
            hint={
              stats?.last_dry_run === false
                ? t("coinbase.live")
                : stats?.last_dry_run
                  ? t("coinbase.test")
                  : "—"
            }
          />
          <StatCard
            label={t("coinbase.statLiveOrders")}
            value={`${stats?.live_orders_ok ?? 0} / ${stats?.live_orders_failed ?? 0}`}
            hint={t("coinbase.statLiveOrdersHint")}
          />
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            {t("coinbase.controls")}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {t("coinbase.controlsHint")}
          </p>
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/60 p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
              {t("coinbase.planSettings")}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              {t("coinbase.planSettingsHint")}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-5">
              <KnobField
                label={t("coinbase.maxClip")}
                suffix="$"
                value={maxTrade}
                min={1}
                max={250}
                step={1}
                onChange={setMaxTrade}
              />
              <KnobField
                label={t("coinbase.minClip")}
                suffix="$"
                value={minTrade}
                min={1}
                max={250}
                step={1}
                onChange={setMinTrade}
              />
              <KnobField
                label={t("coinbase.threshold")}
                suffix="%"
                value={threshold}
                min={1}
                max={25}
                step={0.5}
                onChange={setThreshold}
              />
              <KnobField
                label={t("coinbase.cashPct")}
                suffix="%"
                value={cashPct}
                min={0}
                max={50}
                step={1}
                onChange={setCashPct}
              />
              <KnobField
                label={t("coinbase.lookback")}
                suffix={t("coinbase.days")}
                value={lookback}
                min={7}
                max={90}
                step={1}
                onChange={setLookback}
              />
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void savePlan()}
              className="mt-3 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--hover)] disabled:opacity-50"
            >
              {t("coinbase.savePlan")}
            </button>
            {planNote ? (
              <p className="mt-2 text-xs text-[var(--ok)]">{planNote}</p>
            ) : null}
          </div>
          {status && !status.configured ? (
            <p className="mt-3 rounded-md bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--warn)]">
              {t("coinbase.notConfigured")}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy !== null || !status?.configured}
              onClick={() => void run(false)}
              className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {busy === "test" ? t("coinbase.running") : t("coinbase.runTest")}
            </button>
            <button
              type="button"
              disabled={
                busy !== null ||
                !status?.configured ||
                !status.trading_enabled ||
                !confirmLive
              }
              onClick={() => void run(true)}
              className="rounded-lg bg-[var(--danger)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy === "live" ? t("coinbase.running") : t("coinbase.runLive")}
            </button>
          </div>
          {status && !status.trading_enabled ? (
            <p className="mt-3 text-xs text-[var(--muted)]">
              {t("coinbase.liveLocked")}
            </p>
          ) : status ? (
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmLive}
                onChange={(e) => setConfirmLive(e.target.checked)}
              />
              <span>{t("coinbase.liveConfirm")}</span>
            </label>
          ) : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
              {t("coinbase.holdings")}
            </h2>
            {latest ? (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    <th className="py-1">{t("coinbase.asset")}</th>
                    <th className="py-1">{t("coinbase.qty")}</th>
                    <th className="py-1">{t("coinbase.target")}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys({ ...holdings, ...weights }).map((asset) => (
                    <tr key={asset} className="border-t border-[var(--border)]">
                      <td className="py-2 font-semibold">{asset}</td>
                      <td className="py-2 tabular-nums">
                        {asset === quote || asset === "CASH"
                          ? fmtUsd(holdings[quote] ?? holdings[asset])
                          : holdings[asset] ?? "0"}
                        {prices[asset] ? (
                          <span className="ml-1 text-[var(--muted)]">
                            ({fmtUsd(Number(holdings[asset] || 0) * Number(prices[asset] || 0))})
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 tabular-nums">{fmtPct(weights[asset])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">
                {t("coinbase.runToSee")}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
              {t("coinbase.plan")}
            </h2>
            {latest?.orders?.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {latest.orders.map((order, i) => (
                  <li
                    key={`${order.product_id}-${i}`}
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                  >
                    <span
                      className={`font-bold ${
                        order.side === "BUY"
                          ? "text-[var(--ok)]"
                          : "text-[var(--danger)]"
                      }`}
                    >
                      {order.side}
                    </span>{" "}
                    {order.asset} · {fmtUsd(order.notional)}
                    <p className="text-xs text-[var(--muted)]">{order.reason}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">
                {latest ? t("coinbase.noOrders") : t("coinbase.runToSee")}
              </p>
            )}
            {latest ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                {latest.dry_run ? t("coinbase.wasTest") : t("coinbase.wasLive")}{" "}
                · {fmtTime(latest.ts)}
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            {t("coinbase.history")}
          </h2>
          {runs.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              {t("coinbase.historyEmpty")}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
              {runs.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="tabular-nums text-[var(--muted)]">
                    {fmtTime(row.ts)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      row.dry_run
                        ? "bg-[var(--accent-soft)] text-[var(--accent-fg)]"
                        : "bg-[var(--danger-soft)] text-[var(--danger)]"
                    }`}
                  >
                    {row.dry_run ? t("coinbase.test") : t("coinbase.live")}
                  </span>
                  <span className="font-semibold">
                    {fmtUsd(row.portfolio_value)}
                  </span>
                  <span className="text-[var(--muted)]">
                    {row.orders.length} {t("coinbase.orders")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function KnobField({
  label,
  suffix,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  suffix: string;
  value: string;
  min: number;
  max: number;
  step: number;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold">
      {label}
      <span className="mt-1 flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-sm font-normal tabular-nums"
        />
        <span className="shrink-0 text-[var(--muted)]">{suffix}</span>
      </span>
    </label>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-lg font-bold tabular-nums">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
