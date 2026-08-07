"use client";

import { useEffect, useMemo, useState } from "react";

import { DAILY_REVIEW_SECTIONS } from "@/lib/daily-review";

function todayNyIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function storageKey(date: string): string {
  return `maite.daily-review.${date}`;
}

type Stored = {
  checked: Record<string, boolean>;
  notes: string;
  bias: string;
};

function loadDay(date: string): Stored {
  try {
    const raw = localStorage.getItem(storageKey(date));
    if (!raw) return { checked: {}, notes: "", bias: "" };
    const parsed = JSON.parse(raw) as Stored;
    return {
      checked: parsed.checked ?? {},
      notes: parsed.notes ?? "",
      bias: parsed.bias ?? "",
    };
  } catch {
    return { checked: {}, notes: "", bias: "" };
  }
}

export function DailyReview() {
  const [date, setDate] = useState(todayNyIso);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [bias, setBias] = useState("");

  useEffect(() => {
    const data = loadDay(date);
    setChecked(data.checked);
    setNotes(data.notes);
    setBias(data.bias);
  }, [date]);

  useEffect(() => {
    const payload: Stored = { checked, notes, bias };
    try {
      localStorage.setItem(storageKey(date), JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [checked, notes, bias, date]);

  const total = useMemo(
    () => DAILY_REVIEW_SECTIONS.reduce((n, s) => n + s.items.length, 0),
    [],
  );
  const done = useMemo(
    () => DAILY_REVIEW_SECTIONS.reduce(
      (n, s) => n + s.items.filter((i) => checked[i.id]).length,
      0,
    ),
    [checked],
  );

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function clearDay() {
    setChecked({});
    setNotes("");
    setBias("");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            Daily review
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Professional process checklist — pre-open, session, and post. Saved
            locally per NY session date.
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
            onClick={clearDay}
            className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--muted)] hover:border-[var(--border-strong)]"
          >
            Reset day
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Progress
          </p>
          <p className="mt-1 text-xl font-semibold">
            {done} / {total}
          </p>
        </div>
        <div className="sm:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">Daily bias (one line)</span>
            <input
              type="text"
              className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
              placeholder="e.g. Long bias NQ if OR breaks high; stand down into 10:00 CPI"
              value={bias}
              onChange={(e) => setBias(e.target.value)}
            />
          </label>
        </div>
      </div>

      {DAILY_REVIEW_SECTIONS.map((section) => {
        const sectionDone = section.items.filter((i) => checked[i.id]).length;
        return (
          <section
            key={section.id}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div>
                <h3 className="font-medium text-[var(--foreground)]">
                  {section.title}
                </h3>
                <p className="text-xs text-[var(--muted)]">{section.subtitle}</p>
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
                      <span>
                        <span
                          className={`block text-sm ${
                            on
                              ? "text-[var(--muted)] line-through"
                              : "text-[var(--foreground)]"
                          }`}
                        >
                          {item.label}
                        </span>
                        {item.hint ? (
                          <span className="mt-0.5 block text-xs text-[var(--muted)]">
                            {item.hint}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-[var(--foreground)]">
            End-of-day notes
          </span>
          <textarea
            className="min-h-[120px] w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
            placeholder="What worked, what you broke, what you carry tomorrow…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </section>
    </div>
  );
}
