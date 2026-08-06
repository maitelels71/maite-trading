"use client";

import { useState } from "react";

import { Dashboard } from "@/components/Dashboard";
import { NewsDesk } from "@/components/NewsDesk";
import { Scanner } from "@/components/Scanner";

type AppView = "analyzer" | "scanner" | "news";

export function AppShell() {
  const [view, setView] = useState<AppView>("analyzer");

  return (
    <div className="min-h-screen text-[var(--foreground)]">
      <nav className="border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-6 py-3">
          <p className="mr-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            Maite Trading
          </p>
          {(
            [
              ["analyzer", "Analyzer"],
              ["scanner", "Scanner"],
              ["news", "News"],
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
                    : "text-[var(--muted)] hover:bg-stone-100 hover:text-[var(--foreground)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </nav>
      {view === "analyzer" ? (
        <Dashboard />
      ) : view === "scanner" ? (
        <Scanner />
      ) : (
        <NewsDesk />
      )}
    </div>
  );
}
