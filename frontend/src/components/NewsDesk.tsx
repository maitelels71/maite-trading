"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { DeskSession, DeskStack } from "@/components/DeskSession";
import { useLocale } from "@/components/LocaleProvider";
import { fetchNewsBriefing } from "@/lib/api";
import type { EconomicEvent, NewsBriefing, NewsItem } from "@/lib/types";

function todayNyIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** Sunday of the week containing iso (FF-style). */
function weekStartSunday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0=Sun
  return addDaysIso(iso, -wd);
}

function formatWeekLabel(start: string, end: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function eventDayIso(ev: EconomicEvent): string {
  if (!ev.scheduled_at) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ev.scheduled_at));
}

function formatEventTime(ev: EconomicEvent): string {
  if (!ev.scheduled_at) return "Tentative";
  return new Date(ev.scheduled_at).toLocaleTimeString(undefined, {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function impactFolder(impact: string): string {
  if (impact === "red") return "bg-red-500";
  if (impact === "orange") return "bg-orange-400";
  if (impact === "yellow") return "bg-amber-300";
  return "bg-zinc-400";
}

function actualTone(
  actual: string | null | undefined,
  estimate: string | null | undefined,
): string {
  if (!actual || !estimate) return "text-[var(--foreground)]";
  const a = Number(String(actual).replace(/[^0-9.\-]/g, ""));
  const e = Number(String(estimate).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(a) || !Number.isFinite(e)) return "text-[var(--foreground)]";
  if (a > e) return "text-emerald-600 dark:text-emerald-400";
  if (a < e) return "text-red-600 dark:text-red-400";
  return "text-[var(--foreground)]";
}

export function NewsDesk() {
  const { t } = useLocale();
  const [anchor, setAnchor] = useState(todayNyIso);
  const [briefing, setBriefing] = useState<NewsBriefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const weekStart = useMemo(
    () => briefing?.week_start ?? weekStartSunday(anchor),
    [briefing?.week_start, anchor],
  );
  const weekEnd = useMemo(
    () => briefing?.week_end ?? addDaysIso(weekStart, 6),
    [briefing?.week_end, weekStart],
  );

  const load = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const data = await fetchNewsBriefing(anchor);
        setBriefing(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load news");
      }
    });
  }, [anchor]);

  useEffect(() => {
    load();
  }, [load]);

  /** Red carpet (high impact) only — Med/Low never shown. */
  const calendar = useMemo(() => {
    const rows =
      briefing?.red_events?.length
        ? briefing.red_events
        : (briefing?.calendar_events ?? []);
    return rows.filter((e) => e.impact === "red");
  }, [briefing]);

  const grouped = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    for (const ev of calendar) {
      const day = eventDayIso(ev) || "unknown";
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(ev);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [calendar]);

  function shiftWeek(deltaWeeks: number) {
    setAnchor(addDaysIso(weekStartSunday(anchor), deltaWeeks * 7));
  }

  function goToday() {
    setAnchor(todayNyIso());
  }

  return (
    <DeskStack>
      <div className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            {t("news.title")}
          </h2>
          <p className="text-sm text-[var(--muted)]">{t("news.subtitle")}</p>
        </div>
        {briefing ? (
          <p className="text-[11px] text-[var(--muted)]">
            {briefing.provider}
            {" · "}
            {briefing.configured ? t("news.live") : t("news.sample")}
          </p>
        ) : null}
      </div>

      <DeskSession
        first
        step={1}
        title={t("session.calendar")}
        hint={t("news.timesNy")}
        panel={false}
        actions={
          <button
            type="button"
            disabled={pending}
            onClick={load}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {pending ? t("news.loading") : t("news.refresh")}
          </button>
        }
      >
      {/* Week toolbar — Forex Factory style */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-[#1e3a5f] px-3 py-2 text-white shadow-sm">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="rounded px-2 py-1 text-sm hover:bg-white/10"
          aria-label="Previous week"
        >
          ‹
        </button>
        <span className="min-w-[11rem] text-center text-sm font-semibold tracking-wide">
          {t("news.thisWeek")}: {formatWeekLabel(weekStart, weekEnd)}
        </span>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          className="rounded px-2 py-1 text-sm hover:bg-white/10"
          aria-label="Next week"
        >
          ›
        </button>
        <button
          type="button"
          onClick={goToday}
          className="ml-1 rounded border border-white/30 px-2.5 py-1 text-xs hover:bg-white/10"
        >
          {t("news.today")}
        </button>
        <div className="ml-auto flex items-center gap-2 text-[11px] font-medium">
          <span
            className="inline-block h-3.5 w-4 rounded-sm bg-red-500"
            aria-hidden
          />
          {t("news.redCarpetOnly")}
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {briefing?.message ? (
        <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--muted)]">
          {briefing.message}
        </div>
      ) : null}

      {/* Calendar table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-3 py-2 font-semibold">{t("news.colDate")}</th>
                <th className="px-3 py-2 font-semibold">{t("news.colTime")}</th>
                <th className="px-3 py-2 font-semibold">{t("news.colCcy")}</th>
                <th className="px-3 py-2 font-semibold">{t("news.colImpact")}</th>
                <th className="px-3 py-2 font-semibold">{t("news.colEvent")}</th>
                <th className="px-3 py-2 font-semibold">{t("news.colActual")}</th>
                <th className="px-3 py-2 font-semibold">{t("news.colForecast")}</th>
                <th className="px-3 py-2 font-semibold">{t("news.colPrevious")}</th>
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-sm text-[var(--muted)]"
                  >
                    {pending ? t("news.loading") : t("news.emptyCalendar")}
                  </td>
                </tr>
              ) : (
                grouped.map(([day, events]) =>
                  events.map((ev, idx) => (
                    <tr
                      key={ev.id}
                      className="border-t border-[var(--border)] odd:bg-[var(--surface)] even:bg-[var(--surface-muted)]/50 hover:bg-[var(--hover)]"
                    >
                      {idx === 0 ? (
                        <td
                          rowSpan={events.length}
                          className="align-top border-r border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
                        >
                          {dayLabel(day)}
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">
                        {formatEventTime(ev)}
                      </td>
                      <td className="px-3 py-2 font-semibold tracking-wide">
                        {ev.currency || ev.country || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block h-3.5 w-4 rounded-sm ${impactFolder(String(ev.impact))}`}
                          title={String(ev.impact)}
                          aria-label={String(ev.impact)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-[var(--foreground)]">
                          {ev.event}
                        </span>
                        {ev.reason ? (
                          <span className="mt-0.5 block text-[10px] text-[var(--muted)]">
                            {ev.reason}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`px-3 py-2 tabular-nums ${actualTone(ev.actual, ev.estimate)}`}
                      >
                        {ev.actual ?? ""}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                        {ev.estimate ?? ""}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                        {ev.previous ?? ""}
                      </td>
                    </tr>
                  )),
                )
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-[var(--border)] px-3 py-2 text-[10px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-3 rounded-sm bg-red-500" />{" "}
            {t("news.redCarpetOnly")}
          </span>
          <span className="ml-auto">{t("news.timesNy")}</span>
        </div>
      </div>
      </DeskSession>

      <DeskSession step={2} title={t("session.headlines")} panel={false}>
        <div className="grid gap-2">
          {(briefing?.aware_items ?? []).map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      </DeskSession>

      {(briefing?.watchlist_items.length ?? 0) > 0 ? (
        <DeskSession step={3} title={t("session.watchlist")} panel={false}>
          <div className="grid gap-2 md:grid-cols-2">
            {briefing!.watchlist_items.map((item) => (
              <NewsCard key={`w-${item.id}`} item={item} compact />
            ))}
          </div>
        </DeskSession>
      ) : null}
    </DeskStack>
  );
}

function impactChip(impact: string): string {
  if (impact === "red")
    return "border-red-200 bg-[var(--danger-soft)] text-[var(--danger)]";
  if (impact === "orange")
    return "border-orange-200 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200";
  if (impact === "yellow")
    return "border-amber-200 bg-[var(--warn-soft)] text-[var(--warn)]";
  return "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]";
}

function NewsCard({ item, compact }: { item: NewsItem; compact?: boolean }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium ${compact ? "text-sm" : ""}`}>{item.headline}</p>
        <span className="shrink-0 text-[10px] uppercase opacity-80">{item.impact}</span>
      </div>
      {item.reason ? (
        <p className="mt-1 text-xs opacity-80">{item.reason}</p>
      ) : null}
      {!compact && item.summary ? (
        <p className="mt-2 text-sm opacity-90">{item.summary}</p>
      ) : null}
      <p className="mt-2 text-[10px] opacity-60">
        {item.source}
        {item.symbols?.length ? ` · ${item.symbols.slice(0, 4).join(", ")}` : ""}
        {item.published_at
          ? ` · ${new Date(item.published_at).toLocaleString()}`
          : ""}
      </p>
    </>
  );

  const cls = `rounded-xl border px-4 py-3 ${impactChip(String(item.impact))}`;
  if (item.url) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className={`${cls} block hover:opacity-95`}
      >
        {body}
      </a>
    );
  }
  return <article className={cls}>{body}</article>;
}
