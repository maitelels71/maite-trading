"use client";

import { useEffect, useMemo, useState } from "react";

import { useLocale } from "@/components/LocaleProvider";
import { saveDailyToNotion } from "@/lib/api";
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

function buildNotionMarkdown(payload: {
  date: string;
  bias: string;
  notes: string;
  checked: Record<string, boolean>;
}): string {
  const lines: string[] = [
    `## Daily review — ${payload.date}`,
    "",
    `**Bias:** ${payload.bias || "—"}`,
    "",
  ];
  for (const section of DAILY_REVIEW_SECTIONS) {
    lines.push(`### ${section.title}`);
    for (const item of section.items) {
      const mark = payload.checked[item.id] ? "x" : " ";
      lines.push(`- [${mark}] ${item.label}`);
    }
    lines.push("");
  }
  lines.push("### Notes");
  lines.push(payload.notes || "—");
  lines.push("");
  return lines.join("\n");
}

export function DailyReview() {
  const { t } = useLocale();
  const [date, setDate] = useState(todayNyIso);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [bias, setBias] = useState("");
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const [notionBusy, setNotionBusy] = useState(false);
  const [notionUrl, setNotionUrl] = useState<string | null>(null);

  useEffect(() => {
    const data = loadDay(date);
    setChecked(data.checked);
    setNotes(data.notes);
    setBias(data.bias);
    setNotionUrl(null);
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
    () =>
      DAILY_REVIEW_SECTIONS.reduce(
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

  function saveNow() {
    const payload: Stored = { checked, notes, bias };
    try {
      localStorage.setItem(storageKey(date), JSON.stringify(payload));
      setSaveFlash(t("daily.saved"));
      window.setTimeout(() => setSaveFlash(null), 1600);
    } catch {
      setSaveFlash("Save failed");
    }
  }

  async function copyForNotion() {
    const md = buildNotionMarkdown({ date, bias, notes, checked });
    try {
      await navigator.clipboard.writeText(md);
      setSaveFlash(t("daily.copiedNotion"));
      window.setTimeout(() => setSaveFlash(null), 2000);
    } catch {
      setSaveFlash("Copy failed");
    }
  }

  async function saveToNotion() {
    setNotionBusy(true);
    setSaveFlash(t("daily.savingNotion"));
    try {
      const result = await saveDailyToNotion({
        date,
        bias,
        notes,
        checked,
        sections: DAILY_REVIEW_SECTIONS.map((s) => ({
          id: s.id,
          title: s.title,
          items: s.items.map((i) => ({ id: i.id, label: i.label })),
        })),
      });
      setNotionUrl(result.url || null);
      setSaveFlash(
        `${t("daily.savedNotion")} (${result.action}) · ${result.done}/${result.total}`,
      );
      window.setTimeout(() => setSaveFlash(null), 4000);
    } catch (err) {
      setSaveFlash(err instanceof Error ? err.message : "Notion save failed");
    } finally {
      setNotionBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            {t("daily.title")}
          </h2>
          <p className="text-sm text-[var(--muted)]">{t("daily.subtitle")}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("daily.saveHint")}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("daily.notionNote")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">{t("daily.sessionDate")}</span>
            <input
              type="date"
              className="block rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={saveNow}
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] hover:bg-[var(--accent-hover)]"
          >
            {t("daily.save")}
          </button>
          <button
            type="button"
            onClick={saveToNotion}
            disabled={notionBusy}
            className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--hover)] disabled:opacity-50"
          >
            {notionBusy ? t("daily.savingNotion") : t("daily.saveNotion")}
          </button>
          <button
            type="button"
            onClick={copyForNotion}
            className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--hover)]"
          >
            {t("daily.copyNotion")}
          </button>
          <button
            type="button"
            onClick={clearDay}
            className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--muted)] hover:border-[var(--border-strong)]"
          >
            {t("daily.reset")}
          </button>
        </div>
      </div>

      {saveFlash ? (
        <p className="rounded-md border border-[var(--ok)]/30 bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]">
          {saveFlash}
          {notionUrl ? (
            <>
              {" · "}
              <a
                href={notionUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {t("daily.openNotion")}
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            {t("daily.progress")}
          </p>
          <p className="mt-1 text-xl font-semibold">
            {done} / {total}
          </p>
        </div>
        <div className="sm:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">{t("daily.bias")}</span>
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
            {t("daily.notes")}
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
