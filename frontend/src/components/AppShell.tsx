"use client";

import { useState } from "react";

import { Dashboard } from "@/components/Dashboard";
import { NewsDesk } from "@/components/NewsDesk";
import { PremarketDesk } from "@/components/PremarketDesk";
import { Scanner } from "@/components/Scanner";

type AppView = "analyzer" | "scanner" | "premarket" | "news";

export function AppShell() {
  const [view, setView] = useState<AppView>("analyzer");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="border-b border-zinc-800/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-6 py-3">
          <p className="mr-4 text-xs uppercase tracking-[0.22em] text-emerald-400">
            Maite Trading
          </p>
          {(
            [
              ["analyzer", "Analyzer"],
              ["scanner", "Scanner"],
              ["premarket", "Premarket"],
              ["news", "News"],
            ] as const
          ).map(([id, label]) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  active
                    ? "bg-emerald-500 text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-200"
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
      ) : view === "premarket" ? (
        <PremarketDesk />
      ) : (
        <NewsDesk />
      )}
    </div>
  );
}
