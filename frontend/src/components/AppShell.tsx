"use client";

import { useState } from "react";

import { AdminDesk } from "@/components/AdminDesk";
import { DailyReview } from "@/components/DailyReview";
import { Dashboard } from "@/components/Dashboard";
import { JournalDesk } from "@/components/JournalDesk";
import { LanguageToggle } from "@/components/LanguageToggle";
import { LocaleProvider, useLocale } from "@/components/LocaleProvider";
import { MindDesk } from "@/components/MindDesk";
import { NewsDesk } from "@/components/NewsDesk";
import { StrategiesDesk } from "@/components/StrategiesDesk";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

type AppView =
  | "analyzer"
  | "strategies"
  | "daily"
  | "journal"
  | "mind"
  | "news"
  | "admin";

function AppShellInner() {
  const [view, setView] = useState<AppView>("daily");
  const { t } = useLocale();

  return (
    <div className="min-h-screen text-[var(--foreground)]">
      <nav className="border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-6 py-3">
          <p className="mr-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
            Maite Trading
          </p>
          {(
            [
              ["daily", "nav.daily"],
              ["journal", "nav.journal"],
              ["mind", "nav.mind"],
              ["strategies", "nav.strategies"],
              ["analyzer", "nav.analyzer"],
              ["news", "nav.news"],
              ["admin", "nav.admin"],
            ] as const
          ).map(([id, labelKey]) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--accent)] text-[var(--on-accent)]"
                    : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
                }`}
              >
                {t(labelKey)}
              </button>
            );
          })}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </nav>
      {view === "daily" ? (
        <DailyReview />
      ) : view === "journal" ? (
        <JournalDesk />
      ) : view === "mind" ? (
        <MindDesk />
      ) : view === "strategies" ? (
        <StrategiesDesk />
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

export function AppShell() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <AppShellInner />
      </LocaleProvider>
    </ThemeProvider>
  );
}
