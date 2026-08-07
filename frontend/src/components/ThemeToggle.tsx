"use client";

import { useTheme } from "@/components/ThemeProvider";
import type { ThemeMode } from "@/lib/theme";

const OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="ml-auto flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-0.5"
      role="group"
      aria-label="Theme"
    >
      {OPTIONS.map(({ id, label }) => {
        const active = theme === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
