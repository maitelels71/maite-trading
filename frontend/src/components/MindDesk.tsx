"use client";

import { useEffect, useMemo, useState } from "react";

import {
  LIFE_MANTRAS,
  RITUAL_SECTIONS,
  TRADING_MANTRA_LINES,
  TRADING_QUOTES,
} from "@/lib/psychotrading";

type MindTab = "ritual" | "mantras" | "quotes";

function todayNyIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function storageKey(date: string): string {
  return `maite.mind.ritual.${date}`;
}

export function MindDesk() {
  const [tab, setTab] = useState<MindTab>("ritual");
  const [date, setDate] = useState(todayNyIso);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(date));
      if (!raw) {
        setChecked({});
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setChecked(parsed ?? {});
    } catch {
      setChecked({});
    }
  }, [date]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(date), JSON.stringify(checked));
    } catch {
      /* ignore */
    }
  }, [checked, date]);

  const total = useMemo(
    () => RITUAL_SECTIONS.reduce((n, s) => n + s.items.length, 0),
    [],
  );
  const done = useMemo(
    () =>
      RITUAL_SECTIONS.reduce(
        (n, s) => n + s.items.filter((i) => checked[i.id]).length,
        0,
      ),
    [checked],
  );

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function clearRitual() {
    setChecked({});
  }

  const quote = TRADING_QUOTES[quoteIndex % TRADING_QUOTES.length];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            Psychotrading
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Ritual de disciplina, mantras cortos y quotes — entrena la mente
            antes que el chart.
          </p>
        </div>
        {tab === "ritual" ? (
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
              onClick={clearRitual}
              className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm text-stone-700 hover:border-stone-400"
            >
              Reset ritual
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-2">
        {(
          [
            ["ritual", "Ritual"],
            ["mantras", "Mantras"],
            ["quotes", "Quotes"],
          ] as const
        ).map(([id, label]) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-stone-100 hover:text-[var(--foreground)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "ritual" ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Progress · neuroplasticidad & disciplina
            </p>
            <p className="mt-1 text-xl font-semibold">
              {done} / {total}
            </p>
          </div>

          {RITUAL_SECTIONS.map((section) => {
            const sectionDone = section.items.filter((i) => checked[i.id]).length;
            return (
              <section
                key={section.id}
                className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
              >
                <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                  <div>
                    <h3 className="font-medium">{section.title}</h3>
                    {section.subtitle ? (
                      <p className="text-xs text-[var(--muted)]">
                        {section.subtitle}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-xs text-[var(--muted)]">
                    {sectionDone}/{section.items.length}
                  </p>
                </div>
                <ul className="divide-y divide-[var(--border)]">
                  {section.items.map((item) => {
                    const on = Boolean(checked[item.id]);
                    return (
                      <li key={item.id}>
                        <label className="flex cursor-pointer gap-3 px-4 py-3 hover:bg-[var(--surface-muted)]">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={on}
                            onChange={() => toggle(item.id)}
                          />
                          <span
                            className={`text-sm ${
                              on
                                ? "text-[var(--muted)] line-through"
                                : "text-[var(--foreground)]"
                            }`}
                          >
                            {item.label}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {section.footer ? (
                  <p className="border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-xs font-medium text-[var(--accent-fg)]">
                    {section.footer}
                  </p>
                ) : null}
              </section>
            );
          })}

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="font-medium">E. Mantra de neuroplasticidad</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Leer en voz alta antes de operar
            </p>
            <ul className="mt-4 space-y-3">
              {TRADING_MANTRA_LINES.map((line) => (
                <li
                  key={line}
                  className="border-l-2 border-[var(--accent)] pl-3 text-sm leading-relaxed text-stone-800"
                >
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === "mantras" ? (
        <div className="space-y-6">
          {LIFE_MANTRAS.map((group) => (
            <section
              key={group.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">
                {group.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {group.lines.map((line) => (
                  <li
                    key={line}
                    className="text-base leading-relaxed text-[var(--foreground)]"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">
              Mantra de trading
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Versión corta del ritual de neuroplasticidad
            </p>
            <ul className="mt-4 space-y-3">
              {TRADING_MANTRA_LINES.map((line) => (
                <li
                  key={line}
                  className="text-base leading-relaxed text-[var(--foreground)]"
                >
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === "quotes" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center">
            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-[var(--foreground)] sm:text-2xl">
              “{quote.text}”
            </p>
            {quote.author ? (
              <p className="mt-4 text-sm text-[var(--muted)]">— {quote.author}</p>
            ) : null}
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setQuoteIndex((i) => (i - 1 + TRADING_QUOTES.length) % TRADING_QUOTES.length)
                }
                className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm hover:border-stone-400"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setQuoteIndex((i) => (i + 1) % TRADING_QUOTES.length)}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
              >
                Siguiente
              </button>
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">
              {quoteIndex + 1} / {TRADING_QUOTES.length}
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {TRADING_QUOTES.map((q, idx) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setQuoteIndex(idx)}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                  idx === quoteIndex
                    ? "border-[var(--accent)] bg-[var(--ok-soft)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-stone-300"
                }`}
              >
                {q.text}
              </button>
            ))}
          </section>
        </div>
      ) : null}
    </div>
  );
}
