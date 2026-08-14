"use client";

import { useEffect, useMemo, useState } from "react";

import { DeskSession, DeskStack } from "@/components/DeskSession";
import { useLocale } from "@/components/LocaleProvider";
import { fetchInstruments } from "@/lib/api";
import { APP_VENUE } from "@/lib/app-mode";
import {
  EMPTY_OPTIONS_TICKET,
  OPTIONS_CHECKLIST_SECTIONS,
  type ChecklistSection,
  type OptionsTradeTicket,
} from "@/lib/options-checklist";
import type { Instrument } from "@/lib/types";

const FALLBACK_WATCHLIST = [
  "SPY",
  "QQQ",
  "AAPL",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "NVDA",
  "TSLA",
  "NFLX",
];

function todayNyIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function storageKey(date: string): string {
  return `maite.options-checklist.${date}`;
}

type Stored = {
  checked: Record<string, boolean>;
  notes: string;
  ticket: OptionsTradeTicket;
};

function loadDay(date: string): Stored {
  try {
    const raw = localStorage.getItem(storageKey(date));
    if (!raw) {
      return {
        checked: {},
        notes: "",
        ticket: { ...EMPTY_OPTIONS_TICKET, date },
      };
    }
    const parsed = JSON.parse(raw) as Stored;
    return {
      checked: parsed.checked ?? {},
      notes: parsed.notes ?? "",
      ticket: {
        ...EMPTY_OPTIONS_TICKET,
        ...(parsed.ticket ?? {}),
        date,
      },
    };
  } catch {
    return {
      checked: {},
      notes: "",
      ticket: { ...EMPTY_OPTIONS_TICKET, date },
    };
  }
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
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-1 border-b border-[var(--border)] px-2 py-1">
        <div className="min-w-0">
          <h3 className="truncate text-[12px] font-semibold leading-tight text-[var(--foreground)]">
            {section.title}
          </h3>
          <p className="truncate text-[10px] leading-tight text-[var(--muted)]">
            {section.subtitle}
          </p>
        </div>
        <p className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">
          {sectionDone}/{section.items.length}
        </p>
      </div>
      <ul className="max-h-[11.5rem] divide-y divide-[var(--border)] overflow-y-auto">
        {section.items.map((item) => {
          const on = Boolean(checked[item.id]);
          return (
            <li key={item.id}>
              <label
                className="flex cursor-pointer gap-1.5 px-2 py-1 hover:bg-[var(--surface-muted)]"
                title={item.hint}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={on}
                  onChange={() => onToggle(item.id)}
                />
                <span
                  className={`min-w-0 text-[11px] leading-snug ${
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
    </section>
  );
}

const field =
  "w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--foreground)]";

export function OptionsChecklistDesk() {
  const { t } = useLocale();
  const [date, setDate] = useState(todayNyIso);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [ticket, setTicket] = useState<OptionsTradeTicket>({
    ...EMPTY_OPTIONS_TICKET,
  });
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [instruments, setInstruments] = useState<Instrument[]>([]);

  useEffect(() => {
    const loaded = loadDay(date);
    setChecked(loaded.checked);
    setNotes(loaded.notes);
    setTicket({ ...loaded.ticket, date });
  }, [date]);

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

  const watchlist = useMemo(() => {
    const fromApi = instruments
      .filter((i) => !i.data_provider || i.data_provider === APP_VENUE)
      .map((i) => i.symbol.toUpperCase());
    const merged = [...new Set([...fromApi, ...FALLBACK_WATCHLIST])].sort();
    return merged;
  }, [instruments]);

  const total = useMemo(
    () =>
      OPTIONS_CHECKLIST_SECTIONS.reduce((n, s) => n + s.items.length, 0),
    [],
  );
  const done = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked],
  );

  function persist(next: Stored) {
    localStorage.setItem(storageKey(date), JSON.stringify(next));
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const nextChecked = { ...prev, [id]: !prev[id] };
      persist({ checked: nextChecked, notes, ticket });
      return nextChecked;
    });
  }

  function patchTicket(patch: Partial<OptionsTradeTicket>) {
    setTicket((prev) => {
      const next = { ...prev, ...patch };
      persist({ checked, notes, ticket: next });
      return next;
    });
  }

  function saveNow() {
    persist({ checked, notes, ticket: { ...ticket, date } });
    setSaveFlash(t("optionsChecklist.saved"));
    window.setTimeout(() => setSaveFlash(null), 2000);
  }

  function clearDay() {
    const empty = {
      checked: {},
      notes: "",
      ticket: { ...EMPTY_OPTIONS_TICKET, date },
    };
    persist(empty);
    setChecked({});
    setNotes("");
    setTicket(empty.ticket);
  }

  const btn =
    "rounded-md border border-[var(--border-strong)] px-2.5 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--hover)]";

  const tickerSelect = (
    <select
      className={`${field} min-w-[7.5rem]`}
      value={
        ticket.ticker && watchlist.includes(ticket.ticker.toUpperCase())
          ? ticket.ticker.toUpperCase()
          : ticket.ticker
            ? "__custom__"
            : ""
      }
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__custom__") return;
        patchTicket({ ticker: v });
      }}
      title={t("optionsChecklist.fieldTicker")}
    >
      <option value="">{t("optionsChecklist.pickTicker")}</option>
      {watchlist.map((sym) => (
        <option key={sym} value={sym}>
          {sym}
        </option>
      ))}
      {ticket.ticker &&
      !watchlist.includes(ticket.ticker.toUpperCase()) ? (
        <option value="__custom__">{ticket.ticker.toUpperCase()}</option>
      ) : null}
    </select>
  );

  return (
    <DeskStack>
      <div className="flex flex-wrap items-center gap-2 gap-y-2 pb-2">
        <div className="mr-auto min-w-0">
          <h2 className="text-lg font-semibold leading-tight text-[var(--foreground)]">
            {t("optionsChecklist.title")}
          </h2>
          <p className="text-[11px] text-[var(--muted)]">
            {done}/{total} · {t("optionsChecklist.hint")}
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          {t("optionsChecklist.fieldTicker")}
          {tickerSelect}
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          {t("optionsChecklist.sessionDate")}
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
          {t("optionsChecklist.save")}
        </button>
        <button type="button" onClick={clearDay} className={`${btn} text-[var(--muted)]`}>
          {t("optionsChecklist.reset")}
        </button>
      </div>

      {saveFlash ? (
        <p className="rounded-md border border-[var(--ok)]/30 bg-[var(--ok-soft)] px-3 py-1.5 text-xs text-[var(--ok)]">
          {saveFlash}
        </p>
      ) : null}

      <DeskSession
        first
        step={1}
        title={t("optionsChecklist.ticket")}
        hint={t("optionsChecklist.ticketHint")}
        panel={false}
        collapsible
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        badge={
          ticket.ticker ? (
            <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)] ring-1 ring-[var(--border)]">
              {ticket.ticker}
              {ticket.optionType ? ` · ${ticket.optionType}` : ""}
            </span>
          ) : null
        }
      >
        <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-0.5 text-[11px] text-[var(--muted)]">
            {t("optionsChecklist.fieldTicker")}
            {tickerSelect}
          </label>
          {(
            [
              ["spot", "optionsChecklist.fieldSpot"],
              ["strike", "optionsChecklist.fieldStrike"],
              ["distancia", "optionsChecklist.fieldDist"],
              ["bid", "optionsChecklist.fieldBid"],
              ["ask", "optionsChecklist.fieldAsk"],
              ["tradePrice", "optionsChecklist.fieldTrade"],
              ["contracts", "optionsChecklist.fieldContracts"],
              ["exp", "optionsChecklist.fieldExp"],
              ["planPct", "optionsChecklist.fieldPlan"],
              ["hour", "optionsChecklist.fieldHour"],
              ["pnl", "optionsChecklist.fieldPnl"],
            ] as const
          ).map(([key, labelKey]) => (
            <label
              key={key}
              className="space-y-0.5 text-[11px] text-[var(--muted)]"
            >
              {t(labelKey)}
              <input
                className={field}
                value={ticket[key]}
                onChange={(e) => patchTicket({ [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="space-y-0.5 text-[11px] text-[var(--muted)]">
            {t("optionsChecklist.fieldType")}
            <select
              className={field}
              value={ticket.optionType}
              onChange={(e) => patchTicket({ optionType: e.target.value })}
            >
              <option value="CALL">CALL</option>
              <option value="PUT">PUT</option>
            </select>
          </label>
        </div>
      </DeskSession>

      <DeskSession
        step={2}
        title={t("optionsChecklist.requisitos")}
        hint={`${done}/${total}`}
        panel={false}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {OPTIONS_CHECKLIST_SECTIONS.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              checked={checked}
              onToggle={toggle}
            />
          ))}
        </div>
      </DeskSession>

      <DeskSession step={3} title={t("optionsChecklist.notes")} panel={false}>
        <textarea
          className="min-h-[5rem] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted)]"
          placeholder={t("optionsChecklist.notesPlaceholder")}
          value={notes}
          onChange={(e) => {
            const next = e.target.value;
            setNotes(next);
            persist({ checked, notes: next, ticket });
          }}
        />
      </DeskSession>
    </DeskStack>
  );
}
