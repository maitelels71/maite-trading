"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import { fetchNewsBriefing, getApiBase } from "@/lib/api";
import type { EconomicEvent, NewsBriefing, NewsItem } from "@/lib/types";

function todayNyIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function impactClass(impact: string): string {
  if (impact === "red") return "border-red-200 bg-[var(--danger-soft)] text-[var(--danger)]";
  if (impact === "orange") return "border-orange-200 bg-orange-50 text-orange-800";
  if (impact === "yellow") return "border-amber-200 bg-[var(--warn-soft)] text-[var(--warn)]";
  return "border-[var(--border)] bg-[var(--surface)] text-stone-700";
}

export function NewsDesk() {
  const [date, setDate] = useState(todayNyIso);
  const [briefing, setBriefing] = useState<NewsBriefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const data = await fetchNewsBriefing(date);
        setBriefing(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load news");
      }
    });
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">News Desk</h2>
          <p className="text-sm text-[var(--muted)]">
            Red-folder events and session headlines before you size risk.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Session date (NY)</span>
            <input
              type="date"
              className="block rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={load}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {pending ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <p className="text-xs text-[var(--muted)]">
        API <code className="text-[var(--muted)]">{getApiBase()}</code>
        {briefing ? (
          <>
            {" · "}
            provider <code className="text-[var(--muted)]">{briefing.provider}</code>
            {" · "}
            {briefing.configured ? "live feed" : "checklist mode"}
          </>
        ) : null}
      </p>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {briefing?.message ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            briefing.red_events.length
              ? "border-red-200 bg-[var(--danger-soft)] text-[var(--danger)]"
              : "border-[var(--border)] bg-[var(--surface-muted)] text-stone-700"
          }`}
        >
          {briefing.message}
        </div>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--danger)]">
          Red folder · high impact today
        </h3>
        {(briefing?.red_events.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
            No red economic events loaded for this date
            {!briefing?.configured
              ? " — set FINNHUB_API_KEY for the live calendar"
              : ""}
            .
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {briefing!.red_events.map((ev) => (
              <EventCard key={ev.id} event={ev} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-orange-700">
          Session headlines
        </h3>
        <div className="grid gap-2">
          {(briefing?.aware_items ?? []).map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      {(briefing?.watchlist_items.length ?? 0) > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-stone-700">Watchlist headlines</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {briefing!.watchlist_items.map((item) => (
              <NewsCard key={`w-${item.id}`} item={item} compact />
            ))}
          </div>
        </section>
      ) : null}

      {(briefing?.market_items.length ?? 0) > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-stone-700">Market feed</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {briefing!.market_items.map((item) => (
              <NewsCard key={`m-${item.id}`} item={item} compact />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function EventCard({ event }: { event: EconomicEvent }) {
  return (
    <article className={`rounded-xl border px-4 py-3 ${impactClass(event.impact)}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{event.event}</p>
        <span className="text-xs uppercase opacity-80">{event.impact}</span>
      </div>
      <p className="mt-1 text-xs opacity-80">
        {event.country}
        {event.scheduled_at
          ? ` · ${new Date(event.scheduled_at).toLocaleString()}`
          : ""}
      </p>
      <p className="mt-2 text-sm opacity-90">{event.reason}</p>
      <p className="mt-2 text-xs opacity-70">
        est {event.estimate ?? "—"} · prev {event.previous ?? "—"} · act{" "}
        {event.actual ?? "—"}
      </p>
    </article>
  );
}

function NewsCard({ item, compact }: { item: NewsItem; compact?: boolean }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium ${compact ? "text-sm" : ""}`}>{item.headline}</p>
        <span className="shrink-0 text-xs uppercase opacity-80">{item.impact}</span>
      </div>
      {item.reason ? <p className="mt-1 text-xs opacity-80">{item.reason}</p> : null}
      {!compact && item.summary ? (
        <p className="mt-2 text-sm opacity-90">{item.summary}</p>
      ) : null}
      <p className="mt-2 text-xs opacity-60">
        {item.source}
        {item.symbols?.length ? ` · ${item.symbols.slice(0, 4).join(", ")}` : ""}
        {item.published_at
          ? ` · ${new Date(item.published_at).toLocaleString()}`
          : ""}
      </p>
    </>
  );

  const cls = `rounded-xl border px-4 py-3 ${impactClass(item.impact)}`;
  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noreferrer" className={`${cls} block hover:opacity-95`}>
        {body}
      </a>
    );
  }
  return <article className={cls}>{body}</article>;
}
