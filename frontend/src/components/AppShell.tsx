"use client";

import { useState } from "react";

import { AboutDialog } from "@/components/AboutDialog";
import { AdminDesk } from "@/components/AdminDesk";
import { DailyReview } from "@/components/DailyReview";
import { Dashboard } from "@/components/Dashboard";
import { JournalDesk } from "@/components/JournalDesk";
import { LocaleProvider, useLocale } from "@/components/LocaleProvider";
import { MindDesk } from "@/components/MindDesk";
import { NewsDesk } from "@/components/NewsDesk";
import { OptionsChecklistDesk } from "@/components/OptionsChecklistDesk";
import { SettingsMenu } from "@/components/SettingsMenu";
import { StickyNotesDesk } from "@/components/StickyNotesDesk";
import { StrategiesDesk } from "@/components/StrategiesDesk";
import { ThemeProvider } from "@/components/ThemeProvider";
import { APP_DOCUMENT_TITLE, APP_MODE, APP_MODE_LABEL, APP_VENUE } from "@/lib/app-mode";

type AppView =
  | "analyzer"
  | "strategies"
  | "daily"
  | "journal"
  | "mind"
  | "stickyNotes"
  | "optionsChecklist"
  | "news"
  | "admin";

type StepItem = {
  kind: "step";
  step: number;
  id: AppView;
  labelKey: string;
};

type ExtraItem = {
  kind: "extra";
  id: AppView;
  labelKey: string;
};

/** Daily trading flow — stays on the primary header row. */
const FLOW: StepItem[] = [
  { kind: "step", step: 1, id: "news", labelKey: "nav.news" },
  { kind: "step", step: 2, id: "daily", labelKey: "nav.daily" },
  { kind: "step", step: 3, id: "strategies", labelKey: "nav.strategies" },
  { kind: "step", step: 4, id: "analyzer", labelKey: "nav.analyzer" },
  { kind: "step", step: 5, id: "journal", labelKey: "nav.journal" },
];

/** Reference / mindset tools — second quieter row under the flow. */
const DESK_TOOLS: ExtraItem[] = [
  { kind: "extra", id: "stickyNotes", labelKey: "nav.stickyNotes" },
  ...(APP_MODE === "options"
    ? ([
        {
          kind: "extra",
          id: "optionsChecklist",
          labelKey: "nav.optionsChecklist",
        },
      ] as ExtraItem[])
    : []),
  { kind: "extra", id: "mind", labelKey: "nav.mind" },
];

function AppShellInner() {
  const [view, setView] = useState<AppView>("news");
  const [aboutOpen, setAboutOpen] = useState(false);
  const { t } = useLocale();

  const toolActive = DESK_TOOLS.some((item) => item.id === view);

  return (
    <div className="min-h-screen text-[var(--foreground)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => setView("news")}
            className="group mr-1 flex min-w-0 items-center gap-3 rounded-lg py-1 pr-2 text-left transition hover:bg-[var(--hover)]"
            aria-label={APP_DOCUMENT_TITLE}
          >
            <span className="flex h-11 w-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-[#c9893a]/55 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/charging-bull.png"
                alt=""
                className="h-full w-full object-cover object-[50%_35%]"
              />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--foreground)] sm:text-[14px]">
                Trading Like a Boss
              </span>
              <span className="mt-0.5 inline-flex h-5 min-w-[4.75rem] items-center justify-center rounded bg-[var(--accent)] px-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--on-accent)]">
                {APP_MODE_LABEL}
              </span>
            </span>
          </button>

          <nav
            className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
            aria-label="Daily flow"
          >
            {FLOW.map((item) => {
              const active = view === item.id;
              const showArrow = item.step < 5;
              return (
                <div key={item.id} className="flex items-center gap-1">
                  <StepButton
                    step={item.step}
                    label={t(item.labelKey)}
                    active={active}
                    onClick={() => setView(item.id)}
                  />
                  {showArrow ? (
                    <span
                      className="hidden text-[var(--muted)] sm:inline"
                      aria-hidden
                    >
                      →
                    </span>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SettingsMenu
              adminActive={view === "admin"}
              onAdmin={() => setView("admin")}
              onAbout={() => setAboutOpen(true)}
            />
          </div>
        </div>

        <div
          className={`border-t border-[var(--border)] ${
            toolActive ? "bg-[var(--surface-muted)]/60" : "bg-[var(--surface)]"
          }`}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-1.5 sm:px-6">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              {t("nav.deskTools")}
            </span>
            <nav
              className="flex flex-wrap items-center gap-1"
              aria-label={t("nav.deskTools")}
            >
              {DESK_TOOLS.map((item) => {
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView(item.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      active
                        ? "bg-[var(--accent)] text-[var(--on-accent)]"
                        : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {t(item.labelKey)}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {view === "daily" ? (
        <DailyReview />
      ) : view === "journal" ? (
        <JournalDesk />
      ) : view === "mind" ? (
        <MindDesk />
      ) : view === "stickyNotes" ? (
        <StickyNotesDesk />
      ) : view === "optionsChecklist" ? (
        <OptionsChecklistDesk />
      ) : view === "strategies" ? (
        <StrategiesDesk venue={APP_VENUE} />
      ) : view === "analyzer" ? (
        <Dashboard />
      ) : view === "news" ? (
        <NewsDesk />
      ) : (
        <AdminDesk />
      )}
    </div>
  );
}

function StepButton({
  step,
  label,
  active,
  onClick,
}: {
  step: number;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-semibold transition ${
        active
          ? "bg-[var(--accent)] text-[var(--on-accent)] shadow-sm"
          : "text-[var(--foreground)] hover:bg-[var(--hover)] hover:text-[var(--accent-fg)]"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${
          active
            ? "bg-white/25 text-[var(--on-accent)]"
            : "bg-[var(--border-strong)] text-[var(--foreground)]"
        }`}
      >
        {step}
      </span>
      {label}
    </button>
  );
}

export function AppShell() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <AppShellInner />
      </LocaleProvider>
    </ThemeProvider>
  );
}
