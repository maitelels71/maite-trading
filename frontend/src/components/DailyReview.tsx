"use client";

import { useEffect, useMemo, useState } from "react";

import { DeskSession, DeskStack } from "@/components/DeskSession";
import { useLocale } from "@/components/LocaleProvider";
import { saveDailyToNotion } from "@/lib/api";
import {
  DAILY_REVIEW_SECTIONS,
  type ChecklistSection,
} from "@/lib/daily-review";

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

function SectionCard({
  section,
  checked,
  onToggle,
}: {
  section: ChecklistSection;
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const sectionDone = section.items.filter((i) => checked[i.id]).length;
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {section.title}
          </h3>
          <p className="text-[11px] leading-snug text-[var(--muted)]">
            {section.subtitle}
          </p>
        </div>
        <p className="shrink-0 pt-0.5 text-[11px] tabular-nums text-[var(--muted)]">
          {sectionDone}/{section.items.length}
        </p>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {section.items.map((item) => {
          const on = Boolean(checked[item.id]);
          return (
            <li key={item.id}>
              <label className="flex cursor-pointer gap-2 px-3 py-1.5 hover:bg-[var(--surface-muted)]">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={on}
                  onChange={() => onToggle(item.id)}
                />
                <span className="min-w-0">
                  <span
                    className={`block text-[13px] leading-snug ${
                      on
                        ? "text-[var(--muted)] line-through"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.hint ? (
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
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

  const btn =
    "rounded-md border border-[var(--border-strong)] px-2.5 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--hover)]";

  return (
    <DeskStack>
      {/* Compact session bar */}
      <div className="flex flex-wrap items-center gap-2 gap-y-2 pb-2">
        <div className="mr-auto min-w-0">
          <h2 className="text-lg font-semibold leading-tight text-[var(--foreground)]">
            {t("daily.title")}
          </h2>
          <p className="text-[11px] text-[var(--muted)]">
            {done}/{total} · {t("daily.saveHint")}
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          {t("daily.sessionDate")}
          <input
            type="date"
            className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--foreground)]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={saveNow}
          className="rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-hover)]"
        >
          {t("daily.save")}
        </button>
        <button
          type="button"
          onClick={saveToNotion}
          disabled={notionBusy}
          className={`${btn} disabled:opacity-50`}
        >
          {notionBusy ? t("daily.savingNotion") : t("daily.saveNotion")}
        </button>
        <button type="button" onClick={copyForNotion} className={btn}>
          {t("daily.copyNotion")}
        </button>
        <button type="button" onClick={clearDay} className={`${btn} text-[var(--muted)]`}>
          {t("daily.reset")}
        </button>
      </div>

      {saveFlash ? (
        <p className="rounded-md border border-[var(--ok)]/30 bg-[var(--ok-soft)] px-3 py-1.5 text-xs text-[var(--ok)]">
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

      <DeskSession first step={1} title={t("session.bias")} panel={false}>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
          <span className="shrink-0 text-xs text-[var(--muted)]">
            {t("daily.bias")}
          </span>
          <input
            type="text"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
            placeholder="Long NQ if OR holds · stand down into CPI…"
            value={bias}
            onChange={(e) => setBias(e.target.value)}
          />
          <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
            {done}/{total}
          </span>
        </label>
      </DeskSession>

      <DeskSession
        step={2}
        title={t("session.checklistDaily")}
        hint={`${done}/${total}`}
        panel={false}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {DAILY_REVIEW_SECTIONS.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              checked={checked}
              onToggle={toggle}
            />
          ))}
        </div>
      </DeskSession>

      <DeskSession step={3} title={t("session.notesDaily")} panel={false}>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium text-[var(--muted)]">
              {t("daily.notes")}
            </span>
            <textarea
              className="min-h-[72px] w-full resize-y rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
              placeholder="What worked, what you broke, what you carry tomorrow…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </section>
      </DeskSession>
    </DeskStack>
  );
}
