"use client";

import { useState } from "react";

import { AdminDesk } from "@/components/AdminDesk";
import { DailyReview } from "@/components/DailyReview";
import { Dashboard } from "@/components/Dashboard";
import { MindDesk } from "@/components/MindDesk";
import { NewsDesk } from "@/components/NewsDesk";
import { StrategiesDesk } from "@/components/StrategiesDesk";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

type AppView =
  | "analyzer"
  | "strategies"
  | "daily"
  | "mind"
  | "news"
  | "admin";

export function AppShell() {
  const [view, setView] = useState<AppView>("daily");

  return (
    <ThemeProvider>
      <div className="min-h-screen text-[var(--foreground)]">
        <nav className="border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-6 py-3">
            <p className="mr-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              Maite Trading
            </p>
            {(
              [
                ["daily", "Daily"],
                ["mind", "Mind"],
                ["strategies", "Strategies"],
                ["analyzer", "Analyzer"],
                ["news", "News"],
                ["admin", "Admin"],
              ] as const
            ).map(([id, label]) => {
              const active = view === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
            <ThemeToggle />
          </div>
        </nav>
        {view === "daily" ? (
          <DailyReview />
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
    </ThemeProvider>
  );
}
